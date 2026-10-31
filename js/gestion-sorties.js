console.log("🔥 JS VERSION 2026-06-16 LOADED");
window.__DEBUG_JS__ = true;

/* ── SUPABASE ── */
window.GOELO_SUPABASE_URL      = "https://iqxyiwnjwcepfgngkzsm.supabase.co";
window.GOELO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxeHlpd25qd2NlcGZnbmdrenNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY5ODcsImV4cCI6MjA5NTgxMjk4N30._vanK7hFTdH-8o2l-BaVHP9m7mJv7oUFVyGrDwYCnbA";

let _sb = null;

async function getSb() {
  if (_sb) return _sb;

  if (!window.supabase?.createClient) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = () => {
        console.log("Supabase script loaded");
        res();
      };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  console.log("window.supabase =", window.supabase);

  _sb = window.supabase.createClient(
    window.GOELO_SUPABASE_URL,
    window.GOELO_SUPABASE_ANON_KEY
  );

  return _sb;
}

/* ── TOAST ── */
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

/* ── PROGRESS ── */
const FIELDS = ['titre','date'];
function updateProgress() {
  let done = 0;
  FIELDS.forEach(id => { const el = document.getElementById(id); if (el && el.value.trim()) done++; });
  const gpxDone = document.getElementById('gpx-status').classList.contains('visible') ? 1 : 0;
  const total = FIELDS.length;
  const pct = Math.round((done / total) * 100);
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';

  // Step states
  const stepMap = [
    { step: 1, ids: ['titre'] },
    { step: 2, ids: ['date','heure-rdv','lieu'] },
    { step: 3, gpx: true },
    { step: 4, ids: ['capitaine'] },
  ];
  stepMap.forEach(({ step, ids, gpx }) => {
    const el = document.querySelector(`.step-item[data-step="${step}"]`);
    if (!el) return;
    const filled = gpx
      ? document.getElementById('gpx-status')?.classList.contains('visible')
      : ids.every(id => { const f = document.getElementById(id); return f && f.value.trim(); });
    if (filled && (gpx || ids.length > 0)) { el.classList.add('done'); el.classList.remove('active'); }
  });
}

FIELDS.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateProgress);
});

/* ── SCROLL TO SECTION ── */
function scrollToSection(id) {
  const section = document.getElementById(id);
  if (section?.tagName === 'DETAILS') section.open = true;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
  const stepNum = id.replace('s','');
  document.querySelector(`.step-item[data-step="${stepNum}"]`)?.classList.add('active');
}

/* ── RICH TEXT ── */
function fmt(cmd) {
  if (cmd === 'createLink') {
    const url = prompt('URL du lien :');
    if (url) document.execCommand('createLink', false, url);
  } else {
    document.execCommand(cmd, false, null);
  }
  document.getElementById('rte-desc').focus();
}

/* ── NUM PARTICIPANTS ── */
function changeNum(delta) {
  const el = document.getElementById('num-participants');
  const val = parseInt(el.value) + delta;
  if (val >= 1) el.value = val;
}
function toggleIllimite(cb) {
  const el = document.getElementById('num-participants');
  const btns = document.querySelectorAll('.num-btn');
  el.disabled = cb.checked;
  btns.forEach(b => b.disabled = cb.checked);
  if (cb.checked) el.value = '∞';
  else el.value = 20;
}

/* ── STATUS BADGE ── */
function updateStatusBadge(val) {
  const badge = document.getElementById('status-badge');
  const map = {
    brouillon: ['status-pill--draft',   '● Brouillon'],
    publiee:   ['status-pill--pub',     '● Publiée'],
    complete:  ['status-pill--pub',     '● Complète'],
    annulee:   ['status-pill--cancel',  '● Annulée'],
    reportee:  ['status-pill--draft',   '● Reportée'],
  };
  badge.className = 'status-pill ' + (map[val]?.[0] || 'status-pill--draft');
  badge.textContent = map[val]?.[1] || val;
}


let routeSavePending = false;

async function saveDraft() {
  if (routeSavePending) return;
  routeSavePending = true;
  const dot   = document.getElementById('save-dot');
  const label = document.getElementById('save-status');
  dot.classList.remove('saved');
  label.textContent = 'Sauvegarde…';
  try {
    const sb = await getSb();
    const payload = buildPayload('brouillon');
    console.log("MODE:", window.mode);
    console.log("PAYLOAD:", payload);
    let result;
    if (window.mode === 'edit' && window.routeId) {
      result = await sb.rpc('route_update', {
        p_route_id: window.routeId,
        p_track_name: payload.p_track_name,
        p_group_label: payload.p_group_label,
        p_pace_label: payload.p_pace_label,
        p_front_config: payload.p_front_config,
        p_sort_order: payload.p_sort_order
      });
    } else {
      result = await sb.rpc('route_create', payload);
    }

    finishRouteSave(result, payload);
    dot.classList.add('saved');
    label.textContent =
      'Sauvegardé ' +
      new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    showToast('Brouillon sauvegardé');
    if (window.routeId) await loadRouteParticipants(window.routeId);
  } catch (e) {
    console.error(e);
    label.textContent = 'Erreur';
    showToast('Erreur : ' + e.message, 'error');
  } finally {
    routeSavePending = false;
  }
}

function readGpxStats() {
  const distTxt = document.getElementById('gpx-dist')?.textContent?.trim();
  const dplusTxt = document.getElementById('gpx-dplus')?.textContent?.trim();
  const durTxt = document.getElementById('gpx-dur')?.textContent?.trim();
  const km = distTxt && distTxt !== '—' ? parseFloat(distTxt) : NaN;
  const dplus = dplusTxt && dplusTxt !== '—' ? parseInt(dplusTxt, 10) : NaN;
  const duree = durTxt && durTxt !== '—' ? durTxt : '';
  return { km, dplus, duree };
}

/* Les brouillons restent libres ; ces champs sont requis pour publier. */
const PUBLICATION_FIELDS = [
  { id: 'titre', label: 'le titre', message: 'Indique un titre pour cette sortie.' },
  { id: 'date', label: 'la date', message: 'Choisis une date valide pour cette sortie.' }
];

function checkPublicationField(field) {
  const input = document.getElementById(field.id);
  const error = document.getElementById(field.id + '-error');
  const valid = !!input.value.trim() && input.validity.valid;
  if (valid) input.removeAttribute('aria-invalid');
  else input.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = valid ? '' : field.message;
    error.hidden = valid;
  }
  return valid;
}

function updatePublicationSummary() {
  const summary = document.getElementById('publication-errors');
  if (!summary) return;
  const missing = PUBLICATION_FIELDS.filter(field =>
    document.getElementById(field.id).getAttribute('aria-invalid') === 'true'
  );
  summary.hidden = missing.length === 0;
  summary.textContent = missing.length
    ? 'Avant de publier, complète ou corrige ' + missing.map(field => field.label).join(' et ') + '.'
    : '';
}

PUBLICATION_FIELDS.forEach(field => {
  const input = document.getElementById(field.id);
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') !== 'true') return;
    checkPublicationField(field);
    updatePublicationSummary();
  });
});

function validatePublication() {
  const missing = PUBLICATION_FIELDS.filter(field => !checkPublicationField(field));
  updatePublicationSummary();
  if (missing.length) {
    document.getElementById(missing[0].id).focus();
    return false;
  }
  return true;
}

async function publishSortie() {
  if (routeSavePending) return;
  if (!validatePublication()) return;
  routeSavePending = true;
  try {
    const sb = await getSb();
    const selectedStatus = document.getElementById('statut').value;
    const status = window.mode === 'edit' && window._loadedFrontConfig?.sortieStatus !== 'brouillon' ? (selectedStatus || 'publiee') : 'publiee';
    const payload = buildPayload(status);
    let result;
    if (window.mode === 'edit') {
      result = await sb.rpc('route_update', {
      p_route_id: window.routeId,
      p_track_name: payload.p_track_name,
      p_group_label: payload.p_group_label,
      p_pace_label: payload.p_pace_label,
      p_front_config: payload.p_front_config,
      p_sort_order: payload.p_sort_order
    });
    } else {
      result = await sb.rpc('route_create', payload);
    }
    finishRouteSave(result, payload);
    document.getElementById('statut').value = status;
    updateStatusBadge(status);
    document.getElementById('save-dot').classList.add('saved');
    document.getElementById('save-status').textContent = 'Publié';
    syncEditorMode();
    showToast('Sortie enregistrée. Tu peux ouvrir sa fiche publique.');
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
  } finally {
    routeSavePending = false;
  }
}

// REMPLACE buildPayload() dans gestion-sorties.html

function buildPayload(statut) {
  const groupe  = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const type    = document.querySelector('input[name="type"]:checked')?.value   || 'route';
  const titre   = document.getElementById('titre').value.trim();
  const date    = document.getElementById('date').value;
  const hRdv    = document.getElementById('heure-rdv').value;
  const hDepart = document.getElementById('heure-depart').value;
  const lieu    = document.getElementById('lieu').value.trim();
  const ville   = document.getElementById('ville').value.trim();
  const cp      = document.getElementById('cp').value.trim();
  const cap     = document.getElementById('capitaine').value.trim();
  const niveau  = document.getElementById('niveau').value;
  const maxP    = document.getElementById('illimite').checked
                    ? null
                    : parseInt(document.getElementById('num-participants').value);
  const desc    = document.getElementById('rte-desc').innerHTML;

  // group_label = "Groupe Vert — Route des Falaises" (affiché dans sorties.html)
  const groupLabel = `Groupe ${groupe.charAt(0).toUpperCase() + groupe.slice(1)}`;

  // pace_label selon groupe (affiché dans les cartes)
  const pace = { blanc: '18–22 km/h', vert: '22–25 km/h', bleu: '25–30 km/h', rouge: '30+ km/h' };

  const savedFc = window._loadedFrontConfig || {};
  const { km, dplus, duree } = readGpxStats();

  // front_config : tout ce que sorties.js lit pour afficher la carte
  const front_config = {
    ...savedFc,
    address: document.getElementById('adresse').value.trim(),
    weatherMinimum: document.getElementById('meteo').value,
    recommendedEquipment: Array.from(document.querySelectorAll('#s5 input[type=checkbox]:checked')).map(input => input.closest('label').textContent.trim()),
    visibility: statut === 'brouillon' ? 'draft' : statut === 'publiee' ? 'public' : savedFc.visibility || 'public',
    sortieStatus: statut,
    raceType: type,
    levelClass: `level-${groupe}`,
    rideDateIso: date,
    rideTime: hDepart,
    meetTime: hRdv,
    meetPlace: lieu,
    city: ville,
    cp: cp,
    captain: cap,
    niveau: niveau,
    maxParticipants: maxP,
    description: desc,

    km: !isNaN(km) ? km : null,
    dplus: !isNaN(dplus) ? dplus : null,
    estimatedDurationHm: duree || null,
    stats: {
      totalKm: !isNaN(km) ? Math.round(km * 10) / 10 : null,
      elevGainM: !isNaN(dplus) ? dplus : null,
    },

    embeddedPoints: window.currentEmbeddedPoints || savedFc.embeddedPoints || [],
    routeCities: window.currentRouteCities || savedFc.routeCities || [],
    file: window.currentGpxFilename || savedFc.file || '',
    coverImageDataUrl: window.currentCoverImage || savedFc.coverImageDataUrl || ''
  };

  return {
    p_track_name:   titre || (statut === 'brouillon' ? 'Brouillon sans titre' : ''),
    p_group_label:  groupLabel,
    p_pace_label:   pace[groupe],
    p_front_config: front_config,
    p_sort_order:   50
  };
}

function finishRouteSave(result, payload) {
  if (result.error) throw result.error;
  if (!result.data || result.data.ok !== true || !result.data.route_id) throw new Error(result.data?.error || 'Le serveur n’a pas confirmé l’enregistrement.');
  if (result.data?.route_id) {
    window.routeId = result.data.route_id;
    window.mode = 'edit';
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'edit');
    url.searchParams.set('id', window.routeId);
    window.history.replaceState(null, '', url);
  }
  if (payload) window._loadedFrontConfig = payload.p_front_config;
  window.editorDirty = false;
  syncEditorMode();
  const notice = document.getElementById('duplicate-notice');
  if (notice) notice.hidden = true;
}

function duplicateSortie() {
  if (routeSavePending) return;
  window.routeId = null;
  window.mode = 'create';
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'create');
  url.searchParams.delete('id');
  url.searchParams.delete('ride');
  window.history.replaceState(null, '', url);
  const title = document.getElementById('titre');
  title.value = title.value.replace(/ \(copie\)$/, '').slice(0, 72) + ' (copie)';
  document.getElementById('date').value = '';
  document.getElementById('statut').value = 'brouillon';
  updateStatusBadge('brouillon');
  window._loadedFrontConfig = { ...(window._loadedFrontConfig || {}), sortieStatus: 'brouillon', visibility: 'draft' };
  window.editorDirty = true;
  syncEditorMode();
  document.getElementById('save-dot').classList.remove('saved');
  document.getElementById('save-status').textContent = 'Copie non enregistrée';
  ['gs-route-participants', 'gs-participants-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  const list = document.getElementById('gs-participants-list');
  if (list) list.textContent = '';
  resetGuestForm();
  setGuestFormOpen(false);
  PUBLICATION_FIELDS.forEach(field => {
    document.getElementById(field.id).removeAttribute('aria-invalid');
    const error = document.getElementById(field.id + '-error');
    if (error) error.hidden = true;
  });
  updatePublicationSummary();
  const notice = document.getElementById('duplicate-notice');
  if (notice) notice.hidden = false;
  updateProgress();
  document.getElementById('date').focus();
  showToast('Copie préparée : choisis une nouvelle date, puis enregistre ou publie.');
}

async function confirmCancel() {
  if (routeSavePending) return;
  if (!window.routeId) { showToast('Enregistre la sortie avant de pouvoir l’annuler.', 'error'); return; }
  routeSavePending = true;
  const buttons = document.querySelectorAll('#confirm-cancel button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const sb = await getSb();
    const current = await sb.from('routes').select('front_config').eq('id', window.routeId).single();
    if (current.error || !current.data) throw new Error('Impossible de retrouver la sortie.');
    let fc = current.data.front_config || {};
    if (typeof fc === 'string') fc = JSON.parse(fc);
    fc = { ...fc, sortieStatus: 'annulee' };
    const result = await sb.from('routes').update({ front_config: fc }).eq('id', window.routeId).select('id').single();
    if (result.error || !result.data) throw new Error('L’annulation n’a pas été enregistrée. Réessaie.');
    window._loadedFrontConfig = fc;
    document.getElementById('confirm-cancel').classList.remove('open');
    document.getElementById('statut').value = 'annulee';
    updateStatusBadge('annulee');
    document.getElementById('save-dot').classList.add('saved');
    document.getElementById('save-status').textContent = 'Annulation enregistrée';
    window.editorDirty = false;
    syncEditorMode();
    showToast('Sortie annulée et enregistrée.');
  } catch (error) {
    showToast(error.message || 'Impossible d’annuler la sortie.', 'error');
  } finally {
    routeSavePending = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

/* ── GPX IMPORT ── */
let gpxMap = null;

document.getElementById('gpx-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file || !file.name.endsWith('.gpx')) {
    showToast('Fichier GPX invalide', 'error'); return;
  }
  loadGpx(file);
});

const zone = document.getElementById('gpx-zone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
zone.addEventListener('drop', e => {
  e.preventDefault(); zone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadGpx(file);
});

function loadGpx(file) {
  const status  = document.getElementById('gpx-status');
  const dot     = document.getElementById('gpx-dot');
  const fname   = document.getElementById('gpx-filename');
  const msg     = document.getElementById('gpx-msg');

  if (status) status.classList.add('visible');
  dot.classList.add('loading');
  fname.textContent = file.name;
  msg.textContent   = 'Analyse du parcours en cours…';

  document.getElementById('gpx-dist').textContent  = '—';
  document.getElementById('gpx-dplus').textContent = '—';
  document.getElementById('gpx-dur').textContent   = '—';
  document.getElementById('gpx-pts').textContent   = '—';

  const reader = new FileReader();
  reader.onload = function(e) {
    const xml = new DOMParser().parseFromString(e.target.result, 'text/xml');
    parseGpx(xml, file.name);
  };
  reader.readAsText(file);
}

function parseGpx(xml, filename) {
  const pts = Array.from(xml.querySelectorAll('trkpt'));
  if (!pts.length) { showToast('Aucun point GPX trouvé', 'error'); return; }

  const coords = pts.map(p => ({
    lat: parseFloat(p.getAttribute('lat')),
    lng: parseFloat(p.getAttribute('lon')),
    ele: parseFloat(p.querySelector('ele')?.textContent || 0),
  }));

  // 🔥 STOCKAGE GLOBAL POUR SUPABASE
  window.currentEmbeddedPoints = coords.map(c => [c.lat, c.lng]);

  // Distance totale
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversine(coords[i-1], coords[i]);
  }

  // Dénivelé positif
  let dplus = 0;
  for (let i = 1; i < coords.length; i++) {
    const diff = coords[i].ele - coords[i-1].ele;
    if (diff > 0) dplus += diff;
  }

  // Durée estimée (groupe vert = 22 km/h)
  const groupeVal = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const speeds    = { blanc: 20, vert: 22, bleu: 25, rouge: 30 };
  const vitesse   = speeds[groupeVal] || 22;
  const heures    = dist / vitesse;
  const hh        = Math.floor(heures);
  const mm        = Math.round((heures - hh) * 60);

  // Affichage stats
  const durStr = hh + 'h' + String(mm).padStart(2, '0');

  document.getElementById('gpx-dist').textContent  = dist.toFixed(1);
  document.getElementById('gpx-dplus').textContent = Math.round(dplus);
  document.getElementById('gpx-dur').textContent   = durStr;
  document.getElementById('gpx-pts').textContent   = pts.length;

  window.currentGpxFilename = filename;

  document.getElementById('gpx-dot').classList.remove('loading');
  document.getElementById('gpx-msg').textContent = '✓ Parcours prêt';

  // Carte Leaflet
  initMap(coords);

  // Profil altimétrique
  drawElevation(coords);

  extractRouteCities(coords).then(function (cities) {
    window.currentRouteCities = cities;
    if (cities.length) {
      document.getElementById('gpx-msg').textContent =
        '✓ Parcours prêt · ' + cities.join(' → ');
    }
  });

  updateProgress();
}

async function extractRouteCities(coords) {
  if (!coords || coords.length < 2) return [];
  const indices = [
    0,
    Math.floor(coords.length / 3),
    Math.floor((2 * coords.length) / 3),
    coords.length - 1
  ];
  const seen = new Set();
  const cities = [];
  for (const i of indices) {
    const c = coords[i];
    if (!c) continue;
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?lat=' +
        c.lat + '&lon=' + c.lng + '&format=json&zoom=10&accept-language=fr';
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const addr = data.address || {};
      const name = addr.village || addr.town || addr.city || addr.municipality || addr.hamlet;
      if (name && !seen.has(name)) {
        seen.add(name);
        cities.push(name);
      }
      await new Promise(r => setTimeout(r, 1100));
    } catch (e) {
      console.warn('[extractRouteCities]', e);
    }
  }
  return cities;
}

function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2) ** 2 + Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function initMap(coords) {
  if (!gpxMap) {
    gpxMap = L.map('gpx-map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(gpxMap);
  } else {
    gpxMap.eachLayer(l => { if (l instanceof L.Polyline || l instanceof L.CircleMarker) gpxMap.removeLayer(l); });
  }

  const latlngs = coords.map(c => [c.lat, c.lng]);
  const poly    = L.polyline(latlngs, { color: '#C8F135', weight: 3, opacity: 0.9 }).addTo(gpxMap);
  gpxMap.fitBounds(poly.getBounds(), { padding: [24, 24] });

  // Départ / arrivée
  L.circleMarker(latlngs[0], { radius: 7, fillColor: '#22C55E', color: '#fff', fillOpacity: 1, weight: 2 })
    .bindTooltip('Départ').addTo(gpxMap);
  L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, fillColor: '#EF4444', color: '#fff', fillOpacity: 1, weight: 2 })
    .bindTooltip('Arrivée').addTo(gpxMap);

  setTimeout(() => gpxMap.invalidateSize(), 100);
}

function drawElevation(coords) {
  const elevDiv = document.getElementById('gpx-elev');
  elevDiv.classList.add('visible');
  const canvas  = document.getElementById('elev-canvas');
  canvas.width  = canvas.offsetWidth * window.devicePixelRatio || 800;
  canvas.height = 80 * window.devicePixelRatio;
  const ctx     = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const eles = coords.map(c => c.ele);
  const minE = Math.min(...eles), maxE = Math.max(...eles);
  const range = maxE - minE || 1;

  ctx.clearRect(0, 0, W, H);

  // Fill
  ctx.beginPath();
  ctx.moveTo(0, H);
  coords.forEach((c, i) => {
    const x = (i / (coords.length - 1)) * W;
    const y = H - ((c.ele - minE) / range) * (H - 10);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = 'rgba(200,241,53,0.2)';
  ctx.fill();

  // Stroke
  ctx.beginPath();
  coords.forEach((c, i) => {
    const x = (i / (coords.length - 1)) * W;
    const y = H - ((c.ele - minE) / range) * (H - 10);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#C8F135';
  ctx.lineWidth   = 1.5 * window.devicePixelRatio;
  ctx.stroke();
}

async function loadReusableRide(rideId) {
  const sb = await getSb();
  const { data: ride, error } = await sb.from('rides').select('*').eq('id', rideId).single();
  if (error || !ride) throw new Error('Itinéraire introuvable.');
  let geometry = ride.geometry;
  if (typeof geometry === 'string') {
    try { geometry = JSON.parse(geometry); } catch (e) { geometry = null; }
  }
  const coordinates = geometry?.type === 'LineString' ? geometry.coordinates :
    geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates) ? geometry.coordinates.flat() : [];
  const points = (Array.isArray(coordinates) ? coordinates : []).filter(point =>
    Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
  ).map(point => [point[1], point[0], ...(Number.isFinite(point[2]) ? [point[2]] : [])]);
  const description = document.createElement('div');
  description.textContent = ride.description || '';
  const minutes = Math.round(Number(ride.estimated_time_min));
  const file = /^https?:\/\//i.test(ride.gpx_url || '') ? ride.gpx_url : '';
  const current = buildPayload('brouillon').p_front_config;
  populateForm({ track_name: document.getElementById('titre').value.trim() || ride.title || '', front_config: {
    ...current,
    description: document.getElementById('rte-desc').innerHTML.trim() || description.innerHTML, visibility: 'draft', sortieStatus: 'brouillon',
    stats: { totalKm: ride.distance_km, elevGainM: ride.elevation_gain },
    estimatedDurationHm: minutes > 0 ? Math.floor(minutes / 60) + 'h' + String(Math.round(minutes % 60)).padStart(2, '0') : '',
    embeddedPoints: points, file: file
  }});
  document.getElementById('gpx-msg').textContent = file ? '✓ Itinéraire et GPX repris' : '✓ Itinéraire repris';
  const notice = document.getElementById('duplicate-notice');
  if (notice) {
    notice.textContent = 'Itinéraire repris : choisis une date, complète le lieu et le capitaine, puis enregistre ta nouvelle sortie.';
    notice.hidden = false;
  }
  window.editorDirty = true;
  document.getElementById('date').focus();
}

async function loadRoute(routeId, duplicate = false) {
  const sb = await getSb();

  const { data, error } = await sb
    .from('routes')
    .select('*')
    .eq('id', routeId)
    .single();

  if (error || !data) {
    showToast(error?.message || 'Sortie introuvable.', 'error');
    return false;
  }

  populateForm(data);
  if (duplicate) duplicateSortie();
  else await loadRouteParticipants(routeId);
  return true;
}

async function loadRouteParticipants(routeId) {
  var block = document.getElementById("gs-route-participants");
  if (!block || !routeId || !window.GoeloSignupParticipants) return;

  try {
    var sb = await getSb();
    var result = await window.GoeloSignupParticipants.fetchForRoute(routeId, sb);
    block.hidden = false;
    window.GoeloSignupParticipants.renderRouteParticipantsUi({
      participants: (result && result.participants) ? result.participants : [],
      blockEl: "gs-route-participants",
      hideWhenEmpty: false,
      heroWrapEl: "gs-participants-preview",
      heroAvatarsEl: "gs-participants-avatars",
      heroTextEl: "gs-participants-preview-text",
      countEl: "gs-participants-count",
      listEl: "gs-participants-list"
    });
  } catch (e) {
    console.warn("[gestion-sorties] participants:", e);
  }
}

function setGuestFormOpen(open) {
  var form = document.getElementById("gs-guest-add-form");
  var toggle = document.getElementById("gs-guest-add-toggle");
  if (!form) return;
  form.hidden = !open;
  if (toggle) toggle.hidden = !!open;
  if (open) {
    var first = document.getElementById("gs-guest-first");
    if (first) first.focus();
  }
}

function resetGuestForm() {
  var form = document.getElementById("gs-guest-add-form");
  if (form) form.reset();
  var err = document.getElementById("gs-guest-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

function showGuestError(msg) {
  var err = document.getElementById("gs-guest-error");
  if (!err) return;
  err.textContent = msg || "Erreur.";
  err.hidden = false;
}

async function submitGuestParticipant(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!window.routeId) {
    showGuestError("Enregistre d'abord la sortie avant d'ajouter un participant.");
    return;
  }
  if (!window.GoeloSignupParticipants || !window.GoeloSignupParticipants.addGuestParticipant) {
    showGuestError("Module participants indisponible.");
    return;
  }

  var firstEl = document.getElementById("gs-guest-first");
  var lastEl = document.getElementById("gs-guest-last");
  var phoneEl = document.getElementById("gs-guest-phone");
  var submitBtn = document.getElementById("gs-guest-submit");
  var first = firstEl ? firstEl.value.trim() : "";
  var last = lastEl ? lastEl.value.trim() : "";
  var phone = phoneEl ? phoneEl.value.trim() : "";

  if (!first) {
    showGuestError("Le prénom est obligatoire.");
    if (firstEl) firstEl.focus();
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    var sb = await getSb();
    var result = await window.GoeloSignupParticipants.addGuestParticipant(
      window.routeId,
      { first_name: first, last_name: last, phone: phone },
      sb
    );
    if (!result || !result.ok) {
      var code = result && result.error;
      var msg = "Impossible d'ajouter le participant.";
      if (code === "forbidden") msg = "Accès refusé — admin ou Ride Leader requis.";
      else if (code === "first_name_required") msg = "Le prénom est obligatoire.";
      else if (code === "route_not_found") msg = "Sortie introuvable.";
      else if (code) msg = String(code);
      showGuestError(msg);
      return;
    }

    resetGuestForm();
    setGuestFormOpen(false);
    await loadRouteParticipants(window.routeId);
    if (window.GoeloSignupParticipants.emitChanged) {
      window.GoeloSignupParticipants.emitChanged(window.routeId);
    }
    if (typeof showToast === "function") showToast("Participant ajouté", "success");
  } catch (err) {
    console.warn("[gestion-sorties] guest add:", err);
    showGuestError(err && err.message ? err.message : "Erreur inattendue.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function bindGuestParticipantUi() {
  var toggle = document.getElementById("gs-guest-add-toggle");
  var cancel = document.getElementById("gs-guest-cancel");
  var form = document.getElementById("gs-guest-add-form");
  if (toggle) {
    toggle.addEventListener("click", function () {
      resetGuestForm();
      setGuestFormOpen(true);
    });
  }
  if (cancel) {
    cancel.addEventListener("click", function () {
      resetGuestForm();
      setGuestFormOpen(false);
    });
  }
  if (form) {
    form.addEventListener("submit", submitGuestParticipant);
  }
}

function populateForm(route) {
  let fc = route.front_config || {};
  if (typeof fc === 'string') {
    try { fc = JSON.parse(fc); } catch (e) { fc = {}; }
  }
  window._loadedFrontConfig = fc;

  document.getElementById('titre').value = route.track_name || '';
  document.getElementById('date').value = fc.rideDateIso || '';
  document.getElementById('heure-rdv').value = fc.meetTime || '';
  document.getElementById('heure-depart').value = fc.rideTime || '';
  document.getElementById('lieu').value = fc.meetPlace || '';
  document.getElementById('ville').value = fc.city || '';
  document.getElementById('cp').value = fc.cp || '';
  document.getElementById('capitaine').value = fc.captain || fc.rideLeader || '';
  if (fc.niveau) document.getElementById('niveau').value = fc.niveau;
  document.getElementById('adresse').value = fc.address || '';
  document.getElementById('meteo').value = fc.weatherMinimum || '';
  if (Array.isArray(fc.recommendedEquipment)) document.querySelectorAll('#s5 input[type=checkbox]').forEach(input => { input.checked = fc.recommendedEquipment.includes(input.closest('label').textContent.trim()); });
  if (Object.prototype.hasOwnProperty.call(fc, 'maxParticipants')) {
    const unlimited = document.getElementById('illimite');
    unlimited.checked = fc.maxParticipants == null;
    toggleIllimite(unlimited);
    if (!unlimited.checked) document.getElementById('num-participants').value = fc.maxParticipants;
  }

  const groupe = (fc.levelClass || '').replace('level-', '') ||
    (route.group_label || '').toLowerCase().match(/blanc|vert|bleu|rouge/)?.[0] || 'vert';
  const groupeEl = document.querySelector('input[name="groupe"][value="' + groupe + '"]');
  if (groupeEl) groupeEl.checked = true;

  const type = fc.raceType || 'route';
  const typeEl = document.querySelector('input[name="type"][value="' + type + '"]');
  if (typeEl) typeEl.checked = true;

  document.getElementById('rte-desc').innerHTML =
    fc.description || fc.shortDesc || '';

  const statusAliases = {open:'publiee',published:'publiee',cancelled:'annulee',canceled:'annulee','annulée':'annulee',closed:'complete'};
  const statut = statusAliases[fc.sortieStatus] || fc.sortieStatus || (fc.visibility === 'public' ? 'publiee' : 'brouillon');
  document.getElementById('statut').value = statut;
  updateStatusBadge(statut);

  const kmVal = fc.stats?.totalKm != null ? fc.stats.totalKm : fc.km;
  const dplusVal = fc.stats?.elevGainM != null ? fc.stats.elevGainM : fc.dplus;
  const durVal = fc.estimatedDurationHm || fc.estimated_duration_hm || '';

  document.getElementById('gpx-dist').textContent =
    kmVal != null ? Number(kmVal).toFixed(1) : '—';
  document.getElementById('gpx-dplus').textContent =
    dplusVal != null ? Math.round(dplusVal) : '—';
  document.getElementById('gpx-dur').textContent = durVal || '—';

  window.currentEmbeddedPoints = Array.isArray(fc.embeddedPoints) ? fc.embeddedPoints : [];
  window.currentRouteCities = Array.isArray(fc.routeCities) ? fc.routeCities : [];
  window.currentGpxFilename = fc.file || '';

  if (fc.file) {
    document.getElementById('gpx-filename').textContent = fc.file;
    document.getElementById('gpx-msg').textContent = '✓ Parcours enregistré';
  }

  document.getElementById('gpx-status')?.classList.add('visible');

  if (fc.embeddedPoints?.length) {
    const coords = fc.embeddedPoints.map(p => ({
      lat: p[0],
      lng: p[1],
      ele: Array.isArray(p) && p[2] != null ? p[2] : 0
    }));
    document.getElementById('gpx-pts').textContent = coords.length;
    initMap(coords);
    drawElevation(coords);
  }

  updateProgress();
}

/* ── ESCAPE to close confirm ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('confirm-cancel').classList.remove('open');
});

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', async () => {
  // La date est choisie explicitement pour éviter une publication au mauvais jour.
  document.getElementById('date').value = '';

  // ── PARAMS URL (UNE SEULE FOIS) ──
  const params = new URLSearchParams(window.location.search);

  const sourceId = params.get('id');
  window.mode = params.get('mode') || (sourceId ? 'edit' : 'create');
  window.routeId = window.mode === 'edit' ? sourceId : null;

  console.log("MODE =", window.mode);
  console.log("ROUTE ID =", window.routeId);

  // Une source manquante ne doit jamais devenir une nouvelle sortie par accident.
  if (window.mode === 'edit') {
    document.querySelectorAll('.action-bar button').forEach(button=>{button.disabled=true;});
    try {
      const loaded = window.routeId && await loadRoute(window.routeId);
      if (!loaded) throw Error('load_failed');
      document.querySelectorAll('.action-bar button').forEach(button=>{button.disabled=false;});
    } catch (_) { editorLoadError('Impossible de charger la sortie. Reviens à Mes sorties pour réessayer.'); return; }
  }
  if (!['create','edit','duplicate'].includes(window.mode)) { editorLoadError('Ce lien est invalide. Reviens à Mes sorties.'); return; }
  if (window.mode === 'duplicate') {
    const buttons = document.querySelectorAll('.action-bar button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      if (!sourceId || !await loadRoute(sourceId, true)) throw new Error('Sortie source introuvable.');
      buttons.forEach(button => { button.disabled = false; });
    } catch (error) {
      const summary = document.getElementById('publication-errors');
      summary.textContent = 'Impossible de préparer la copie. Reviens à la liste des sorties pour réessayer.';
      summary.hidden = false;
      showToast(error.message || 'Chargement impossible', 'error');
    }
  }
  if (window.mode === 'create' && params.get('ride')) {
    const buttons = document.querySelectorAll('.action-bar button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      await loadReusableRide(params.get('ride'));
      buttons.forEach(button => { button.disabled = false; });
    } catch (error) {
      const summary = document.getElementById('publication-errors');
      summary.textContent = 'Impossible de charger cet itinéraire. Reviens à la bibliothèque pour réessayer.';
      summary.hidden = false;
      showToast(error.message || 'Chargement impossible', 'error');
    }
  }

  // Récupération utilisateur connecté
  try {
    const sb = await getSb();
    const { data: { user } } = await sb.auth.getUser();

    if (user) {
      var label = window.GoeloProfile
        ? window.GoeloProfile.getDisplayName(
            window.GoeloProfile.profileFromUser(user)
          )
        : "Utilisateur";

      document.getElementById('nav-username').textContent = label;

      var capEl = document.getElementById('capitaine');
      if (capEl && window.mode !== 'edit' && !capEl.value.trim() && label && label !== '?' && label !== 'Utilisateur') {
        capEl.value = label;
      }
    }
  } catch(e) { /* silencieux */ }

  syncEditorMode();
  updateProgress();
});

window.addEventListener("goelo:signup-changed", function (e) {
  var detail = e && e.detail;
  if (!detail || !window.routeId || detail.routeId !== window.routeId) return;
  loadRouteParticipants(window.routeId);
});

bindGuestParticipantUi();


/* Navigation et actions communes aux modes créer, modifier et dupliquer. */
function syncEditorMode() {
  const editing = window.mode === 'edit' && !!window.routeId;
  const status = document.getElementById('statut').value;
  const published = editing && status !== 'brouillon';
  document.getElementById('editor-title').textContent = editing ? 'Modifier la sortie' : 'Créer une sortie';
  document.getElementById('editor-nav-title').textContent = editing ? 'Modifier la sortie' : 'Créer une sortie';
  document.title = (editing ? 'Modifier la sortie' : 'Créer une sortie') + ' · GoëloRides';
  document.getElementById('editor-intro').textContent = editing ? 'Retrouve ici les informations, le parcours et la publication de cette sortie.' : 'Avec ou sans GPX, tout se prépare dans ce formulaire.';
  document.getElementById('editor-management').hidden = !editing;
  document.getElementById('editor-source').hidden = published;
  document.getElementById('editor-status').hidden = !editing;
  const view = document.getElementById('editor-view');view.hidden = !editing;
  if (editing) view.href = 'parcours.html?id=' + encodeURIComponent(window.routeId);
  document.getElementById('editor-save-draft').hidden = published;
  const publish = document.getElementById('editor-publish');
  publish.setAttribute('aria-label', published ? 'Enregistrer les modifications' : 'Publier la sortie');
  publish.querySelector('.action-bar__full-label').textContent = published ? 'Enregistrer les modifications' : 'Publier la sortie';
  publish.querySelector('.action-bar__short-label').textContent = published ? 'Enregistrer' : 'Publier';
}
function editorLoadError(message) {
  const summary=document.getElementById('publication-errors');summary.textContent=message;summary.hidden=false;
  document.querySelectorAll('.action-bar button, #editor-management button, #editor-source button').forEach(button=>{button.disabled=true;});
}
async function chooseReusableRide() {
  const dialog=document.getElementById('editor-ride-dialog'),list=document.getElementById('editor-ride-list');
  dialog.showModal();list.textContent='Chargement des itinéraires…';
  try {
    const sb=await getSb();const result=await sb.from('rides').select('id,title').order('title');
    if(result.error||!Array.isArray(result.data))throw Error('Impossible de charger la bibliothèque.');
    list.replaceChildren();
    if(!result.data.length)list.textContent='Aucun itinéraire enregistré. Tu peux importer un GPX dans le formulaire.';
    result.data.forEach(ride=>{
      const button=document.createElement('button');button.type='button';button.textContent=ride.title||'Itinéraire sans titre';
      button.addEventListener('click',async()=>{
        list.querySelectorAll('button').forEach(el=>{el.disabled=true;});
        try {await loadReusableRide(ride.id);dialog.close();syncEditorMode();showToast('Itinéraire repris. Tes informations de rendez-vous sont conservées.');}
        catch(error){showToast(error.message||'Import impossible.','error');}
        finally{list.querySelectorAll('button').forEach(el=>{el.disabled=false;});}
      });list.appendChild(button);
    });
  } catch(error) {list.textContent='La bibliothèque est indisponible. Tu peux réessayer ou importer directement un GPX.';}
}
document.getElementById('editor-pick-ride').addEventListener('click',chooseReusableRide);
document.getElementById('editor-ride-close').addEventListener('click',()=>document.getElementById('editor-ride-dialog').close());
document.getElementById('form-main').addEventListener('input',()=>{
  window.editorDirty=true;document.getElementById('save-dot').classList.remove('saved');document.getElementById('save-status').textContent='Modifications non enregistrées';
});
window.addEventListener('beforeunload',event=>{if(window.editorDirty){event.preventDefault();event.returnValue='';}});
