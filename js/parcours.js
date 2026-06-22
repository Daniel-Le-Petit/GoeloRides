/**
 * GoëloRides — parcours.js
 *
 * Corrections inscription :
 *  - isJoined() : SELECT user_id + canceled_at IS NULL, puis RPC
 *    signup_get_registration (SECURITY DEFINER) si RLS bloque le direct
 *  - renderJoin() : état bouton basé uniquement sur isJoined(), pas sur
 *    sortie.participants
 *  - waitForAuthReady() avant le premier renderJoin (session hydratée)
 *  - goelo:role-ready sans { once:true } pour resync après auth tardive
 *  - bindJoin() appelé une seule fois après renderAll(), guard dataset.bound
 *  - bindAccordions() appelée avec typeof guard (fonction externe optionnelle)
 *  - pd-participants-count synchronisé avec renderParticipants()
 *  - initMap() ne plante plus si L absent (Leaflet chargé en dernier)
 */
(function () {
  "use strict";

  var sortie    = null;
  var _joinBusy = false;

  /* =========================================================
     HELPERS
  ========================================================= */
  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  function setLoading(v) {
    var el = document.getElementById("loading");
    if (el) el.style.display = v ? "block" : "none";
  }

  function setText(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v != null ? v : "";
  }

  function escapeHtml(s) {
    return String(s != null ? s : "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* =========================================================
     AUTH
  ========================================================= */
  async function getUser() {
    var sb = getSb();
    if (!sb) return null;

    /* Session locale d'abord (évite la course avec resolveRole au chargement) */
    var sessionResult = await sb.auth.getSession();
    var sessionUser = sessionResult.data && sessionResult.data.session
      ? sessionResult.data.session.user
      : null;
    if (sessionUser) return sessionUser;

    var result = await sb.auth.getUser();
    return (result.data && result.data.user) ? result.data.user : null;
  }

  /**
   * État inscrit = vérité Supabase uniquement (pas sortie.participants).
   * 1. SELECT signups (user_id + canceled_at IS NULL) si RLS le permet
   * 2. Sinon RPC signup_get_registration (SECURITY DEFINER, contourne RLS)
   */
  async function isJoined(routeId, user) {
    var sb = getSb();
    if (!sb || !routeId || !user || !user.id) return false;

    var direct = await sb
      .from("signups")
      .select("id")
      .eq("route_id", routeId)
      .eq("user_id", user.id)
      .is("canceled_at", null)
      .maybeSingle();

    if (direct.error) {
      console.warn("[isJoined] direct signups:", direct.error.message, direct.error.code);
    } else if (direct.data) {
      return true;
    }

    /* RPC user_id (auth.uid()) — si migration signup_is_joined appliquée */
    var rpcUser = await sb.rpc("signup_is_joined", { p_route_id: routeId });
    if (!rpcUser.error && rpcUser.data && typeof rpcUser.data === "object") {
      if (rpcUser.data.joined === true) return true;
      if (rpcUser.data.joined === false && !direct.error) return false;
    } else if (rpcUser.error && rpcUser.error.code !== "PGRST202") {
      console.warn("[isJoined] signup_is_joined:", rpcUser.error.message);
    }

    /* Fallback RPC email (legacy signups ou RLS bloquant le SELECT direct) */
    var email = (user.email || "").trim().toLowerCase();
    if (!email) return false;

    var rpc = await sb.rpc("signup_get_registration", {
      p_route_id: routeId,
      p_email: email
    });

    if (rpc.error) {
      console.warn("[isJoined] signup_get_registration:", rpc.error.message);
      return false;
    }

    var payload = rpc.data;
    if (payload && typeof payload === "object") {
      return payload.registered === true;
    }
    return false;
  }

  /* =========================================================
     TOGGLE RPC
  ========================================================= */


async function toggleSignup(routeId) {
  const sb = getSb();

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
      console.warn("No session");
      return null;
    }

    const { data, error } = await sb.rpc("toggle_signup", {
      p_route_id: routeId
    });

    if (error) throw error;

    return data;

  } catch (e) {
    console.error("[toggleSignup]", e);
    return null;

  }
}

  /* =========================================================
     RENDER JOIN BUTTON
     Appelé :
       1. après renderAll() — état initial
       2. sur goelo:role-ready — auth tardive
       3. sur goelo:auth-success — connexion depuis la modale
       4. après erreur dans le handler — rollback UI
  ========================================================= */
  async function renderJoin() {
    if (!sortie || !sortie.id) return;

    var btn   = document.getElementById("pd-join-btn");
    var count = document.getElementById("pd-join-count");
    if (!btn) return;

    var user = await getUser();

    if (!user) {
      /* Visiteur : bouton actif qui ouvre la modale auth */
      btn.textContent = "Se connecter pour participer";
      btn.disabled    = false;
      btn.setAttribute("data-joined",       "0");
      btn.setAttribute("data-auth-pending", "1");
      return;
    }

    btn.setAttribute("data-auth-pending", "0");
    var joined = await isJoined(sortie.id, user);
    btn.disabled    = false;
    btn.textContent = joined ? "J'annule" : "Je participe !";
    btn.setAttribute("data-joined", joined ? "1" : "0");

    if (count) {
      var n = await getParticipantCount(sortie.id);
      count.textContent = n > 0
        ? n + " participant" + (n > 1 ? "s" : "")
        : "";
    }
  }

  /* =========================================================
     BIND BUTTON — attaché une seule fois via dataset.bound
  ========================================================= */
  function bindJoin() {
    var btn = document.getElementById("pd-join-btn");
    if (!btn) return;
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", async function () {
      if (_joinBusy) return;

      /* Visiteur → ouvrir modale auth */
      if (btn.getAttribute("data-auth-pending") === "1") {
        if (typeof window.openGoeloAuth === "function") window.openGoeloAuth();
        return;
      }

      _joinBusy    = true;
      btn.disabled = true;

      try {
        var user = await getUser();
        if (!user) {
          /* Session expirée entre le render et le clic */
          if (typeof window.openGoeloAuth === "function") window.openGoeloAuth();
          return;
        }

        if (!sortie || !sortie.id) throw new Error("Identifiant sortie manquant");

        var res = await toggleSignup(sortie.id);
        if (!res || !res.action) throw new Error("Réponse toggle_signup invalide");
        /* res = { action: "joined"|"unjoined", count: number } */

        btn.textContent = res.action === "joined" ? "J'annule" : "Je participe !";
        btn.setAttribute("data-joined", res.action === "joined" ? "1" : "0");

        var count = document.getElementById("pd-join-count");
        if (count && typeof res.count === "number") {
          count.textContent = res.count > 0
            ? res.count + " participant" + (res.count > 1 ? "s" : "")
            : "";
        }

        /* Rafraîchir la liste en arrière-plan */
        refreshParticipants().then(function () { renderParticipants(); });

      } catch (err) {
        console.error("[JOIN]", err);
        await renderJoin(); /* rollback UI sur l'état réel DB */
      } finally {
        _joinBusy    = false;
        btn.disabled = false;
      }
    });
  }

  /* =========================================================
     PARTICIPANTS (RPC — pas de SELECT direct sur signups)
  ========================================================= */
  async function getParticipantCount(routeId) {
    var sb = getSb();
    if (!sb || !routeId) return 0;
    var rpc = await sb.rpc("signup_list_all_names", {});
    if (rpc.error || rpc.data == null) {
      console.warn("[PARTICIPANTS] signup_list_all_names:", rpc.error && rpc.error.message);
      return Array.isArray(sortie && sortie.participants) ? sortie.participants.length : 0;
    }
    var data = rpc.data;
    var bucket = data && data[routeId];
    if (!bucket) return 0;
    if (Array.isArray(bucket)) return bucket.length;
    if (bucket.participants && Array.isArray(bucket.participants)) return bucket.participants.length;
    return 0;
  }

  async function refreshParticipants() {
    var sb = getSb();
    if (!sb || !sortie || !sortie.id) return;
    var rpc = await sb.rpc("signup_list_all_names", {});
    if (rpc.error || rpc.data == null) {
      console.error("[PARTICIPANTS]", rpc.error);
      return;
    }
    var bucket = rpc.data[sortie.id];
    var names = [];
    if (Array.isArray(bucket)) {
      names = bucket;
    } else if (bucket && Array.isArray(bucket.participants)) {
      names = bucket.participants;
    }
    sortie.participants = names.map(function (n) {
      if (typeof n === "string") return { pseudo: n };
      if (n && typeof n === "object") return n;
      return { pseudo: String(n) };
    });
  }

  function avatarColor(seed, i) {
    var colors = ["#C8F135", "#7DD3FC", "#FCA5A5", "#FCD34D", "#C4B5FD"];
    return colors[(String(seed || "").length + i) % colors.length];
  }

  function renderParticipants() {
    var host  = document.getElementById("pd-participants");
    var badge = document.getElementById("pd-participants-count");
    if (!sortie) return;

    var list = sortie.participants || [];

    if (badge) badge.textContent = list.length > 0 ? "(" + list.length + ")" : "";

    renderHeroPeople(list);

    if (!host) return;
    if (list.length === 0) {
      host.innerHTML = "<li style=\"color:var(--muted);font-size:.82rem\">Aucun participant pour l'instant.</li>";
      return;
    }
    host.innerHTML = list.map(function (p, i) {
      var label    = escapeHtml(p.pseudo || p.email || "?");
      var initials = label.slice(0, 2).toUpperCase();
      return "<li>" +
        "<span class=\"so-avatar\" style=\"background:" + avatarColor(p.email || p.pseudo, i) + "\">" +
        initials + "</span>" +
        "<span>" + label + "</span>" +
        "</li>";
    }).join("");
  }

  /* =========================================================
     HERO
  ========================================================= */
  var MONTH_CAL = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  var WEEKDAY_CAL = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  function parseSortieDate(iso, timeStr) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return null;
    var p = String(iso).trim().split("-");
    var hh = 8;
    var mm = 30;
    if (timeStr && /^\d{2}:\d{2}$/.test(String(timeStr).trim())) {
      var t = String(timeStr).trim().split(":");
      hh = parseInt(t[0], 10) || 8;
      mm = parseInt(t[1], 10) || 0;
    }
    return new Date(+p[0], +p[1] - 1, +p[2], hh, mm);
  }

  function frDateFull(d, timeStr) {
    if (!d) return "Date à préciser";
    var label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(d);
    label = label.charAt(0).toUpperCase() + label.slice(1);
    var t = timeStr && String(timeStr).trim() ? String(timeStr).trim().replace(":", "h") : "";
    if (!t && d) {
      t = String(d.getHours()) + "h" + String(d.getMinutes()).padStart(2, "0");
    }
    return t ? label + " · " + t : label;
  }

  function typeLabelFromSortie(s) {
    var rt = String(s.raceType || s.type || "").toLowerCase();
    if (rt === "gravel") return "Gravel";
    if (rt === "vtt" || rt === "rtt") return "VTT";
    return "Route";
  }

  function renderHeroPeople(list) {
    var wrap  = document.getElementById("pd-hero-people");
    var av    = document.getElementById("pd-hero-avatars");
    var text  = document.getElementById("pd-hero-people-text");
    if (!wrap || !av || !text) return;
    if (!list.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var shown = list.slice(0, 5);
    av.innerHTML = shown.map(function (p, i) {
      var label = String(p.pseudo || p.email || "?");
      var initials = label.slice(0, 2).toUpperCase();
      return '<span class="so-avatar" style="background:' + avatarColor(p.email || p.pseudo, i) + '">' +
        escapeHtml(initials) + "</span>";
    }).join("");
    var more = list.length - shown.length;
    text.textContent = list.length + " participant" + (list.length > 1 ? "s" : "") +
      (more > 0 ? " (+" + more + " autres)" : "");
  }

  function renderHero() {
    if (!sortie) return;
    document.title = sortie.title + " \u2014 Go\u00ebloRides";

    var d = parseSortieDate(sortie.date, sortie.rideTime || sortie.meetTime);
    if (d) {
      setText("pd-cal-month", MONTH_CAL[d.getMonth() + 1]);
      setText("pd-cal-day",   String(d.getDate()));
      setText("pd-cal-wd",    WEEKDAY_CAL[d.getDay()]);
    }
    setText("pd-datetime", frDateFull(d, sortie.rideTime || sortie.meetTime));

    setText("pd-title", sortie.title);

    var cap = document.getElementById("pd-captain");
    if (cap) {
      cap.innerHTML = sortie.captain
        ? 'Capitaine · Team Rider : <strong>' + escapeHtml(sortie.captain) + "</strong>"
        : "";
    }

    var sport = typeLabelFromSortie(sortie);
    setText("pd-metric-sport", "\uD83D\uDEB4 " + sport);
    setText("pd-metric-group", sortie.group || "—");
    setText("pd-km",           sortie.km || "—");
    setText("pd-dplus",        sortie.dplus || "—");
    setText("pd-meet",         sortie.meetTime || "—");
    setText("pd-start",        sortie.startTime || "—");
    setText("pd-duration",     sortie.duration || "—");
    setText("pd-place",        sortie.place || "—");

    renderHeroPeople(sortie.participants || []);
  }

  /* =========================================================
     MAP
  ========================================================= */
  function initMap() {
    if (!sortie) return;
    if (typeof L === "undefined") {
      /* Leaflet pas encore chargé — retry à window.load */
      window.addEventListener("load", function () { initMap(); }, { once: true });
      return;
    }
    var el = document.getElementById("pd-map");
    if (!el) return;
    if (el._leaflet_id) return; /* déjà initialisé */

    var map = L.map(el).setView([48.6, -2.8], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);

    var fitBtn = document.getElementById("pd-map-fit");
    if (fitBtn) {
      fitBtn.addEventListener("click", function () { map.setView([48.6, -2.8], 10); });
    }
  }

  /* =========================================================
     RENDER ALL
  ========================================================= */
  async function renderAll() {
    renderHero();
    renderParticipants();
    bindJoin();
    await renderJoin();
    if (typeof bindAccordions === "function") bindAccordions();
  }

  /* =========================================================
     INIT
  ========================================================= */
  function waitForAuthReady() {
    return new Promise(function (resolve) {
      var sb = getSb();
      if (!sb) {
        resolve();
        return;
      }
      sb.auth.getSession().then(function (sessionResult) {
        if (sessionResult.data && sessionResult.data.session) {
          resolve();
          return;
        }
        if (window.GOELO_USER) {
          resolve();
          return;
        }
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          window.removeEventListener("goelo:role-ready", onReady);
          clearTimeout(timer);
          resolve();
        }
        function onReady() { finish(); }
        window.addEventListener("goelo:role-ready", onReady);
        var timer = setTimeout(finish, 2500);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      setLoading(true);

      var id = new URLSearchParams(location.search).get("id");
      if (!id) throw new Error("Param\u00e8tre id manquant dans l'URL");

      var sb = getSb();
      if (!sb) throw new Error("Supabase non initialis\u00e9");

      /* Laisser auth.js hydrater la session avant de lire l'état inscrit */
      await waitForAuthReady();

      var result = await sb
        .from("routes")
        .select("*")
        .eq("id", id)
        .single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Sortie introuvable");

      var fc = result.data.front_config || {};
      if (typeof fc === "string") {
        try { fc = JSON.parse(fc); } catch (e) { fc = {}; }
      }

      var stats = fc.stats || {};

      sortie = {
        id:        result.data.id,
        title:     result.data.track_name   || "Sortie",
        group:     result.data.group_label  || "",
        type:      result.data.route_kind   || "",
        raceType:  fc.raceType              || "",
        place:     fc.meetPlace             || "",
        date:      fc.rideDateIso           || "",
        rideTime:  fc.rideTime              || fc.meetTime || "",
        captain:   fc.captain || fc.rideLeader || "",
        km:        stats.totalKm   != null ? stats.totalKm   + " km"   : (fc.km    != null ? fc.km    + " km"   : "\u2014"),
        dplus:     stats.elevGainM != null ? stats.elevGainM + " m D+" : (fc.dplus != null ? fc.dplus + " m D+" : "\u2014"),
        duration:  fc.estimatedDurationHm   || fc.estimated_duration_hm || "",
        meetTime:  fc.meetTime              || "",
        startTime: fc.startTime || fc.rideTime || "",
        participants: []
      };

      await refreshParticipants();
      await renderAll();
      initMap(); /* guard interne si Leaflet pas encore dispo */

    } catch (err) {
      console.error("[parcours.js]", err);
      var errEl = document.getElementById("error");
      if (errEl) errEl.textContent = err.message;
    } finally {
      setLoading(false);
    }

    /* Re-synchroniser le bouton dès que le rôle / la session est confirmé */
    window.addEventListener("goelo:role-ready", function () {
      renderJoin();
    });

    window.addEventListener("goelo:auth-success", function () {
      renderJoin();
    });
  });

})();
