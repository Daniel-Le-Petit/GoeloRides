/**
 * GoëloRides — parcours.js
 *
 * Corrections :
 *  - renderJoin() rappelé sur goelo:role-ready (bouton ne reste plus sur
 *    "Connexion requise" quand auth.js finit après parcours.js)
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
    var result = await sb.auth.getUser();
    return (result.data && result.data.user) ? result.data.user : null;
  }

  /* =========================================================
     JOIN STATE
  ========================================================= */
  async function isJoined(routeId, userId) {
    var sb = getSb();
    if (!sb || !routeId || !userId) return false;
    var result = await sb
      .from("signups")
      .select("id")
      .eq("route_id", routeId)
      .eq("user_id", userId)
      .is("canceled_at", null)
      .maybeSingle();
    return !!(result.data);
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
    var joined = await isJoined(sortie.id, user.id);
    btn.disabled    = false;
    btn.textContent = joined ? "J'annule" : "Je participe !";
    btn.setAttribute("data-joined", joined ? "1" : "0");

    if (count) {
      var n = Array.isArray(sortie.participants) ? sortie.participants.length : 0;
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
     PARTICIPANTS
  ========================================================= */
  async function refreshParticipants() {
    var sb = getSb();
    if (!sb || !sortie || !sortie.id) return;
    var result = await sb
      .from("signups")
      .select("id, pseudo, email, cyclist_level, created_at")
      .eq("route_id", sortie.id)
      .is("canceled_at", null)
      .order("created_at", { ascending: true });
    if (result.error) {
      console.error("[PARTICIPANTS]", result.error);
      return;
    }
    sortie.participants = result.data || [];
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
  function renderHero() {
    if (!sortie) return;
    document.title = sortie.title + " \u2014 Go\u00ebloRides";
    setText("pd-title",   sortie.title);
    setText("pd-group",   sortie.group);
    setText("pd-type",    sortie.type);
    setText("pd-place",   sortie.place);
    setText("pd-date",    sortie.date);
    setText("pd-captain", sortie.captain);
    setText("pd-km",      sortie.km);
    setText("pd-dplus",   sortie.dplus);
    setText("pd-meet",    sortie.meetTime);
    setText("pd-start",   sortie.startTime);
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
  document.addEventListener("DOMContentLoaded", async function () {
    try {
      setLoading(true);

      var id = new URLSearchParams(location.search).get("id");
      if (!id) throw new Error("Param\u00e8tre id manquant dans l'URL");

      var sb = getSb();
      if (!sb) throw new Error("Supabase non initialis\u00e9");

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
        place:     fc.meetPlace             || "",
        date:      fc.rideDateIso           || "",
        captain:   fc.captain || fc.rideLeader || "",
        km:        stats.totalKm   != null ? stats.totalKm   + " km"   : (fc.km    != null ? fc.km    + " km"   : "\u2014"),
        dplus:     stats.elevGainM != null ? stats.elevGainM + " m D+" : (fc.dplus != null ? fc.dplus + " m D+" : "\u2014"),
        meetTime:  fc.meetTime  || fc.rideTime || "",
        startTime: fc.startTime || "",
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

    /* ── FIX PRINCIPAL ───────────────────────────────────────
     * auth.js résout le rôle de manière asynchrone (getSession
     * + getUser + SELECT profiles). Si cette résolution se
     * termine APRÈS que renderJoin() a déjà tourné, le bouton
     * reste figé sur "Se connecter" même pour un user connecté.
     *
     * Solution : écouter goelo:role-ready { once:true } et
     * goelo:auth-success { once:true } pour re-rendre le bouton
     * dès que l'auth est confirmée.
     * ───────────────────────────────────────────────────────── */
    window.addEventListener("goelo:role-ready", function () {
      renderJoin();
    }, { once: true });

    window.addEventListener("goelo:auth-success", function () {
      renderJoin();
    }, { once: true });
  });

})();
