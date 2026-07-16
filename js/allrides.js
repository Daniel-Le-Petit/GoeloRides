/**
 * GoëloRides — /js/allrides.js
 * Public catalogue of reusable routes (public.rides).
 */
(function () {
  "use strict";

  var state = {
    rides: [],
    filters: {
      minDistance: null,
      maxDistance: null,
      minElevation: null,
      gpxOnly: false
    },
    selectedId: null,
    gpxFile: null
  };

  var GPX_BUCKET = "rides-gpx";

  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  function toast(msg) {
    var wrap = document.getElementById("ar-toast-wrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "ar-toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }

  function canCreateRide() {
    var role = window.GOELO_ROLE;
    return role === "admin" || role === "team_rider";
  }

  function syncCreateButton() {
    var btn = document.getElementById("ar-create-btn");
    if (!btn) return;
    btn.hidden = !canCreateRide();
  }

  function showCreateError(msg) {
    var box = document.getElementById("ar-create-error");
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  }

  function hideCreateError() {
    var box = document.getElementById("ar-create-error");
    if (box) box.hidden = true;
  }

  function openCreateModal() {
    var modal = document.getElementById("modal-ar-create");
    if (!modal) return;
    hideCreateError();
    var form = document.getElementById("ar-create-form");
    if (form) form.reset();
    clearGpxSelection();
    modal.hidden = false;
    modal.classList.add("is-open");
    document.documentElement.classList.add("goelo-modal-open");
    var titleEl = document.getElementById("ar-f-title");
    if (titleEl) titleEl.focus();
  }

  function clearGpxSelection() {
    state.gpxFile = null;
    var input = document.getElementById("ar-f-gpx-file");
    if (input) input.value = "";
    var selected = document.getElementById("ar-gpx-selected");
    var filename = document.getElementById("ar-gpx-filename");
    if (selected) selected.hidden = true;
    if (filename) filename.textContent = "";
  }

  function showGpxSelection(file) {
    var selected = document.getElementById("ar-gpx-selected");
    var filename = document.getElementById("ar-gpx-filename");
    if (filename) filename.textContent = file.name;
    if (selected) selected.hidden = false;
  }

  function sanitizeGpxFilename(name) {
    var base = String(name || "track.gpx").replace(/[^a-zA-Z0-9._-]/g, "_");
    return /\.gpx$/i.test(base) ? base : base + ".gpx";
  }

  async function uploadGpxFile(sb, file, userId) {
    var path = userId + "/" + Date.now() + "_" + sanitizeGpxFilename(file.name);
    var upload = await sb.storage.from(GPX_BUCKET).upload(path, file, {
      contentType: file.type || "application/gpx+xml",
      upsert: false
    });
    if (upload.error) throw upload.error;

    var pub = sb.storage.from(GPX_BUCKET).getPublicUrl(path);
    return pub.data.publicUrl;
  }

  function closeCreateModal() {
    var modal = document.getElementById("modal-ar-create");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.hidden = true;
    hideCreateError();
    clearGpxSelection();
    if (!document.querySelector(".goelo-modal.is-open")) {
      document.documentElement.classList.remove("goelo-modal-open");
    }
  }

  function parseOptionalNumber(el) {
    if (!el || el.value === "" || el.value == null) return null;
    var n = parseFloat(el.value);
    return isNaN(n) ? null : n;
  }

  function clearFiltersForNewRide() {
    var ids = ["ar-min-km", "ar-max-km", "ar-min-elev"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    var gpxEl = document.getElementById("ar-gpx-only");
    if (gpxEl) gpxEl.checked = false;
    readFiltersFromDom();
  }

  function buildRidePayload() {
    var titleEl = document.getElementById("ar-f-title");
    var title = titleEl ? String(titleEl.value || "").trim() : "";
    if (!title) throw new Error("Le titre est obligatoire.");

    var descEl = document.getElementById("ar-f-description");
    var description = descEl ? String(descEl.value || "").trim() : "";

    var payload = {
      title: title,
      description: description || null,
      gpx_url: null,
      distance_km: parseOptionalNumber(document.getElementById("ar-f-distance")),
      elevation_gain: parseOptionalNumber(document.getElementById("ar-f-elevation")),
      estimated_time_min: parseOptionalNumber(document.getElementById("ar-f-duration"))
    };

    if (window.GOELO_USER && window.GOELO_USER.id) {
      payload.created_by = window.GOELO_USER.id;
    }

    return payload;
  }

  async function submitCreateRide() {
    hideCreateError();

    if (!canCreateRide()) {
      showCreateError("Accès réservé aux Ride Leaders et aux Admins.");
      return;
    }

    if (!window.GOELO_USER || !window.GOELO_USER.id) {
      showCreateError("Connexion requise pour créer un itinéraire.");
      if (typeof window.openGoeloAuth === "function") window.openGoeloAuth();
      return;
    }

    var sb = getSb();
    if (!sb) {
      showCreateError("Client Supabase indisponible.");
      return;
    }

    var payload;
    try {
      payload = buildRidePayload();
    } catch (err) {
      showCreateError(err.message || "Formulaire invalide.");
      return;
    }

    var submitBtn = document.getElementById("ar-create-submit");
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (state.gpxFile) {
        payload.gpx_url = await uploadGpxFile(sb, state.gpxFile, window.GOELO_USER.id);
      }

      var result = await sb
        .from("rides")
        .insert(payload)
        .select("*")
        .single();

      if (result.error) throw result.error;
      if (!result.data) throw new Error("Création sans réponse.");

      closeCreateModal();
      clearFiltersForNewRide();
      state.rides.unshift(result.data);
      render();

      var newId = result.data.id;
      setTimeout(function () {
        var el = document.getElementById("ride-" + newId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("is-selected");
        }
      }, 80);

      toast('Itinéraire « ' + (result.data.title || "sans titre") + ' » créé');
    } catch (err) {
      console.error("[allrides] create:", err);
      showCreateError(err.message || "Erreur lors de la création.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function bindCreateRide() {
    var createBtn = document.getElementById("ar-create-btn");
    if (createBtn) {
      createBtn.addEventListener("click", function () {
        if (!canCreateRide()) return;
        openCreateModal();
      });
    }

    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-ar-close-modal]")) {
        e.preventDefault();
        closeCreateModal();
      }
    });

    var form = document.getElementById("ar-create-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submitCreateRide();
      });
    }

    var pickBtn = document.getElementById("ar-gpx-pick");
    var fileInput = document.getElementById("ar-f-gpx-file");
    var removeBtn = document.getElementById("ar-gpx-remove");

    if (pickBtn && fileInput) {
      pickBtn.addEventListener("click", function () {
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        hideCreateError();
        var file = fileInput.files && fileInput.files[0];
        if (!file) {
          clearGpxSelection();
          return;
        }
        if (!/\.gpx$/i.test(file.name)) {
          showCreateError("Le fichier doit être au format .gpx.");
          clearGpxSelection();
          return;
        }
        state.gpxFile = file;
        showGpxSelection(file);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clearGpxSelection();
      });
    }

    window.addEventListener("goelo:role-ready", syncCreateButton);
    window.addEventListener("goelo:auth-success", syncCreateButton);
    syncCreateButton();
  }

  function fmtKm(km) {
    if (km == null || isNaN(km)) return "—";
    return String(Math.round(km * 10) / 10).replace(".", ",") + " km";
  }

  function fmtElevation(m) {
    if (m == null || isNaN(m)) return "—";
    return Math.round(m) + " m D+";
  }

  function fmtDuration(minutes) {
    if (minutes == null || isNaN(minutes)) return "—";
    var min = Math.round(minutes);
    if (min < 60) return "≈ " + min + " min";
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (!m) return "≈ " + h + " h";
    return "≈ " + h + " h " + m;
  }

  function hasGpx(ride) {
    return !!(ride.gpx_url && String(ride.gpx_url).trim());
  }

  function hasGeometry(ride) {
    var g = ride.geometry;
    if (g == null) return false;
    if (typeof g === "string") return g.trim().length > 0 && g.trim() !== "null";
    if (Array.isArray(g)) return g.length > 0;
    if (typeof g === "object") {
      if (g.type && g.coordinates) return true;
      return Object.keys(g).length > 0;
    }
    return false;
  }

  function parseNumInput(el) {
    if (!el || el.value === "" || el.value == null) return null;
    var n = parseFloat(el.value);
    return isNaN(n) ? null : n;
  }

  function readFiltersFromDom() {
    state.filters.minDistance = parseNumInput(document.getElementById("ar-min-km"));
    state.filters.maxDistance = parseNumInput(document.getElementById("ar-max-km"));
    state.filters.minElevation = parseNumInput(document.getElementById("ar-min-elev"));
    var gpxEl = document.getElementById("ar-gpx-only");
    state.filters.gpxOnly = !!(gpxEl && gpxEl.checked);
  }

  function applyFilters(rides) {
    var f = state.filters;
    return rides.filter(function (ride) {
      var km = ride.distance_km;
      var elev = ride.elevation_gain;

      if (f.minDistance != null && (km == null || km < f.minDistance)) return false;
      if (f.maxDistance != null && (km == null || km > f.maxDistance)) return false;
      if (f.minElevation != null && (elev == null || elev < f.minElevation)) return false;
      if (f.gpxOnly && !hasGpx(ride)) return false;
      return true;
    });
  }

  function geometryPreviewSvg(ride) {
    var coords = null;
    var g = ride.geometry;

    if (g && typeof g === "object") {
      if (g.type === "LineString" && Array.isArray(g.coordinates)) {
        coords = g.coordinates;
      } else if (g.type === "MultiLineString" && Array.isArray(g.coordinates) && g.coordinates[0]) {
        coords = g.coordinates[0];
      }
    }

    if (!coords || coords.length < 2) {
      return (
        '<div class="ar-map-preview" aria-hidden="true">' +
        '<span class="ar-map-placeholder__label">Track</span></div>'
      );
    }

    var lats = [];
    var lons = [];
    coords.forEach(function (pt) {
      if (!Array.isArray(pt) || pt.length < 2) return;
      lons.push(pt[0]);
      lats.push(pt[1]);
    });
    if (lats.length < 2) {
      return '<div class="ar-map-preview" aria-hidden="true"><span class="ar-map-placeholder__label">Track</span></div>';
    }

    var minLat = Math.min.apply(null, lats);
    var maxLat = Math.max.apply(null, lats);
    var minLon = Math.min.apply(null, lons);
    var maxLon = Math.max.apply(null, lons);
    var pad = 0.08;
    var w = maxLon - minLon || 0.01;
    var h = maxLat - minLat || 0.01;
    minLon -= w * pad;
    maxLon += w * pad;
    minLat -= h * pad;
    maxLat += h * pad;
    w = maxLon - minLon;
    h = maxLat - minLat;

    var points = coords.map(function (pt) {
      var x = ((pt[0] - minLon) / w) * 100;
      var y = 100 - ((pt[1] - minLat) / h) * 100;
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");

    return (
      '<div class="ar-map-preview" aria-hidden="true">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="#C8F135" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' +
      points + '"/></svg></div>'
    );
  }

  function mapPlaceholderHtml(ride) {
    var withGeometry = hasGeometry(ride);
    return (
      '<div class="ar-map-placeholder">' +
        (withGeometry ? geometryPreviewSvg(ride) : "") +
        '<span class="ar-map-placeholder__icon" aria-hidden="true">🗺</span>' +
        '<span class="ar-map-placeholder__label">' +
          (withGeometry ? "Preview" : "Map") +
        "</span>" +
      "</div>"
    );
  }

  function buildCardHtml(ride, index) {
    var id = String(ride.id);
    var title = ride.title || "Itinéraire sans titre";
    var selected = state.selectedId && String(state.selectedId) === id;

    var actions =
      '<button type="button" class="go-sc-btn go-sc-btn--primary" data-ar-use="' + escapeAttr(id) + '">Utiliser cet itinéraire</button>' +
      '<a class="go-sc-btn go-sc-btn--ghost" href="allrides.html?id=' + encodeURIComponent(id) + '#ride-' + escapeAttr(id) + '">View</a>';

    if (hasGpx(ride)) {
      actions +=
        '<a class="go-sc-btn go-sc-btn--accent" href="' + escapeAttr(ride.gpx_url) + '" download target="_blank" rel="noopener noreferrer">Download GPX</a>';
    }

    return (
      '<li>' +
      '<article class="go-sc-card ar-ride-card' + (selected ? " is-selected" : "") + '" id="ride-' + escapeAttr(id) + '" style="animation-delay:' + (index * 45) + 'ms">' +
        '<div class="ar-ride-card__map">' + mapPlaceholderHtml(ride) + "</div>" +
        '<div class="go-sc-card__body ar-ride-card__body">' +
          '<div class="go-sc-card__title-row">' +
            '<h2 class="go-sc-card__title">' + escapeHtml(title) + "</h2>" +
          "</div>" +
          '<div class="go-sc-metrics">' +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Distance</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtKm(ride.distance_km)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Elevation</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtElevation(ride.elevation_gain)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Duration</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtDuration(ride.estimated_time_min)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">GPX</span>' +
            '<span class="go-sc-metrics__val">' + (hasGpx(ride) ? "Yes" : "—") + "</span></div>" +
          "</div>" +
        "</div>" +
        '<div class="ar-ride-card__actions">' + actions + "</div>" +
      "</article>" +
      "</li>"
    );
  }

  function updateCount(shown, total) {
    var el = document.getElementById("ar-count");
    if (!el) return;
    if (!total) {
      el.textContent = "";
      return;
    }
    el.textContent = shown === total
      ? shown + " itinéraire" + (shown === 1 ? "" : "s")
      : shown + " / " + total + " itinéraires";
  }

  function render() {
    var host = document.getElementById("ar-rides-list");
    if (!host) return;

    var filtered = applyFilters(state.rides);
    updateCount(filtered.length, state.rides.length);

    if (!state.rides.length) {
      host.innerHTML = '<p class="go-sc-empty">Aucun itinéraire dans la bibliothèque.</p>';
      return;
    }

    if (!filtered.length) {
      host.innerHTML = '<p class="go-sc-empty">Aucun itinéraire ne correspond à ces filtres.</p>';
      return;
    }

    host.innerHTML =
      '<ul class="go-sc-list">' +
      filtered.map(buildCardHtml).join("") +
      "</ul>";
  }

  function storeSelectedRide(ride) {
    try {
      sessionStorage.setItem("selectedRide", JSON.stringify(ride));
      state.selectedId = ride.id;
      render();
      toast('« ' + (ride.title || "Itinéraire") + ' » enregistré pour ta prochaine sortie');
    } catch (err) {
      console.error("[allrides] sessionStorage:", err);
      toast("Impossible d'enregistrer la sélection");
    }
  }

  function restoreSelectedFromStorage() {
    try {
      var raw = sessionStorage.getItem("selectedRide");
      if (!raw) return;
      var ride = JSON.parse(raw);
      if (ride && ride.id != null) state.selectedId = ride.id;
    } catch (e) {
      void e;
    }
  }

  function scrollToRideFromUrl() {
    var id = new URLSearchParams(location.search).get("id");
    if (!id) return;
    var el = document.getElementById("ride-" + id);
    if (!el) return;
    setTimeout(function () {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-selected");
    }, 120);
  }

  async function fetchRides() {
    var host = document.getElementById("ar-rides-list");
    var sb = getSb();

    if (!sb) {
      if (host) {
        host.innerHTML = '<p class="go-sc-empty" style="color:var(--red,#f87171)">Supabase client unavailable.</p>';
      }
      return;
    }

    var result = await sb
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false });

    if (result.error) {
      console.error("[allrides] fetch:", result.error.message);
      if (host) {
        host.innerHTML =
          '<p class="go-sc-empty" style="color:var(--red,#f87171)">Error: ' +
          escapeHtml(result.error.message) + "</p>";
      }
      return;
    }

    state.rides = result.data || [];
    render();
    scrollToRideFromUrl();
  }

  function bindFilters() {
    var ids = ["ar-min-km", "ar-max-km", "ar-min-elev"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () {
        readFiltersFromDom();
        render();
      });
    });

    var gpxEl = document.getElementById("ar-gpx-only");
    if (gpxEl) {
      gpxEl.addEventListener("change", function () {
        readFiltersFromDom();
        render();
      });
    }
  }

  function bindActions() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-ar-use]");
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute("data-ar-use");
      var ride = state.rides.find(function (r) { return String(r.id) === String(id); });
      if (!ride) return;
      storeSelectedRide(ride);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    restoreSelectedFromStorage();
    bindFilters();
    bindActions();
    bindCreateRide();
    fetchRides();
  });
})();
