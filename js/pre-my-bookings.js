/**
 * GoëloRides — mes inscriptions
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

  function showGate() {
    $("bookings-gate").hidden = false;
    $("bookings-content").hidden = true;
  }

  function showContent() {
    $("bookings-gate").hidden = true;
    $("bookings-content").hidden = false;
  }

  function formatDate(iso) {
    if (!iso) return "Date à confirmer";
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch (e) {
      return iso;
    }
  }

  function renderEmpty() {
    var list = $("bookings-list");
    if (!list) return;
    list.innerHTML =
      '<div class="ac-empty">Aucune inscription pour le moment.<br>' +
      '<a href="sorties.html">Voir les sorties</a></div>';
  }

  function renderBookings(rows) {
    var list = $("bookings-list");
    if (!list) return;

    if (!rows.length) {
      renderEmpty();
      return;
    }

    list.innerHTML = rows.map(function (row) {
      var route = row.routes || {};
      var title = route.track_name || route.title || row.route_id || "Sortie";
      var group = route.group_label ? " · Groupe " + route.group_label : "";
      var date = formatDate(route.departure_at || route.event_date);
      var badgeClass = row.waitlist ? "ac-booking__badge--wait" : "ac-booking__badge--ok";
      var badgeLabel = row.waitlist ? "File d'attente" : "Inscrit";
      var href = "parcours.html?id=" + encodeURIComponent(row.route_id);

      return (
        '<article class="ac-booking">' +
          '<div>' +
            '<p class="ac-booking__title">' + escapeHtml(title) + "</p>" +
            '<p class="ac-booking__meta">' + escapeHtml(date) + escapeHtml(group) + "</p>" +
            '<a class="ac-booking__link" href="' + href + '">Voir la sortie</a>' +
          "</div>" +
          '<span class="ac-booking__badge ' + badgeClass + '">' + badgeLabel + "</span>" +
        "</article>"
      );
    }).join("");
  }

  async function loadBookings(user) {
    var sb = getSb();
    if (!sb || !user) {
      showGate();
      return;
    }

    showContent();
    var list = $("bookings-list");
    if (list) list.innerHTML = '<div class="ac-empty">Chargement…</div>';

    var query = sb
      .from("signups")
      .select("id, route_id, waitlist, created_at, routes(track_name, group_label, departure_at, event_date)")
      .is("canceled_at", null)
      .order("created_at", { ascending: false });

    if (user.id) query = query.eq("user_id", user.id);
    else if (user.email) query = query.ilike("email", user.email.trim());

    var result = await query;

    if (result.error) {
      console.warn("[my-bookings]", result.error.message);
      if (list) {
        list.innerHTML = '<div class="ac-empty">Impossible de charger tes inscriptions.</div>';
      }
      return;
    }

    renderBookings(result.data || []);
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
