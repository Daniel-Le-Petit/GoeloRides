/**
 * GoëloRides — parcours.js
 *
 * Corrections inscription :
 *  - isJoined() : dernière action user_id+route_id ; actif si
 *    status='joined' (ou 'waiting') ET canceled_at IS NULL
 *  - renderJoin() : état bouton basé uniquement sur isJoined(), pas sur
 *    sortie.participants ni sur l'existence d'une ancienne ligne
 *  - waitForAuthReady() avant le premier renderJoin (session hydratée)
 *  - goelo:role-ready sans { once:true } pour resync après auth tardive
 *  - bindJoin() appelé une seule fois après renderAll(), guard dataset.bound
 *  - bindAccordions() dans parcours.js (toggle .is-open + max-height panneau)
 *  - pd-participants-count synchronisé avec renderParticipants()
 *  - initMap() ne plante plus si L absent (Leaflet chargé en dernier)
 */
(function () {
  "use strict";

  var sortie    = null;
  var _joinBusy = false;
  var pdMap     = null;
  var pdBounds  = null;
  var _openedInfoSections = {};

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
   * Inscription active = dernière action pour (user_id, route_id) avec
   * status='joined' ET canceled_at IS NULL.
   * Liste d'attente : status='waiting' + canceled_at IS NULL → bouton "J'annule".
   * Une ancienne ligne joined ne compte plus si la dernière action est cancelled.
   */
  function isActiveSignupRow(row) {
    if (!row) return false;
    if (row.canceled_at != null) return false;
    return row.status === "joined" || row.status === "waiting";
  }

  async function isJoined(routeId, user) {
    var sb = getSb();
    if (!sb || !routeId || !user || !user.id) return false;

    var direct = await sb
      .from("signups")
      .select("id,status,canceled_at,created_at")
      .eq("route_id", routeId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (direct.error) {
      console.warn("[isJoined] direct signups:", direct.error.message, direct.error.code);
    } else if (direct.data) {
      return isActiveSignupRow(direct.data);
    }

    var rpcUser = await sb.rpc("signup_is_joined", { p_route_id: routeId });
    if (!rpcUser.error && rpcUser.data && typeof rpcUser.data === "object") {
      /* registered = joined|waiting (après migration latest-action) */
      if (typeof rpcUser.data.registered === "boolean") {
        return rpcUser.data.registered === true;
      }
      return rpcUser.data.joined === true;
    }
    if (rpcUser.error && rpcUser.error.code !== "PGRST202") {
      console.warn("[isJoined] signup_is_joined:", rpcUser.error.message);
    }

    return false;
  }

  /* =========================================================
     TOGGLE RPC
  ========================================================= */

  /** Normalise la réponse RPC (objet, tableau d'un objet, ou JSON string). */
  function normalizeTogglePayload(data) {
    if (data == null) return null;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return null; }
    }
    if (Array.isArray(data)) data = data.length ? data[0] : null;
    if (!data || typeof data !== "object") return null;
    return data;
  }

  function toggleActionKind(action) {
    var a = String(action == null ? "" : action).trim().toLowerCase();
    if (a === "added" || a === "joined") return "added";
    if (a === "removed" || a === "unjoined") return "removed";
    return "";
  }

  function setJoinFeedback(message) {
    var host = document.querySelector(".pd-join");
    if (!host) return;
    var el = document.getElementById("pd-join-feedback");
    if (!el) {
      el = document.createElement("p");
      el.id = "pd-join-feedback";
      el.className = "pd-join__feedback";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      host.appendChild(el);
    }
    el.textContent = message || "";
  }

  function applyJoinButtonState(btn, isJoined) {
    if (!btn) return;
    btn.disabled = false;
    btn.setAttribute("data-auth-pending", "0");
    btn.setAttribute("data-joined", isJoined ? "1" : "0");
    if (isJoined) {
      btn.classList.add("is-registered");
      btn.textContent = "Inscrit";
    } else {
      btn.classList.remove("is-registered");
      btn.textContent = "Je participe !";
    }
  }

async function toggleSignup(routeId) {
  var sb = getSb();
  if (!sb) {
    console.error("[toggleSignup] client Supabase indisponible");
    return null;
  }

  try {
    var sessionResult = await sb.auth.getSession();
    if (!sessionResult.data || !sessionResult.data.session) {
      console.warn("[toggleSignup] pas de session");
      return null;
    }

    var rpc = await sb.rpc("toggle_signup", { p_route_id: routeId });

    if (rpc.error) {
      console.error("[toggleSignup] RPC error:", rpc.error.message || rpc.error);
      return null;
    }

    var data = normalizeTogglePayload(rpc.data);
    console.log("[toggleSignup] data:", data);

    if (!data) {
      console.warn("[toggleSignup] réponse vide ou invalide:", rpc.data);
      return null;
    }

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
      btn.classList.remove("is-registered");
      btn.textContent = "Se connecter pour participer";
      btn.disabled    = false;
      btn.setAttribute("data-joined",       "0");
      btn.setAttribute("data-auth-pending", "1");
      return;
    }

    btn.setAttribute("data-auth-pending", "0");
    /* Dernière action seule : si cancelled → "Je participe !", sinon "Inscrit" */
    var joined = await isJoined(sortie.id, user);
    applyJoinButtonState(btn, joined);

    if (count) {
      var n = Array.isArray(sortie.participants) ? sortie.participants.length : 0;
      if (!n) n = await refreshParticipants();
      updateJoinCount(n);
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
        if (window.GoeloActivity && sortie) {
          window.GoeloActivity.logEvent(
            null,
            window.GoeloActivity.EVENT_TYPES.RIDE_PARTICIPATE_CLICKED,
            { route_id: sortie.id, route_title: sortie.title },
            { route_id: sortie.id, route_title: sortie.title }
          );
        }
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

        if (btn.getAttribute("data-joined") === "0") {
          if (window.GoeloActivity) {
            window.GoeloActivity.logEvent(
              null,
              window.GoeloActivity.EVENT_TYPES.RIDE_PARTICIPATE_CLICKED,
              { route_id: sortie.id, route_title: sortie.title },
              { route_id: sortie.id, route_title: sortie.title }
            );
          }
        }

        var res = normalizeTogglePayload(await toggleSignup(sortie.id));
        console.log("[JOIN] toggle_signup réponse:", res);

        /* Compat ancienne RPC : already_registered → désinscription réussie */
        if (res && res.ok === false && res.error === "already_registered") {
          console.warn("[JOIN] already_registered → traité comme removed");
          res = { ok: true, action: "removed", joined: false, count: res.count };
        }

        if (!res || res.ok !== true) {
          console.error("[JOIN] toggle_signup:", res);
          throw new Error((res && res.error) ? String(res.error) : "Réponse toggle_signup invalide");
        }

        var kind = toggleActionKind(res.action);
        /* joined:false après suppression = état non inscrit (même si action absente) */
        if (!kind && res.joined === false) kind = "removed";
        if (!kind && res.joined === true) kind = "added";

        if (kind === "added") {
          console.log("[JOIN] added");
          applyJoinButtonState(btn, true);
          setJoinFeedback("Tu es inscrit·e à cette sortie.");
          await syncParticipantsUI();
          if (typeof res.count === "number") updateJoinCount(res.count);
          console.log("[JOIN] UI refreshed");
        } else if (kind === "removed") {
          console.log("[JOIN] removed");
          applyJoinButtonState(btn, false);
          setJoinFeedback("Tu es désinscrit·e de cette sortie.");
          /* joined: false → rafraîchir la liste sans cet utilisateur */
          await syncParticipantsUI();
          if (typeof res.count === "number") updateJoinCount(res.count);
          console.log("[JOIN] UI refreshed");
        } else {
          console.error("[JOIN] action inconnue (ni added ni removed):", res);
          throw new Error("Réponse toggle_signup action inconnue: " + String(res.action));
        }

        if (window.GoeloSignupParticipants) {
          window.GoeloSignupParticipants.emitChanged(
            sortie.id,
            typeof res.count === "number" ? res.count : (sortie.participants || []).length
          );
        }

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
  function participantLabel(p) {
    if (window.GoeloSignupParticipants) {
      return window.GoeloSignupParticipants.displayName(p);
    }
    if (window.GoeloProfile && window.GoeloProfile.getParticipantLabel) {
      return window.GoeloProfile.getParticipantLabel(p);
    }
    if (window.GoeloProfile) {
      return window.GoeloProfile.getDisplayName(p);
    }
    return "?";
  }

  async function refreshParticipants() {
    if (!sortie || !sortie.id) return 0;
    var SP = window.GoeloSignupParticipants;
    if (!SP) {
      console.warn("[parcours] GoeloSignupParticipants manquant");
      return 0;
    }
    var result = await SP.fetchForRoute(sortie.id, getSb());
    sortie.participants = result.participants || [];
    return typeof result.count === "number" ? result.count : sortie.participants.length;
  }

  function updateJoinCount(n) {
    var count = document.getElementById("pd-join-count");
    if (!count) return;
    count.textContent = n > 0
      ? n + " participant" + (n > 1 ? "s" : "")
      : "";
  }

  function renderParticipants() {
    var host  = document.getElementById("pd-participants");
    var badge = document.getElementById("pd-participants-count");
    if (!sortie) return;

    var list = sortie.participants || [];
    var SP = window.GoeloSignupParticipants;

    if (badge) badge.textContent = list.length > 0 ? "(" + list.length + ")" : "";

    renderHeroPeople(list);
    updateJoinCount(list.length);

    if (!host) return;
    if (SP) {
      host.innerHTML = SP.renderParticipantsListHtml(list, {
        emptyMsg: "Aucun participant pour l'instant."
      });
      return;
    }
    if (list.length === 0) {
      host.innerHTML = "<li class=\"pd-participants__empty\">Aucun participant pour l'instant.</li>";
      return;
    }
    host.innerHTML = list.map(function (p, i) {
      var label = escapeHtml(participantLabel(p));
      var GP = window.GoeloProfile;
      var color = GP ? GP.avatarColor(p, i) : "#7DD3FC";
      var inits = GP && GP.getParticipantInitials
        ? GP.getParticipantInitials(p)
        : (GP ? GP.initials(p) : label.slice(0, 2).toUpperCase());
      return "<li class=\"go-participant-row\">" +
        "<span class=\"go-participant-row__avatar\" style=\"background:" + color + "\">" +
        inits + "</span>" +
        "<span class=\"go-participant-row__name\">" + label + "</span>" +
        "</li>";
    }).join("");
  }

  async function syncParticipantsUI() {
    var n = await refreshParticipants();
    renderParticipants();
    return n;
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

  function displayMetric(val, suffix) {
    if (val == null || val === "" || val === "\u2014" || val === "—") {
      return "Non renseigné";
    }
    return suffix ? String(val) + suffix : String(val);
  }

  function groupKeyFromLabel(group) {
    var g = String(group || "").toLowerCase();
    if (g.indexOf("blanc") >= 0) return "blanc";
    if (g.indexOf("vert") >= 0) return "vert";
    if (g.indexOf("bleu") >= 0) return "bleu";
    if (g.indexOf("rouge") >= 0) return "rouge";
    return "vert";
  }

  function routeLineColor(s) {
    var niveau = String(s.niveau || "").toLowerCase();
    if (niveau === "debutant") return "#22C55E";
    if (niveau === "intermediaire") return "#F59E0B";
    if (niveau === "confirme") return "#EF4444";
    var map = { blanc: "#22C55E", vert: "#22C55E", bleu: "#F59E0B", rouge: "#EF4444" };
    return map[s.groupKey] || "#C8F135";
  }

  function normalizeEmbeddedPoints(points) {
    if (!Array.isArray(points) || !points.length) return [];
    return points.map(function (p) {
      if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
      if (p && typeof p === "object") {
        return [Number(p.lat), Number(p.lon != null ? p.lon : p.lng)];
      }
      return null;
    }).filter(function (ll) {
      return ll && !isNaN(ll[0]) && !isNaN(ll[1]);
    });
  }

  async function loadGpxLatLngs(fileRef) {
    var url = window.GoeloGpx
      ? window.GoeloGpx.resolveGpxUrl(fileRef, getSb())
      : fileRef;
    if (!url) return [];
    try {
      var res = await fetch(url);
      if (!res.ok) {
        console.warn("[parcours] GPX introuvable:", url, res.status);
        return [];
      }
      var xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      var pts = Array.from(xml.querySelectorAll("trkpt"));
      return pts.map(function (p) {
        return [parseFloat(p.getAttribute("lat")), parseFloat(p.getAttribute("lon"))];
      }).filter(function (ll) {
        return !isNaN(ll[0]) && !isNaN(ll[1]);
      });
    } catch (e) {
      console.warn("[parcours] erreur chargement GPX:", e);
      return [];
    }
  }

  function renderCities() {
    var ul = document.getElementById("pd-cities");
    if (!ul || !sortie) return;
    var cities = sortie.routeCities || [];
    if (!cities.length && sortie.city) cities = [sortie.city];
    if (!cities.length) {
      ul.innerHTML = '<li class="pd-cities__empty">Non renseigné</li>';
      return;
    }
    ul.innerHTML = cities.map(function (c) {
      return "<li>" + escapeHtml(c) + "</li>";
    }).join("");
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
    var SP = window.GoeloSignupParticipants;
    if (SP) {
      av.innerHTML = SP.renderAvatarStackHtml(list, { max: 5 });
    } else {
      var shown = list.slice(0, 5);
      av.innerHTML = shown.map(function (p, i) {
        var label = participantLabel(p);
        var GP = window.GoeloProfile;
        var color = GP ? GP.avatarColor(p, i) : "#7DD3FC";
        var inits = GP && GP.getParticipantInitials
        ? GP.getParticipantInitials(p)
        : (GP ? GP.initials(p) : label.slice(0, 2).toUpperCase());
        return '<span class="so-avatar" style="background:' + color + '">' +
          escapeHtml(inits) + "</span>";
      }).join("");
    }
    var more = list.length - Math.min(list.length, 5);
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
        ? 'Capitaine : <strong>' + escapeHtml(sortie.captain) + "</strong>"
        : "";
    }

    var sport = typeLabelFromSortie(sortie);
    setText("pd-metric-sport", "\uD83D\uDEB4 " + sport);
    setText("pd-metric-group", sortie.group || "Non renseigné");
    setText("pd-km",           displayMetric(sortie.kmRaw, " km"));
    setText("pd-dplus",        displayMetric(sortie.dplusRaw, " m D+"));
    setText("pd-meet",         displayMetric(sortie.meetTime));
    setText("pd-start",        displayMetric(sortie.startTime));
    setText("pd-duration",     displayMetric(sortie.duration));
    setText("pd-place",        displayMetric(sortie.place));

    renderHeroPeople(sortie.participants || []);
  }

  function renderWeatherCard() {
    var section = document.getElementById("pd-weather-section");
    var host = document.getElementById("pd-weather-card");
    if (!section || !host || !window.GoeloWeather) return;
    section.hidden = false;
    host.innerHTML = window.GoeloWeather.cardHtml(sortie.weather);
  }

  async function loadWeather() {
    if (!sortie || !window.GoeloWeather) return;
    var section = document.getElementById("pd-weather-section");
    var host = document.getElementById("pd-weather-card");
    if (section) section.hidden = false;
    if (host) {
      host.innerHTML = '<div class="go-wx-card go-wx-card--na"><p class="go-wx-card__unavailable">' +
        escapeHtml(window.GoeloWeather.t("loading")) + "</p></div>";
    }
    sortie.weather = await window.GoeloWeather.getWeatherForSortie(sortie);
    renderWeatherCard();
  }

  /* =========================================================
     MAP
  ========================================================= */
  async function initMap() {
    if (!sortie) return;
    if (typeof L === "undefined") {
      window.addEventListener("load", function () { initMap(); }, { once: true });
      return;
    }
    var el = document.getElementById("pd-map");
    if (!el) return;

    var latlngs = normalizeEmbeddedPoints(sortie.embeddedPoints);
    if (!latlngs.length && sortie.gpxFile) {
      console.log("[parcours] embeddedPoints vides, tentative GPX:", sortie.gpxFile);
      latlngs = await loadGpxLatLngs(sortie.gpxFile);
    }
    if (!latlngs.length) {
      console.warn("[parcours] Aucun tracé (embeddedPoints / GPX manquants)");
    }

    if (!pdMap) {
      pdMap = L.map(el, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "\u00a9 OpenStreetMap"
      }).addTo(pdMap);
    } else {
      pdMap.eachLayer(function (layer) {
        if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
          pdMap.removeLayer(layer);
        }
      });
    }

    pdBounds = null;
    var color = routeLineColor(sortie);

    if (latlngs.length) {
      var poly = L.polyline(latlngs, { color: color, weight: 4, opacity: 0.9 }).addTo(pdMap);
      pdBounds = poly.getBounds();
      L.circleMarker(latlngs[0], {
        radius: 7, fillColor: "#22C55E", color: "#fff", fillOpacity: 1, weight: 2
      }).bindTooltip("D\u00e9part").addTo(pdMap);
      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 7, fillColor: "#EF4444", color: "#fff", fillOpacity: 1, weight: 2
      }).bindTooltip("Arriv\u00e9e").addTo(pdMap);
      pdMap.fitBounds(pdBounds, { padding: [24, 24] });
    } else {
      var center = sortie.meetLat != null && sortie.meetLon != null
        ? [sortie.meetLat, sortie.meetLon] : [48.6, -2.8];
      pdMap.setView(center, 11);
    }

    var fitBtn = document.getElementById("pd-map-fit");
    if (fitBtn) {
      fitBtn.onclick = function () {
        if (pdBounds) pdMap.fitBounds(pdBounds, { padding: [24, 24] });
        else pdMap.setView([48.6, -2.8], 10);
      };
    }

    setTimeout(function () { pdMap.invalidateSize(); }, 100);
  }

  /* =========================================================
     ACCORDÉONS
  ========================================================= */
  function bindAccordions() {
    var root = document.getElementById("pd-accordions");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    root.querySelectorAll(".pd-acc__item").forEach(function (item) {
      var btn = item.querySelector(".pd-acc__head");
      var panel = item.querySelector(".pd-acc__panel");
      if (!btn || !panel) return;

      panel.style.maxHeight = "0";

      btn.addEventListener("click", function () {
        var open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0";

        if (open) {
          var section = item.getAttribute("data-section");
          if (section && !_openedInfoSections[section]) {
            _openedInfoSections[section] = true;
            if (window.GoeloActivity) {
              window.GoeloActivity.logEvent(
                null,
                window.GoeloActivity.EVENT_TYPES.RIDE_INFO_OPENED,
                { section: section }
              );
            }
          }
        }
      });
    });
  }

  function bindGpxDownload() {
    if (!window.GoeloGpx) return;
    window.GoeloGpx.bindDownloadButton("pd-gpx-btn", function () {
      return {
        fileRef: sortie && (sortie.gpxUrl || sortie.gpxFile),
        title: sortie && sortie.title,
        sb: getSb(),
        messageEl: "pd-gpx-msg"
      };
    });
  }

  /* =========================================================
     RENDER ALL
  ========================================================= */
  async function renderAll() {
    renderHero();
    renderCities();
    renderParticipants();
    bindJoin();
    bindGpxDownload();
    await renderJoin();
    bindAccordions();
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
      var kmVal = stats.totalKm != null ? stats.totalKm : fc.km;
      var dplusVal = stats.elevGainM != null ? stats.elevGainM : fc.dplus;
      var groupLabel = result.data.group_label || "";

      sortie = {
        id:        result.data.id,
        title:     result.data.track_name   || "Sortie",
        group:     groupLabel,
        groupKey:  groupKeyFromLabel(groupLabel),
        type:      result.data.route_kind   || "",
        raceType:  fc.raceType              || "",
        niveau:    fc.niveau                || "",
        place:     fc.meetPlace             || "",
        city:      fc.city                  || "",
        date:      fc.rideDateIso           || "",
        rideTime:  fc.rideTime              || fc.meetTime || "",
        meetTime:  fc.meetTime              || "",
        captain:   fc.captain || fc.rideLeader || "",
        kmRaw:     kmVal,
        dplusRaw:  dplusVal,
        duration:  fc.estimatedDurationHm   || fc.estimated_duration_hm || "",
        startTime: fc.startTime || fc.rideTime || "",
        embeddedPoints: Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : null,
        routeCities: Array.isArray(fc.routeCities) ? fc.routeCities : [],
        gpxFile:   fc.file || fc.gpx_url || "",
        gpxUrl:    fc.gpx_url || fc.file || "",
        meetLat:   fc.meetLat != null ? Number(fc.meetLat) : (fc.meet_lat != null ? Number(fc.meet_lat) : null),
        meetLon:   fc.meetLon != null ? Number(fc.meetLon) : (fc.meet_lon != null ? Number(fc.meet_lon) : null),
        participants: []
      };

      if (kmVal == null) console.warn("[parcours] distance non renseign\u00e9e pour", sortie.id);
      if (dplusVal == null) console.warn("[parcours] d\u00e9nivel\u00e9 non renseign\u00e9 pour", sortie.id);
      if (!sortie.embeddedPoints?.length && !sortie.gpxFile) {
        console.warn("[parcours] aucune donn\u00e9e de trac\u00e9 pour", sortie.id);
      }

      await syncParticipantsUI();
      await renderAll();
      loadWeather();
      await initMap();

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
      syncParticipantsUI();
    });

    window.addEventListener("goelo:auth-success", function () {
      renderJoin();
      syncParticipantsUI();
    });
  });

})();
