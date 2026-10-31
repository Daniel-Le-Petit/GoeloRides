/**
 * GoëloRides — mes inscriptions (Supabase RPC)
 */
(function () {
  "use strict";

  var allRows = [], period = "upcoming", currentUser = null, generation = 0, retrySession = null, bookingsLoaded = false;

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
    hide("bookings-loading");
    hide("bookings-retry");
    show("bookings-gate");
    hide("bookings-content");
    hide("bookings-fatal");
  }

  function showContent() {
    hide("bookings-gate");
    hide("bookings-loading");
    hide("bookings-retry");
    show("bookings-content");
    hide("bookings-fatal");
  }

  function showFatal(msg) {
    hide("bookings-gate");
    hide("bookings-content");
    hide("bookings-loading");
    show("bookings-retry");
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
    hide("bookings-gate"); hide("bookings-fatal"); hide("bookings-content"); hide("bookings-retry"); show("bookings-loading");
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
    function time(row) {
      var iso = extractDepartureIso(row.routes || row.route);
      var value = iso ? new Date(iso).getTime() : NaN;
      return isNaN(value) ? Infinity : value;
    }
    var now = Date.now();
    var upcoming = rows.filter(function (r) { return time(r) >= now; });
    var past = rows.filter(function (r) { return time(r) < now; });
    $("count-upcoming").textContent = upcoming.length;
    $("count-past").textContent = past.length;
    rows = (period === "past" ? past : upcoming).slice().sort(function (a, b) {
      return period === "past" ? time(b) - time(a) : time(a) - time(b);
    });
    if (!rows.length) {
      list.innerHTML = '<div class="ac-empty"><svg viewBox="0 0 120 75" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="25" cy="50" r="20"/><circle cx="95" cy="50" r="20"/><path d="M25 50 43 17 65 50H25l23-27h33l14 27M64 50l17-38h13M36 17h17" stroke-linecap="round"/><path d="M1 74h118" stroke="#d4e2df"/></svg><p class="ac-kicker">' + (period === "past" ? 'LES BONS MOMENTS RESTENT' : 'LA ROUTE T’ATTEND') + '</p><h2>' + (period === "past" ? 'L’histoire commence au prochain départ.' : 'Et si on roulait ensemble ?') + '</h2><p>' + (period === "past" ? 'Tes inscriptions aux sorties passées apparaîtront ici. Une inscription ne vaut pas confirmation de présence.' : 'Tu n’as pas encore de sortie à venir. Trouve un groupe à ton rythme et réserve ta place.') + '</p><a class="ac-btn" href="sorties.html">Découvrir les sorties →</a></div>';
      return;
    }
    var nextIndex = rows.findIndex(function (r) {
      return !/^(cancelled|canceled|annulee|annulée)$/.test((parseFrontConfig(r.routes || r.route) || {}).sortieStatus || "open");
    });
    list.innerHTML = rows.map(function (row, index) {
      var route = row.routes || row.route || null;
      var fc = parseFrontConfig(route) || {};
      var status = String(fc.sortieStatus || "open").toLowerCase();
      var cancelled = /^(cancelled|canceled|annulee|annulée)$/.test(status);
      var waiting = isWaiting(row);
      var next = period === "upcoming" && index === nextIndex;
      var canCancel = period === "upcoming" && /^(open|published|publiee|publiée)$/.test(status) && !!route;
      var badgeClass = cancelled ? "ac-booking__badge--closed" : waiting ? "ac-booking__badge--wait" : "ac-booking__badge--ok";
      var badge = cancelled ? "Sortie annulée" : period === "past" ? "Inscription passée" : waiting ? "Liste d’attente" : "Place confirmée";
      var id = row.route_id || (route && route.id) || "";
      var departure = extractDepartureIso(route);
      var date = departure ? new Date(departure) : null;
      if (date && isNaN(date.getTime())) date = null;
      var tile = date ? '<strong>' + date.toLocaleDateString('fr-FR', {day:'2-digit',timeZone:'Europe/Paris'}) + '</strong><span>' + date.toLocaleDateString('fr-FR', {month:'short',timeZone:'Europe/Paris'}) + '</span>' : '<strong>—</strong><span>À fixer</span>';
      var stats = fc.stats || {};
      var km = Number(stats.totalKm != null ? stats.totalKm : fc.km);
      var elevation = Number(stats.elevGainM != null ? stats.elevGainM : fc.dplus);
      var tags = [];
      if (fc.raceType) tags.push(String(fc.raceType).toUpperCase());
      if (isFinite(km) && km > 0) tags.push(km.toLocaleString('fr-FR', {maximumFractionDigits:1}) + ' km');
      if (isFinite(elevation) && elevation > 0) tags.push(Math.round(elevation).toLocaleString('fr-FR') + ' m D+');
      var group = route && (route.group_label || fc.group_label);
      if (group) tags.push('Groupe ' + group);
      var leader = firstNonEmpty([fc.captain, fc.rideLeader]);
      var meeting = typeof fc.meetTime === 'string' && /^\d{2}:\d{2}$/.test(fc.meetTime) ? fc.meetTime : '';
      var details = '<div><dt>Rendez-vous</dt><dd>' + escapeHtml(extractLocation(route)) + (meeting ? ' · ' + escapeHtml(meeting) : '') + '</dd></div>';
      if (leader) details += '<div><dt>Ride Leader</dt><dd>' + escapeHtml(leader) + '</dd></div>';
      var link = id ? '<a class="ac-booking__link" href="parcours.html?id=' + encodeURIComponent(id) + '">' + (period === 'past' ? 'Revoir la sortie' : 'Préparer ma sortie') + ' →</a>' : '';
      return '<article class="ac-booking' + (next ? ' ac-booking--next' : '') + '">' +
        '<div class="ac-booking__heading"><span class="ac-eyebrow">' + (next ? 'MON PROCHAIN DÉPART' : period === 'past' ? 'DANS MON HISTORIQUE' : 'À L’AGENDA') + '</span><span class="ac-booking__badge ' + badgeClass + '">' + badge + '</span></div>' +
        '<div class="ac-booking__main"><div class="ac-date-tile" aria-hidden="true">' + tile + '</div><div class="ac-booking__body">' +
        '<div class="ac-ride-tags">' + tags.map(function (tag) { return '<span>' + escapeHtml(tag) + '</span>'; }).join('') + '</div>' +
        '<h2 class="ac-booking__title">' + escapeHtml(extractTitle(route)) + '</h2>' +
        '<p class="ac-booking__meta">Départ · ' + escapeHtml(formatDateTime(departure)) + '</p>' +
        '<dl class="ac-ride-details">' + details + '</dl>' +
        (waiting && period === 'upcoming' && !cancelled ? '<p class="ac-help">Ta place sera confirmée si un cycliste se désinscrit.</p>' : '') +
        '</div></div><div class="ac-booking__footer">' + link + '<div class="ac-booking__tools">' +
        (period === 'upcoming' && date && !cancelled && id ? '<button type="button" class="ac-booking__calendar" data-calendar-id="' + escapeHtml(id) + '">Ajouter à mon agenda</button>' : '') +
        (canCancel && id ? '<button type="button" class="ac-booking__unsub" data-route-id="' + escapeHtml(id) + '">Me désinscrire</button>' : '') +
        '</div></div></article>';
    }).join('');
  }

  function downloadCalendar(routeId) {
    var row = allRows.find(function (r) { return String(r.route_id || ((r.route || r.routes || {}).id)) === routeId; });
    if (!row) return;
    var route = row.routes || row.route;
    var departure = extractDepartureIso(route);
    if (!departure) return;
    function stamp(date) { return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
    function text(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
    var url = new URL('parcours.html?id=' + encodeURIComponent(routeId), window.location.href).href;
    var event = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GoeloRides//Sorties//FR','BEGIN:VEVENT',
      'UID:' + text(routeId) + '@goelorides','DTSTAMP:' + stamp(new Date()),'DTSTART:' + stamp(departure),
      'SUMMARY:' + text(extractTitle(route)), 'LOCATION:' + text(extractLocation(route)),
      'DESCRIPTION:' + text('Informations et statut de ton inscription : ' + url), 'URL:' + url,'END:VEVENT','END:VCALENDAR'];
    // Plier à 75 octets sans couper un caractère UTF-8 (RFC 5545).
    function fold(line) { var chunks=[], current='', bytes=0; Array.from(line).forEach(function (char) { var size=new TextEncoder().encode(char).length; if(bytes+size>75){chunks.push(current);current=' ';bytes=1;} current+=char;bytes+=size; });chunks.push(current);return chunks.join('\r\n'); }
    var blob = new Blob([event.map(fold).join('\r\n') + '\r\n'], {type:'text/calendar;charset=utf-8'});
    var fileUrl = URL.createObjectURL(blob);
    var link = document.createElement('a'); link.href=fileUrl;link.download='goelorides-sortie.ics';document.body.appendChild(link);link.click();link.remove();
    setTimeout(function () { URL.revokeObjectURL(fileUrl); }, 1000);
    $("bookings-feedback").dataset.error = "false";
    $("bookings-feedback").textContent = "Fichier agenda téléchargé. Ouvre-le pour ajouter la sortie à ton calendrier.";
  }

  async function fetchBookings(user) {
    var sb = getSb();
    if (!sb) throw new Error("Client Supabase indisponible.");

    var result = await window.GoeloAccount.request(sb.rpc("account_my_bookings"));
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
      var result = await window.GoeloAccount.request(sb.rpc("account_cancel_booking", { p_route_id: routeId }));
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
      var calendar = e.target.closest("[data-calendar-id]");
      if (calendar) { downloadCalendar(calendar.getAttribute("data-calendar-id")); return; }
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
    bookingsLoaded = false;
    showLoading();

    try {
      var rows = await fetchBookings(user);
      if (request !== generation) return;
      allRows = rows;
      bookingsLoaded = true;
      showContent();
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
        if (currentUser && bookingsLoaded) renderBookings(allRows);
      });
    });
    showLoading();
    retrySession = window.GoeloAccount.watch(onAuth, function () { showFatal("Tes inscriptions n’ont pas pu s’ouvrir. Vérifie ta connexion puis réessaie."); });
    $("bookings-retry").addEventListener("click", function () { currentUser = null; showLoading(); retrySession(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
