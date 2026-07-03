/**
 * GoëloRides — mes inscriptions (Supabase RPC)
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function getSb() {
    return typeof window.goeloGetSb === "function" ? window.goeloGetSb() : null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function hide(id) {
    var el = $(id);
    if (el) el.hidden = true;
  }

  function show(id) {
    var el = $(id);
    if (el) el.hidden = false;
  }

  function showGate() {
    show("bookings-gate");
    hide("bookings-content");
    hide("bookings-fatal");
  }

  function showContent() {
    hide("bookings-gate");
    show("bookings-content");
    hide("bookings-fatal");
  }

  function showFatal(msg) {
    hide("bookings-gate");
    hide("bookings-content");
    var box = $("bookings-fatal");
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    }
  }

  function showListError(msg) {
    showContent();
    var list = $("bookings-list");
    if (list) list.innerHTML = '<div class="ac-error" role="alert">' + escapeHtml(msg) + "</div>";
  }

  function showLoading() {
    showContent();
    var list = $("bookings-list");
    if (list) list.innerHTML = '<div class="ac-loading">Chargement de tes inscriptions…</div>';
  }

  function firstNonEmpty(values) {
    for (var i = 0; i < values.length; i++) {
      if (values[i] != null && String(values[i]).trim()) return String(values[i]).trim();
    }
    return null;
  }

  function parseFrontConfig(route) {
    if (!route || !route.front_config) return null;
    var fc = route.front_config;
    if (typeof fc === "string") {
      try { fc = JSON.parse(fc); } catch (e) { return null; }
    }
    return fc && typeof fc === "object" ? fc : null;
  }

  function extractTitle(route) {
    if (!route) return "Sortie";
    var fc = parseFrontConfig(route);
    return firstNonEmpty([route.title, route.track_name, route.name, fc && fc.title, fc && fc.track_name]) || "Sortie";
  }

  function extractLocation(route) {
    if (!route) return "Lieu à confirmer";
    var fc = parseFrontConfig(route);
    return firstNonEmpty([
      route.location, route.start_location, route.departure_location,
      route.meeting_point, route.city, fc && fc.location, fc && fc.meeting_point, fc && fc.city
    ]) || "Lieu à confirmer";
  }

  function extractGroup(route) {
    if (!route) return "";
    var fc = parseFrontConfig(route);
    var g = firstNonEmpty([route.group_label, fc && fc.group_label]);
    return g ? " · Groupe " + g : "";
  }

  function extractDepartureIso(route) {
    if (!route) return null;
    var fc = parseFrontConfig(route);
    return firstNonEmpty([route.departure_at, route.event_date, route.start_at, fc && fc.departure_at, fc && fc.event_date]);
  }

  function formatDateTime(iso) {
    if (!iso) return "Date à confirmer";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "Date à confirmer";
    try {
      return d.toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return String(iso);
    }
  }

  function isWaiting(row) {
    return row.status === "waiting" || row.waitlist === true;
  }

  function normalizeRows(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.bookings)) return data.bookings;
    if (Array.isArray(data.rows)) return data.rows;
    return [];
  }

  function renderEmpty() {
    var list = $("bookings-list");
    if (!list) return;
    list.innerHTML =
      '<div class="ac-empty">Aucune inscription pour le moment 🚴' +
      '<br><a href="sorties.html">Voir les sorties disponibles</a></div>';
  }

  function renderBookings(rows) {
    var list = $("bookings-list");
    if (!list) return;

    if (!rows.length) {
      renderEmpty();
      return;
    }

    list.innerHTML = rows.map(function (row) {
      var route = row.routes || row.route || null;
      var title = extractTitle(route);
      var when = formatDateTime(extractDepartureIso(route));
      var group = extractGroup(route);
      var location = extractLocation(route);
      var waiting = isWaiting(row);
      var badgeClass = waiting ? "ac-booking__badge--wait" : "ac-booking__badge--ok";
      var badgeLabel = waiting ? "File d'attente" : "Inscrit";
      var routeId = row.route_id || (route && route.id) || "";
      var linkHtml = routeId
        ? '<a class="ac-booking__link" href="parcours.html?id=' + encodeURIComponent(routeId) + '">Voir la sortie</a>'
        : "";

      return (
        '<article class="ac-booking" data-signup-id="' + escapeHtml(row.id || routeId) + '">' +
          '<div class="ac-booking__body">' +
            '<p class="ac-booking__title">' + escapeHtml(title) + "</p>" +
            '<p class="ac-booking__meta">' + escapeHtml(when) + escapeHtml(group) + "</p>" +
            '<p class="ac-booking__meta">📍 ' + escapeHtml(location) + "</p>" +
            linkHtml +
          "</div>" +
          '<div class="ac-booking__side">' +
            '<span class="ac-booking__badge ' + badgeClass + '">' + badgeLabel + "</span>" +
            '<button type="button" class="ac-booking__unsub" data-route-id="' + escapeHtml(routeId) + '">Se désinscrire</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  async function fetchBookings(user) {
    var sb = getSb();
    if (!sb) throw new Error("Client Supabase indisponible.");

    var result = await sb.rpc("signup_list_my_bookings", { uid: user.id });
    if (result.error) throw new Error(result.error.message);

    return normalizeRows(result.data);
  }

  async function handleUnsubscribe(routeId, btn) {
    if (!routeId) return;
    if (!window.confirm("Te désinscrire de cette sortie ?")) return;

    var sb = getSb();
    if (!sb) return;

    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Désinscription…";

    try {
      var result = await sb.rpc("toggle_signup", { p_route_id: routeId });
      if (result.error) throw new Error(result.error.message);

      var payload = result.data;
      if (payload && payload.ok === false) {
        throw new Error(payload.error || "toggle_failed");
      }

      var card = btn.closest(".ac-booking");
      if (card && card.parentNode) card.parentNode.removeChild(card);

      var list = $("bookings-list");
      if (list && !list.querySelector(".ac-booking")) renderEmpty();
    } catch (err) {
      console.warn("[my-bookings] unsubscribe:", err.message);
      btn.disabled = false;
      btn.textContent = label;
      window.alert("Impossible de te désinscrire pour le moment. Réessaie.");
    }
  }

  function bindUnsubscribe() {
    var list = $("bookings-list");
    if (!list || list.getAttribute("data-bound") === "1") return;
    list.setAttribute("data-bound", "1");
    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-route-id]");
      if (!btn) return;
      handleUnsubscribe(btn.getAttribute("data-route-id"), btn);
    });
  }

  async function loadBookings(user) {
    if (!user || !user.id) {
      showGate();
      return;
    }

    if (!getSb()) {
      showFatal("Client Supabase indisponible.");
      return;
    }

    showLoading();

    try {
      var rows = await fetchBookings(user);
      renderBookings(rows);
    } catch (err) {
      console.warn("[my-bookings]", err.message);
      showListError("Impossible de charger tes inscriptions. " + (err.message || "Réessaie plus tard."));
    }
  }

  function onAuth(detail) {
    var user = detail && detail.user;
    if (!user && window.GoeloAuthState) user = window.GoeloAuthState.getState().user;
    if (!user) {
      showGate();
      return;
    }
    loadBookings(user);
  }

  function init() {
    bindUnsubscribe();

    if (window.GoeloAuthState && !window.GoeloAuthState.getState().pending) {
      onAuth(window.GoeloAuthState.getState());
    }

    window.addEventListener("goelo:role-ready", function (e) { onAuth(e.detail); });
    window.addEventListener("goelo:auth-success", function (e) { onAuth(e.detail); });
    window.addEventListener("goelo:auth-state", function (e) { onAuth(e.detail); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
