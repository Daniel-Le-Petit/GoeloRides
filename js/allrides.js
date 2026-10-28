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
    gpxFile: null,
    gpxAnalysis: null,
    gpxGeneration: 0,
    gpxBusy: false,
    creating: false,
    previewMap: null,
    autoTitle: null,
    uploadedGpx: null
  };

  var GPX_BUCKET = "rides-gpx";
  var loadingRides = false;

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

  function canImportRide() {
    var auth = window.GoeloAuthState ? window.GoeloAuthState.getState() : {
      role: window.GOELO_ROLE, user: window.GOELO_USER, pending: !!window.GOELO_AUTH_PENDING
    };
    return !auth.pending && auth.role === 'admin' && !!(auth.user && auth.user.id);
  }

  function updateImportControls() {
    var submit = document.getElementById('ar-create-submit');
    if (submit) {
      submit.disabled = state.creating || state.gpxBusy || !state.gpxAnalysis || !canImportRide();
      submit.textContent = state.creating ? 'Enregistrement…' : 'Enregistrer le parcours';
    }
    ['ar-gpx-pick', 'ar-gpx-remove'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) button.disabled = state.creating;
    });
    var form = document.getElementById('ar-create-form');
    if (form) {
      form.setAttribute('aria-busy', state.gpxBusy || state.creating ? 'true' : 'false');
      form.querySelectorAll('input:not([type="file"]), textarea').forEach(function (input) { input.disabled = state.creating; });
    }
    document.querySelectorAll('#modal-ar-create button[data-ar-close-modal]').forEach(function (button) { button.disabled = state.creating; });
  }

  function syncCreateButton() {
    var btn = document.getElementById("ar-create-btn");
    if (!btn) return;
    btn.hidden = !canImportRide();
    if (btn.hidden && !state.creating) closeCreateModal();
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
    if (!modal || !canImportRide()) return;
    hideCreateError();
    var form = document.getElementById("ar-create-form");
    if (form) form.reset();
    clearGpxSelection();
    modal.hidden = false;
    modal.classList.add("is-open");
    document.documentElement.classList.add("goelo-modal-open");
    document.getElementById('ar-create-title').focus();
  }

  function clearGpxSelection() {
    state.gpxGeneration++;
    state.gpxFile = null;
    state.gpxAnalysis = null;
    state.gpxBusy = false;
    state.uploadedGpx = null;
    if (state.previewMap) {
      try { state.previewMap.remove(); } catch (error) { /* Carte déjà fermée. */ }
      state.previewMap = null;
    }
    var title = document.getElementById('ar-f-title');
    if (title && title.value === state.autoTitle) title.value = '';
    state.autoTitle = null;
    ['ar-f-distance', 'ar-f-elevation', 'ar-f-duration'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    var input = document.getElementById('ar-f-gpx-file');
    if (input) input.value = '';
    var selected = document.getElementById('ar-gpx-selected');
    if (selected) selected.hidden = true;
    document.getElementById('ar-gpx-filename').textContent = '';
    document.getElementById('ar-gpx-status').textContent = '';
    document.getElementById('ar-gpx-preview-wrap').hidden = true;
    document.getElementById('ar-gpx-preview').innerHTML = '';
    updateImportControls();
  }

  function renderGpxPreview(analysis) {
    var host = document.getElementById('ar-gpx-preview');
    var note = document.getElementById('ar-gpx-map-note');
    document.getElementById('ar-gpx-preview-wrap').hidden = false;
    try {
      if (!window.L) throw new Error('Fond de carte indisponible');
      state.previewMap = window.L.map(host, { scrollWheelZoom: false });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
      }).on('tileerror', function () { note.textContent = 'Le fond de carte est indisponible ; le tracé reste affiché.'; }).addTo(state.previewMap);
      var layer = window.L.geoJSON(analysis.geometry, { style: { color: '#92bb13', weight: 4 } }).addTo(state.previewMap);
      state.previewMap.fitBounds(layer.getBounds(), { padding: [12, 12], maxZoom: 15 });
      state.previewMap.invalidateSize();
      note.textContent = 'Vérifie le tracé avant de l’enregistrer.';
    } catch (error) {
      if (state.previewMap) { try { state.previewMap.remove(); } catch (ignored) {} state.previewMap = null; }
      host.innerHTML = window.GoeloGpxImport.svgPreview(analysis.geometry);
      note.textContent = 'Aperçu du tracé sans fond de carte.';
    }
  }

  async function selectGpxFile(file) {
    if (state.creating || !file) return;
    clearGpxSelection();
    hideCreateError();
    var generation = state.gpxGeneration;
    state.gpxBusy = true;
    showGpxSelection(file);
    document.getElementById('ar-gpx-status').textContent = 'Analyse du GPX…';
    updateImportControls();
    try {
      if (!window.GoeloGpxImport) throw new Error('L’analyse GPX est indisponible. Recharge la page puis réessaie.');
      var analysis = await window.GoeloGpxImport.readFile(file);
      if (generation !== state.gpxGeneration) return;
      state.gpxFile = file;
      state.gpxAnalysis = analysis;
      var title = document.getElementById('ar-f-title');
      if (!title.value.trim()) { title.value = analysis.suggestedTitle; state.autoTitle = analysis.suggestedTitle; }
      document.getElementById('ar-f-distance').value = analysis.distanceKm;
      document.getElementById('ar-f-elevation').value = analysis.elevationGain == null ? '' : analysis.elevationGain;
      renderGpxPreview(analysis);
      document.getElementById('ar-gpx-status').textContent = analysis.elevationGain == null
        ? 'Distance calculée. Altitudes absentes ou incomplètes : complète le dénivelé si tu le connais.'
        : 'Distance calculée · Dénivelé estimé à partir des altitudes du fichier.';
      if (analysis.segmentCount > 1) document.getElementById('ar-gpx-status').textContent += ' Le fichier contient ' + analysis.segmentCount + ' tracés séparés.';
    } catch (error) {
      if (generation !== state.gpxGeneration) return;
      clearGpxSelection();
      showCreateError(error.message || 'Impossible de lire ce GPX.');
    } finally {
      if (generation === state.gpxGeneration) state.gpxBusy = false;
      updateImportControls();
    }
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
    var unique = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2);
    var path = userId + '/' + unique + '_' + sanitizeGpxFilename(file.name);
    var upload = await sb.storage.from(GPX_BUCKET).upload(path, file, {
      contentType: 'application/gpx+xml',
      upsert: false
    });
    if (upload.error) throw upload.error;

    var pub = sb.storage.from(GPX_BUCKET).getPublicUrl(path);
    if (!pub.data || !/^https?:\/\//i.test(pub.data.publicUrl || '')) throw new Error('Lien GPX indisponible.');
    return { path: path, url: pub.data.publicUrl };
  }

  function closeCreateModal() {
    if (state.creating) return;
    var modal = document.getElementById("modal-ar-create");
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    modal.hidden = true;
    hideCreateError();
    clearGpxSelection();
    if (!document.querySelector(".goelo-modal.is-open")) {
      document.documentElement.classList.remove("goelo-modal-open");
    }
    var opener = document.getElementById('ar-create-btn');
    if (opener && !opener.hidden) opener.focus();
  }

  function parseOptionalNumber(el) {
    if (!el) return null;
    if (el.validity.badInput) throw new Error('Vérifie les valeurs de dénivelé et de durée.');
    if (el.value === '' || el.value == null) return null;
    var n = parseFloat(el.value);
    if (!Number.isFinite(n) || n < 0 || !el.checkValidity()) throw new Error('Vérifie les valeurs de distance, de dénivelé et de durée.');
    return n;
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
    if (!title || title.length > 200) throw new Error('Indique un nom de parcours de 1 à 200 caractères.');
    if (!state.gpxFile || !state.gpxAnalysis || state.gpxBusy) throw new Error('Choisis un GPX valide et attends la fin de son analyse.');

    var descEl = document.getElementById("ar-f-description");
    var description = descEl ? String(descEl.value || "").trim() : "";

    var payload = {
      title: title,
      description: description || null,
      gpx_url: null,
      geometry: state.gpxAnalysis.geometry,
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
    if (state.creating) return;
    hideCreateError();

    if (!canImportRide()) {
      showCreateError('L’import GPX est réservé aux administrateurs connectés.');
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

    state.creating = true;
    var creatorId = window.GOELO_USER.id;
    updateImportControls();
    try {
      if (!state.uploadedGpx) state.uploadedGpx = await uploadGpxFile(sb, state.gpxFile, creatorId);
      payload.gpx_url = state.uploadedGpx.url;
      if (!canImportRide() || window.GOELO_USER.id !== creatorId) throw new Error('Session modifiée pendant l’enregistrement.');

      // Une réponse perdue ne doit pas faire recréer un parcours déjà enregistré avec ce fichier.
      var existing = await sb.from('rides').select('*')
        .eq('gpx_url', payload.gpx_url).eq('created_by', creatorId).maybeSingle();
      if (existing.error) throw existing.error;
      var recovered = !!existing.data;
      var result = recovered ? existing : await sb
        .from("rides")
        .insert(payload)
        .select("*")
        .single();

      if (result.error) throw result.error;
      if (!result.data) throw new Error("Création sans réponse.");

      state.creating = false;
      closeCreateModal();
      clearFiltersForNewRide();
      state.rides = state.rides.filter(function (ride) { return String(ride.id) !== String(result.data.id); });
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

      toast('Parcours « ' + (result.data.title || 'sans titre') + (recovered ? ' » retrouvé dans la bibliothèque' : ' » enregistré'));
    } catch (err) {
      console.error("[allrides] create:", err);
      showCreateError('Impossible d’enregistrer le parcours pour le moment. Vérifie ta connexion puis réessaie.');
    } finally {
      state.creating = false;
      if (!canImportRide()) closeCreateModal();
      updateImportControls();
    }
  }

  function bindCreateRide() {
    var createBtn = document.getElementById("ar-create-btn");
    if (createBtn) {
      createBtn.addEventListener("click", function () {
        if (!canImportRide()) return;
        openCreateModal();
        document.getElementById('ar-f-gpx-file').click();
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
        if (state.creating) return;
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (file) selectGpxFile(file);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        if (state.creating) return;
        clearGpxSelection();
        hideCreateError();
      });
    }

    document.addEventListener('keydown', function (event) {
      var modal = document.getElementById('modal-ar-create');
      if (!modal || modal.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeCreateModal(); }
      if (event.key !== 'Tab') return;
      var focusable = Array.from(modal.querySelectorAll('button, input, textarea, summary, a[href]')).filter(function (element) {
        return !element.disabled && element.offsetParent !== null;
      });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); if (last) last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); if (first) first.focus(); }
    });

    window.addEventListener("goelo:role-ready", syncCreateButton);
    window.addEventListener("goelo:auth-success", syncCreateButton);
    window.addEventListener("goelo:auth-state", function () {
      syncCreateButton();
      if (state.rides.length) render();
      else fetchRides();
    });
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
    var geometry = ride.geometry;
    if (geometry && window.GoeloGpxImport && ['LineString', 'MultiLineString'].includes(geometry.type)) {
      try {
        return '<div class="ar-map-preview" aria-hidden="true">' + window.GoeloGpxImport.svgPreview(geometry) + '</div>';
      } catch (error) { /* Une ancienne géométrie invalide ne doit pas bloquer le catalogue. */ }
    }
    return '<div class="ar-map-preview" aria-hidden="true"><span class="ar-map-placeholder__label">Tracé</span></div>';
  }

  function mapPlaceholderHtml(ride) {
    var withGeometry = hasGeometry(ride);
    return (
      '<div class="ar-map-placeholder">' +
        (withGeometry ? geometryPreviewSvg(ride) : "") +
        '<span class="ar-map-placeholder__icon" aria-hidden="true">🗺</span>' +
        '<span class="ar-map-placeholder__label">' +
          (withGeometry ? "Aperçu" : "Parcours") +
        "</span>" +
      "</div>"
    );
  }

  function buildCardHtml(ride, index) {
    var id = String(ride.id);
    var title = ride.title || "Itinéraire sans titre";
    var selected = state.selectedId && String(state.selectedId) === id;

    var actions = canCreateRide()
      ? '<a class="go-sc-btn go-sc-btn--primary" href="gestion-sorties.html?mode=create&amp;ride=' + encodeURIComponent(id) + '">Créer une sortie</a>'
      : '';

    if (hasGpx(ride)) {
      actions +=
        '<a class="go-sc-btn go-sc-btn--accent" href="' + escapeAttr(ride.gpx_url) + '" download target="_blank" rel="noopener noreferrer">Télécharger le GPX</a>';
    }

    return (
      '<li>' +
      '<article class="go-sc-card ar-ride-card' + (selected ? " is-selected" : "") + '" id="ride-' + escapeAttr(id) + '" style="animation-delay:' + (index * 45) + 'ms">' +
        '<div class="ar-ride-card__map">' + mapPlaceholderHtml(ride) + "</div>" +
        '<div class="go-sc-card__body ar-ride-card__body">' +
          '<div class="go-sc-card__title-row">' +
            '<h2 class="go-sc-card__title">' + escapeHtml(title) + "</h2>" +
          "</div>" +
          (ride.description ? '<p class="ar-description">' + escapeHtml(ride.description) + '</p>' : '') +
          '<div class="go-sc-metrics">' +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Distance</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtKm(ride.distance_km)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Dénivelé</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtElevation(ride.elevation_gain)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">Durée</span>' +
            '<span class="go-sc-metrics__val">' + escapeHtml(fmtDuration(ride.estimated_time_min)) + "</span></div>" +
            '<div class="go-sc-metrics__cell"><span class="go-sc-metrics__label">GPX</span>' +
            '<span class="go-sc-metrics__val">' + (hasGpx(ride) ? "Disponible" : "—") + "</span></div>" +
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
    if (loadingRides) return;
    var host = document.getElementById("ar-rides-list");
    var sb = getSb();
    loadingRides = true;
    try {
      if (!sb) throw new Error('Connexion au catalogue indisponible.');
      if (host) host.innerHTML = '<p class="go-sc-empty">Chargement des itinéraires…</p>';
      var result = await sb
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false });

      if (result.error) throw result.error;

    state.rides = (result.data || []).map(function (ride) {
      if (typeof ride.geometry === 'string') {
        try { ride.geometry = JSON.parse(ride.geometry); } catch (e) { ride.geometry = null; }
      }
      if (ride.gpx_url && !/^https?:\/\//i.test(ride.gpx_url)) ride.gpx_url = null;
      return ride;
    });
    render();
    scrollToRideFromUrl();
    } catch (error) {
      if (host) host.innerHTML = '<p class="go-sc-empty" role="alert">Impossible de charger les itinéraires. Réessaie dans un instant.</p><button type="button" class="go-sc-btn go-sc-btn--ghost" data-ar-retry>Réessayer</button>';
    } finally {
      loadingRides = false;
    }
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
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-ar-retry]')) fetchRides();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindFilters();
    bindActions();
    bindCreateRide();
    fetchRides();
  });
})();
