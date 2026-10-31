/**
 * GoëloRides — mes inscriptions (Supabase RPC)
 */
(function () {
  "use strict";

  var allRows = [], period = "upcoming", currentUser = null, generation = 0;

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
      fc && fc.meetPlace, fc && fc.meet_place, route.location, route.start_location, route.departure_location,
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
    var date = window.GoeloSortieDates && window.GoeloSortieDates.rideDateFromFc(fc || {});
    if (date && !isNaN(date.getTime())) {
      // Le helper partage un calendrier local ; convertir l’heure murale en Europe/Paris.
      var wall = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
      var utc = wall;
      for (var i = 0; i < 2; i++) {
        var parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Paris", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(utc));
        var v = {}; parts.forEach(function (p) { v[p.type] = p.value; });
        utc += wall - Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute);
      }
      return new Date(utc);
    }
    return firstNonEmpty([route.departure_at, route.event_date, route.start_at, fc && fc.departure_at, fc && fc.event_date]);
  }

  function formatDateTime(iso) {
    if (!iso) return "Date à confirmer";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "Date à confirmer";
    try {
      return d.toLocaleDateString("fr-FR", {
        timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric"
      }) + " · " + d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
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

  function renderBookings(rows) {
    var list = $("bookings-list");
    if (!list) return;

    var now = Date.now();
    function time(row) { var iso = extractDepartureIso(row.routes || row.route); var n = iso && new Date(iso).getTime(); return n || Infinity; }
    var upcoming = rows.filter(function (r) { return time(r) >= now; });
    var past = rows.filter(function (r) { return time(r) < now; });
    $("count-upcoming").textContent = upcoming.length;
    $("count-past").textContent = past.length;
    rows = (period === "past" ? past : upcoming).sort(function (a,b) { return period === "past" ? time(b)-time(a) : time(a)-time(b); });
    if (!rows.length) {
      list.innerHTML = '<div class="ac-empty">' + (period === "past" ? 'Aucune sortie passée dans tes inscriptions.' : 'Aucune inscription à venir. Et si tu préparais ta prochaine sortie ?') + '<br><a href="sorties.html">Découvrir les sorties</a></div>';
      return;
    }

    list.innerHTML = rows.map(function (row, index) {
      var route = row.routes || row.route || null;
      var title = extractTitle(route);
      var when = formatDateTime(extractDepartureIso(route));
      var group = extractGroup(route);
      var location = extractLocation(route);
      var waiting = isWaiting(row);
      var fc = parseFrontConfig(route) || {};
      var status = fc.sortieStatus || "open";
      var cancelled = /^(cancelled|canceled|annulee|annulée)$/.test(status);
      var canCancel = period === "upcoming" && /^(open|published|publiee|publiée)$/.test(status) && !!route;
      var next = period === "upcoming" && !cancelled && index === rows.findIndex(function (r) { return !/^(cancelled|canceled|annulee|annulée)$/.test((parseFrontConfig(r.routes || r.route) || {}).sortieStatus || "open"); });
      var badgeClass = cancelled ? "ac-booking__badge--closed" : waiting ? "ac-booking__badge--wait" : "ac-booking__badge--ok";
      var badgeLabel = cancelled ? "Sortie annulée" : waiting ? "Liste d’attente" : period === "past" ? "Inscription passée" : "Inscription confirmée";
      var routeId = row.route_id || (route && route.id) || "";
      var linkHtml = routeId
        ? '<a class="ac-booking__link" href="parcours.html?id=' + encodeURIComponent(routeId) + '">Voir la sortie</a>'
        : "";

      return (
        '<article class="ac-booking' + (next ? ' ac-booking--next' : '') + '" data-signup-id="' + escapeHtml(row.id || routeId) + '">' +
          '<div class="ac-booking__body">' + (next ? '<span class="ac-eyebrow">Prochaine sortie</span>' : '') +
            '<p class="ac-booking__title">' + escapeHtml(title) + "</p>" +
            '<p class="ac-booking__meta">' + escapeHtml(when) + escapeHtml(group) + "</p>" +
            '<p class="ac-booking__meta">📍 ' + escapeHtml(location) + "</p>" +
            linkHtml +
          "</div>" +
          '<div class="ac-booking__side">' +
            '<span class="ac-booking__badge ' + badgeClass + '">' + badgeLabel + "</span>" +
            (canCancel && routeId ? '<button type="button" class="ac-booking__unsub" data-route-id="' + escapeHtml(routeId) + '">Se désinscrire</button>' : '') +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  async function fetchBookings(user) {
    var sb = getSb();
    if (!sb) throw new Error("Client Supabase indisponible.");

    var result = await sb.rpc("account_my_bookings");
    if (result.error) throw new Error(result.error.message);

    return normalizeRows(result.data);
  }

  async function handleUnsubscribe(routeId, btn) {
    if (!routeId || btn.disabled || !currentUser) return;
    if (!window.confirm("Te désinscrire de cette sortie ?")) return;

    var sb = getSb();
    if (!sb) return;

    var userId = currentUser && currentUser.id;
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Désinscription…";

    try {
      var result = await sb.rpc("account_cancel_booking", { p_route_id: routeId });
      if (result.error) throw new Error(result.error.message);

      var payload = result.data;
      if (!payload || payload.ok !== true || payload.action !== "removed" || payload.joined !== false) throw new Error("cancel_not_confirmed");
      if (!currentUser || currentUser.id !== userId) return;
      allRows = allRows.filter(function (r) { return String(r.route_id || (r.route && r.route.id)) !== String(routeId); });
      renderBookings(allRows);
      $("bookings-feedback").dataset.error = "false";
      $("bookings-feedback").textContent = "Ta désinscription est confirmée.";
    } catch (err) {
      console.warn("[my-bookings] unsubscribe:", err.message);
      btn.disabled = false;
      btn.textContent = label;
      if (!currentUser || currentUser.id !== userId) return;
      $("bookings-feedback").dataset.error = "true";
      $("bookings-feedback").textContent = "Désinscription non confirmée. Réessaie ou contacte l’organisateur si la sortie est fermée.";
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

    var request = ++generation;
    showLoading();

    try {
      var rows = await fetchBookings(user);
      if (request !== generation) return;
      allRows = rows;
      renderBookings(allRows);
    } catch (err) {
      console.warn("[my-bookings]", err.message);
      if (request !== generation) return;
      showListError("Impossible de charger tes inscriptions. Réessaie dans un instant.");
      var retry = document.createElement("button"); retry.type = "button"; retry.className = "ac-btn"; retry.textContent = "Réessayer"; retry.onclick = function () { loadBookings(user); }; $("bookings-list").appendChild(retry);
    }
  }

  function onAuth(detail) {
    if (detail && detail.pending) return;
    var user = detail && detail.user;
    if (!user) { generation++; currentUser = null; allRows = []; $("bookings-list").innerHTML = ""; showGate(); return; }
    if (currentUser && currentUser.id === user.id) return;
    currentUser = user;
    loadBookings(user);
  }
  function init() {
    bindUnsubscribe();
    document.querySelectorAll("[data-period]").forEach(function (button) {
      button.addEventListener("click", function () {
        period = button.dataset.period;
        document.querySelectorAll("[data-period]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
        if (currentUser) renderBookings(allRows);
      });
    });
    showLoading();
    if (window.GoeloAuthState) { onAuth(window.GoeloAuthState.getState()); window.GoeloAuthState.subscribe(onAuth); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
