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
const FIELDS = ['titre','date','heure-rdv','lieu','capitaine'];
function updateProgress() {
  let done = 0;
  FIELDS.forEach(id => { const el = document.getElementById(id); if (el && el.value.trim()) done++; });
  const gpxDone = document.getElementById('gpx-status').classList.contains('visible') ? 1 : 0;
  const total = FIELDS.length + 1;
  const pct = Math.round(((done + gpxDone) / total) * 100);
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


async function saveDraft() {
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
      if (result?.data?.route_id) {
        window.routeId = result.data.route_id;
        window.mode = 'edit';
        console.log("NEW ROUTE ID:", window.routeId);
      }
    }

    if (result.error) throw result.error;
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

async function publishSortie() {
  const titre = document.getElementById('titre').value.trim();
  const date  = document.getElementById('date').value;
  if (!titre || !date) { showToast('Titre et date requis pour publier', 'error'); return; }
  try {
    const sb = await getSb();
    const payload = buildPayload('publiee');
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
    if (result.error) throw result.error;
    document.getElementById('statut').value = 'publiee';
    updateStatusBadge('publiee');
    document.getElementById('save-dot').classList.add('saved');
    document.getElementById('save-status').textContent = 'Publié';
    showToast('🚀 Sortie publiée avec succès !');
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
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
    visibility: statut === 'publiee' ? 'public' : 'draft',
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
    p_track_name:   titre,
    p_group_label:  groupLabel,
    p_pace_label:   pace[groupe],
    p_front_config: front_config,
    p_sort_order:   50
  };
}

function duplicateSortie() {
  showToast('Sortie dupliquée — brouillon créé');
  document.getElementById('titre').value += ' (copie)';
  document.getElementById('statut').value = 'brouillon';
  updateStatusBadge('brouillon');
}

function confirmCancel() {
  document.getElementById('confirm-cancel').classList.remove('open');
  document.getElementById('statut').value = 'annulee';
  updateStatusBadge('annulee');
  showToast('Sortie annulée');
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

/* ── FLYER GENERATOR (cross-platform 4:5 + safe zone) ── */
const FLYER_CONFIG = {
  format: 'cross_platform_flyer',
  width: 1080,
  height: 1350,
  aspectRatio: '4:5',
  safeZone: true,
  platforms: ['instagram', 'facebook', 'strava'],
  fallbackSquare: true,
  squareSize: 1080
};

let _flyerBgImage = null;
let _flyerLastValidation = null;
let _flyerExportCanvas = null;

function flyerViolatingIds(validation) {
  const ids = {};
  (validation.violations || []).forEach(function (v) { ids[v.id] = true; });
  return ids;
}

function flyerValidateSafeZone(boxes, safe) {
  const violations = [];
  const byId = {};

  boxes.forEach(function (b) {
    if (!b.critical) return;
    const edges = [];
    if (b.x < safe.left - 0.5) edges.push('left');
    if (b.y < safe.top - 0.5) edges.push('top');
    if (b.x + b.w > safe.right + 0.5) edges.push('right');
    if (b.y + b.h > safe.bottom + 0.5) edges.push('bottom');
    if (!edges.length) return;

    edges.forEach(function (edge) {
      violations.push({ id: b.id, edge: edge, box: b });
    });

    if (!byId[b.id]) {
      byId[b.id] = { elementId: b.id, edges: [], box: b };
    }
    edges.forEach(function (edge) {
      if (byId[b.id].edges.indexOf(edge) === -1) byId[b.id].edges.push(edge);
    });
  });

  const issues = Object.keys(byId).map(function (key) {
    const item = byId[key];
    return {
      elementId: item.elementId,
      edges: item.edges.slice(),
      message: 'Élément « ' + item.elementId + ' » hors zone sûre (' + item.edges.join(', ') + ')'
    };
  });

  const ok = violations.length === 0;
  return {
    status: ok ? 'ok' : 'warning',
    ok: ok,
    violations: violations,
    issues: issues
  };
}

function flyerDrawSafeZoneOverlay(ctx, safe, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(248, 113, 113, 0.22)';
  ctx.fillRect(0, 0, W, safe.top);
  ctx.fillRect(0, safe.bottom, W, H - safe.bottom);
  ctx.fillRect(0, safe.top, safe.left, safe.height);
  ctx.fillRect(safe.right, safe.top, W - safe.right, safe.height);

  ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
  ctx.fillRect(safe.left, safe.top, safe.width, safe.height);

  ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(safe.left + 1.5, safe.top + 1.5, safe.width - 3, safe.height - 3);
  ctx.setLineDash([]);
  ctx.restore();
}

function flyerDrawElementBoxes(ctx, boxes, violatingIds) {
  ctx.save();
  boxes.forEach(function (b) {
    if (!b.critical) return;
    const bad = !!violatingIds[b.id];
    ctx.strokeStyle = bad ? 'rgba(248, 113, 113, 0.95)' : 'rgba(74, 222, 128, 0.75)';
    ctx.lineWidth = bad ? 4 : 2;
    if (!bad) ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.setLineDash([]);
    if (bad) {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.18)';
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    }
  });
  ctx.restore();
}

function flyerDrawDebugOverlay(ctx, boxes, safe, validation, W, H) {
  flyerDrawSafeZoneOverlay(ctx, safe, W, H);
  flyerDrawElementBoxes(ctx, boxes, flyerViolatingIds(validation));
}

function flyerRenderIssuesUi(validation) {
  const wrap = document.getElementById('flyer-issues');
  const list = document.getElementById('flyer-issues-list');
  if (!wrap || !list) return;

  if (!validation || validation.status === 'ok' || !validation.issues.length) {
    wrap.hidden = true;
    list.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  list.innerHTML = validation.issues.map(function (issue) {
    return '<li><strong>' + issue.elementId + '</strong> — ' + issue.edges.join(', ') + '</li>';
  }).join('');
}

function flyerSafeZone(W, H) {
  return {
    left: Math.round(W * 0.08),
    right: Math.round(W * 0.92),
    top: Math.round(H * 0.15),
    bottom: Math.round(H * 0.85),
    width: Math.round(W * 0.84),
    height: Math.round(H * 0.70)
  };
}

function flyerFontSize(font) {
  const m = String(font).match(/(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]) : 24;
}

function flyerScaledFont(font, scale) {
  const px = Math.round(flyerFontSize(font) * scale);
  return String(font).replace(/(\d+(?:\.\d+)?)px/, px + 'px');
}

function flyerTextBox(ctx, text, x, y, font, id, align) {
  ctx.font = font;
  const m = ctx.measureText(text);
  const size = flyerFontSize(font);
  const ascent = m.actualBoundingBoxAscent ?? size * 0.75;
  const descent = m.actualBoundingBoxDescent ?? size * 0.25;
  let bx = x;
  if (align === 'center') bx = x - m.width / 2;
  if (align === 'right') bx = x - m.width;
  return { id: id, x: bx, y: y - ascent, w: m.width, h: ascent + descent, critical: true };
}

function flyerRectBox(x, y, w, h, id) {
  return { id: id, x: x, y: y, w: w, h: h, critical: true };
}

function flyerCircleBox(cx, cy, r, id) {
  return { id: id, x: cx - r, y: cy - r, w: r * 2, h: r * 2, critical: true };
}

function flyerSplitTitle(ctx, text, maxW, baseFont, scale) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  let fontSize = Math.round(flyerFontSize(baseFont) * scale);
  while (fontSize >= 56) {
    const font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
    ctx.font = font;
    let lines = [];
    if (words.length <= 2) {
      words.forEach(function (w) { lines.push({ text: w, font: font }); });
    } else {
      let line = '';
      words.forEach(function (w) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push({ text: line, font: font });
          line = w;
        } else {
          line = test;
        }
      });
      if (line) lines.push({ text: line, font: font });
    }
    const tooWide = lines.some(function (ln) { return ctx.measureText(ln.text).width > maxW; });
    if (!tooWide && lines.length <= 4) return lines;
    fontSize -= 6;
  }
  const font = `900 56px "Arial Black", Impact, sans-serif`;
  return words.map(function (w) { return { text: w, font: font }; });
}

function flyerMeasureTitleBlock(ctx, lines) {
  let h = 0;
  lines.forEach(function (ln, i) {
    const size = flyerFontSize(ln.font);
    h += size * (i === 0 ? 0.95 : 0.88);
  });
  return h;
}

function flyerReadFormData() {
  const titre  = document.getElementById('titre').value || 'Sortie GoëloRides';
  const date   = document.getElementById('date').value;
  const stats  = readGpxStats();
  const dist   = stats.km ? String(stats.km) : (document.getElementById('gpx-dist').textContent || '—');
  const dplus  = !isNaN(stats.dplus) ? String(stats.dplus) : (document.getElementById('gpx-dplus').textContent || '—');
  const groupe = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const lieu   = document.getElementById('lieu').value || 'Saint-Quay-Portrieux';
  const hrdv   = document.getElementById('heure-rdv').value || '08:00';
  const niveau = document.getElementById('niveau');
  const niveauLabel = niveau.options[niveau.selectedIndex]?.text || 'Tous niveaux';
  return { titre, date, dist, dplus, groupe, lieu, hrdv, niveauLabel };
}

function renderCrossPlatformFlyer(ctx, data, scale) {
  const W = FLYER_CONFIG.width;
  const H = FLYER_CONFIG.height;
  const safe = flyerSafeZone(W, H);
  const pad = 20;
  const contentLeft = safe.left + pad;
  const contentW = safe.width - pad * 2;
  const boxes = [];
  scale = scale || 1;

  ctx.clearRect(0, 0, W, H);

  const imgRatio = _flyerBgImage.width / _flyerBgImage.height;
  const canvRatio = W / H;
  let sx = 0, sy = 0, sw = _flyerBgImage.width, sh = _flyerBgImage.height;
  if (imgRatio > canvRatio) {
    sw = _flyerBgImage.height * canvRatio;
    sx = (_flyerBgImage.width - sw) / 2;
  } else {
    sh = _flyerBgImage.width / canvRatio;
    sy = (_flyerBgImage.height - sh) / 2;
  }
  ctx.drawImage(_flyerBgImage, sx, sy, sw, sh, 0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const headerH = Math.round(88 * scale);
  const footerH = Math.round(82 * scale);
  const statsH = Math.round(96 * scale);
  const infoLineH = Math.round(82 * scale);

  const titleLines = flyerSplitTitle(ctx, data.titre, contentW, '900 120px "Arial Black", Impact, sans-serif', scale);
  const titleBlockH = flyerMeasureTitleBlock(ctx, titleLines);
  const taglineFont = flyerScaledFont('400 26px Arial', scale);
  const taglineH = Math.round(flyerFontSize(taglineFont) * 1.35);

  const infos = [];
  if (data.date) {
    const d = new Date(data.date + 'T00:00:00');
    const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).toUpperCase();
    infos.push({ main: jour, sub: data.hrdv.replace(':', 'H') });
  }
  infos.push({ main: data.lieu.toUpperCase(), sub: 'DEPART' });
  infos.push({ main: data.niveauLabel.toUpperCase(), sub: 'TOUS NIVEAUX' });

  const infosH = infos.length * infoLineH;
  const middleH = safe.height - headerH - footerH;
  const contentH = titleBlockH + taglineH + infosH + statsH + Math.round(24 * scale);
  let blockY = safe.top + headerH + Math.max(0, (middleH - contentH) / 2);

  const logoY = safe.top + Math.round(52 * scale);
  const logoIconFont = flyerScaledFont('700 34px Arial', scale);
  const logoTextFont = flyerScaledFont('700 36px Arial, sans-serif', scale);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#C8F135';
  ctx.font = logoIconFont;
  ctx.fillText('≋', contentLeft, logoY);
  boxes.push(flyerTextBox(ctx, '≋', contentLeft, logoY, logoIconFont, 'logo-icon'));
  ctx.fillStyle = '#FFFFFF';
  ctx.font = logoTextFont;
  const logoTextX = contentLeft + Math.round(52 * scale);
  ctx.fillText('GOËLORIDES', logoTextX, logoY);
  boxes.push(flyerTextBox(ctx, 'GOËLORIDES', logoTextX, logoY, logoTextFont, 'logo-text'));

  const badgeR = Math.round(72 * scale);
  const badgeCx = safe.right - pad - badgeR;
  const badgeCy = safe.top + Math.round(52 * scale);
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  boxes.push(flyerCircleBox(badgeCx, badgeCy, badgeR, 'badge'));
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const badgeFont1 = flyerScaledFont('700 15px Arial', scale);
  const badgeFont2 = flyerScaledFont('700 15px Arial', scale);
  ctx.font = badgeFont1;
  ctx.fillText('COMMUNAUTE', badgeCx, badgeCy - Math.round(14 * scale));
  boxes.push(flyerTextBox(ctx, 'COMMUNAUTE', badgeCx, badgeCy - Math.round(14 * scale), badgeFont1, 'badge-t1', 'center'));
  ctx.font = badgeFont2;
  ctx.fillText('RIDE', badgeCx, badgeCy + Math.round(18 * scale));
  boxes.push(flyerTextBox(ctx, 'RIDE', badgeCx, badgeCy + Math.round(18 * scale), badgeFont2, 'badge-t2', 'center'));

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  let ty = blockY;
  titleLines.forEach(function (ln) {
    ctx.font = ln.font;
    ctx.fillText(ln.text, contentLeft, ty);
    boxes.push(flyerTextBox(ctx, ln.text, contentLeft, ty, ln.font, 'title-' + ln.text));
    ty += flyerFontSize(ln.font) * 0.9;
  });
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = taglineFont;
  ctx.fillText('DÉCOUVRIR | RENCONTRER', contentLeft, ty + Math.round(8 * scale));
  boxes.push(flyerTextBox(ctx, 'DÉCOUVRIR | RENCONTRER', contentLeft, ty + Math.round(8 * scale), taglineFont, 'tagline'));
  ty += taglineH + Math.round(12 * scale);

  const infoMainFont = flyerScaledFont('700 38px "Arial Black", sans-serif', scale);
  const infoSubFont = flyerScaledFont('400 20px Arial', scale);
  const infoBlockW = contentW;
  infos.forEach(function (info, i) {
    const y = ty + i * infoLineH;
    const blockH = info.sub ? Math.round(68 * scale) : Math.round(50 * scale);
    ctx.fillStyle = '#C8F135';
    ctx.fillRect(contentLeft, y - Math.round(30 * scale), 6, blockH);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(contentLeft + 6, y - Math.round(32 * scale), infoBlockW - 6, blockH + 4);
    boxes.push(flyerRectBox(contentLeft, y - Math.round(32 * scale), infoBlockW, blockH + 4, 'info-bg-' + i));
    ctx.fillStyle = '#FFFFFF';
    ctx.font = infoMainFont;
    ctx.fillText(info.main, contentLeft + Math.round(16 * scale), y);
    boxes.push(flyerTextBox(ctx, info.main, contentLeft + Math.round(16 * scale), y, infoMainFont, 'info-main-' + i));
    if (info.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.58)';
      ctx.font = infoSubFont;
      ctx.fillText(info.sub, contentLeft + Math.round(16 * scale), y + Math.round(26 * scale));
      boxes.push(flyerTextBox(ctx, info.sub, contentLeft + Math.round(16 * scale), y + Math.round(26 * scale), infoSubFont, 'info-sub-' + i));
    }
  });
  ty += infosH + Math.round(8 * scale);

  const statsY = ty;
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(contentLeft, statsY, contentW, statsH);
  boxes.push(flyerRectBox(contentLeft, statsY, contentW, statsH, 'stats-bar'));

  const statsData = [
    { icon: '≋', label: 'TOTAL', val: data.dist !== '—' ? data.dist + ' km' : '—' },
    { icon: '◎', label: 'ALLURE GROUPE', val: data.groupe.toUpperCase() },
    { icon: '△', label: 'PAS DE COURSE, JUST RIDE', val: data.dplus !== '—' ? data.dplus + ' m' : '' }
  ];
  const statLabelFont = flyerScaledFont('700 22px Arial', scale);
  const statValFont = flyerScaledFont('700 26px Arial', scale);
  const statIconFont = flyerScaledFont('400 20px Arial', scale);
  statsData.forEach(function (s, i) {
    const x = contentLeft + contentW * (i + 0.5) / 3;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = statIconFont;
    ctx.fillText(s.icon, x, statsY + Math.round(24 * scale));
    boxes.push(flyerTextBox(ctx, s.icon, x, statsY + Math.round(24 * scale), statIconFont, 'stat-icon-' + i, 'center'));
    ctx.fillStyle = '#FFFFFF';
    ctx.font = statLabelFont;
    ctx.fillText(s.label, x, statsY + Math.round(50 * scale));
    boxes.push(flyerTextBox(ctx, s.label, x, statsY + Math.round(50 * scale), statLabelFont, 'stat-label-' + i, 'center'));
    if (s.val) {
      ctx.fillStyle = '#C8F135';
      ctx.font = statValFont;
      ctx.fillText(s.val, x, statsY + Math.round(78 * scale));
      boxes.push(flyerTextBox(ctx, s.val, x, statsY + Math.round(78 * scale), statValFont, 'stat-val-' + i, 'center'));
    }
  });
  ctx.textAlign = 'left';

  const footerY = safe.bottom - footerH;
  ctx.fillStyle = '#C8F135';
  ctx.fillRect(contentLeft, footerY, contentW, footerH);
  boxes.push(flyerRectBox(contentLeft, footerY, contentW, footerH, 'footer'));
  ctx.fillStyle = '#000000';
  const footerMainFont = flyerScaledFont('700 36px "Arial Black", sans-serif', scale);
  const footerSubFont = flyerScaledFont('400 22px Arial', scale);
  ctx.textAlign = 'center';
  ctx.font = footerMainFont;
  const footerMainY = footerY + Math.round(36 * scale);
  ctx.fillText('goelorides.onrender.com', safe.left + safe.width / 2, footerMainY);
  boxes.push(flyerTextBox(ctx, 'goelorides.onrender.com', safe.left + safe.width / 2, footerMainY, footerMainFont, 'footer-url', 'center'));
  ctx.font = footerSubFont;
  const footerSubY = footerY + Math.round(64 * scale);
  ctx.fillText('@goelo.rides  #GoëloRides', safe.left + safe.width / 2, footerSubY);
  boxes.push(flyerTextBox(ctx, '@goelo.rides  #GoëloRides', safe.left + safe.width / 2, footerSubY, footerSubFont, 'footer-social', 'center'));
  ctx.textAlign = 'left';

  return { boxes: boxes, safe: safe, scale: scale };
}

function assertFlyerExportReady() {
  if (!_flyerExportCanvas) {
    showToast('Génère d\'abord le flyer', 'error');
    return false;
  }
  return true;
}

function flyerCanvasToSquare(sourceCanvas) {
  const size = FLYER_CONFIG.squareSize;
  const cropY = Math.round((FLYER_CONFIG.height - size) / 2);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d');
  octx.drawImage(sourceCanvas, 0, cropY, size, size, 0, 0, size, size);
  return out;
}

function onFlyerBgSelected(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      _flyerBgImage = img;
      document.getElementById('flyer-bg-name').textContent = file.name;
      document.getElementById('flyer-photo-pick').style.display = 'none';
      document.getElementById('flyer-ready').style.display = 'block';
      showToast('Photo chargée — clique sur Générer le flyer');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function generateFlyer() {
  if (!_flyerBgImage) {
    showToast('Choisis d\'abord la photo de fond', 'error');
    return;
  }

  const W = FLYER_CONFIG.width;
  const H = FLYER_CONFIG.height;
  const data = flyerReadFormData();
  let bestScale = 1;
  let bestResult = null;
  let bestValidation = null;
  let fewestViolations = Infinity;

  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = 1 - attempt * 0.07;
    const probe = document.createElement('canvas');
    probe.width = W;
    probe.height = H;
    const probeCtx = probe.getContext('2d');
    const result = renderCrossPlatformFlyer(probeCtx, data, scale);
    const validation = flyerValidateSafeZone(result.boxes, result.safe);
    const count = validation.violations.length;
    if (count < fewestViolations) {
      fewestViolations = count;
      bestScale = scale;
      bestResult = result;
      bestValidation = validation;
    }
    if (validation.ok) break;
  }

  const clean = document.createElement('canvas');
  clean.width = W;
  clean.height = H;
  const cleanCtx = clean.getContext('2d');
  bestResult = renderCrossPlatformFlyer(cleanCtx, data, bestScale);
  bestValidation = flyerValidateSafeZone(bestResult.boxes, bestResult.safe);
  _flyerExportCanvas = clean;
  _flyerLastValidation = bestValidation;

  const canvas = document.getElementById('flyer-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  ctx.drawImage(clean, 0, 0);
  flyerDrawDebugOverlay(ctx, bestResult.boxes, bestResult.safe, bestValidation, W, H);

  flyerRenderIssuesUi(bestValidation);
  document.getElementById('flyer-wrap').style.display = 'grid';

  if (bestValidation.status === 'warning') {
    console.warn('[flyer] safe zone warnings', bestValidation.issues);
    showToast(
      'Flyer généré avec ' + bestValidation.issues.length + ' avertissement(s) zone sûre'
    );
  } else {
    showToast('Flyer 4:5 validé (Instagram · Facebook · Strava)');
  }

  return _flyerLastValidation;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word + ' ';
      y += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

function downloadFlyer(platform) {
  if (!assertFlyerExportReady()) return;

  const titre = document.getElementById('titre').value || 'sortie';
  const slug = titre.replace(/\s+/g, '-').toLowerCase();
  const src = _flyerExportCanvas || document.getElementById('flyer-canvas');
  const isStrava = platform === 'strava' && FLYER_CONFIG.fallbackSquare;

  const exportCanvas = isStrava ? flyerCanvasToSquare(src) : src;
  const link = document.createElement('a');
  link.download = 'flyer-' + slug + (isStrava ? '-strava-1080' : '-4x5') + '.png';
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
  showToast(isStrava ? 'Flyer carré Strava téléchargé' : 'Flyer 4:5 téléchargé');
}

function copyFlyer() {
  if (!assertFlyerExportReady()) return;

  const canvas = _flyerExportCanvas;
  canvas.toBlob(function (blob) {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(function () { showToast('Image copiée dans le presse-papiers'); })
      .catch(function () { showToast('Copie non supportée — télécharge le PNG', 'error'); });
  });
}

/* ── SOCIAL TEXT ── */
function generateSocial() {
  const titre  = document.getElementById('titre').value || 'Sortie GoëloRides';
  const date   = document.getElementById('date').value;
  const stats  = readGpxStats();
  const dist   = stats.km ? String(stats.km) : (document.getElementById('gpx-dist').textContent || '—');
  const dplus  = !isNaN(stats.dplus) ? String(stats.dplus) : (document.getElementById('gpx-dplus').textContent || '—');
  const groupe = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const hrdv   = document.getElementById('heure-rdv').value || '08h30';
  const lieu   = document.getElementById('lieu').value || 'Saint-Quay-Portrieux';

  const dateStr = date ? new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'prochainement';

  const fb = `🚴 ${titre}\n\nOn repart sur les routes du Goëlo !\n\n📅 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}\n⏰ RDV ${hrdv} — ${lieu}\n📍 Groupe ${groupe.charAt(0).toUpperCase() + groupe.slice(1)}${dist !== '—' ? ' · ' + dist + ' km' : ''}${dplus !== '—' ? ' · ' + dplus + ' m D+' : ''}\n\nInscription et infos sur goelorides.onrender.com\n\n#GoëloRides #Cyclisme #SaintQuayPortrieux #Bretagne`;

  const ig = `🚴‍♂️ ${titre}\n\n${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · Groupe ${groupe.toUpperCase()}${dist !== '—' ? ' · ' + dist + ' km' : ''}\n\nInfos & inscription en bio 🔗\n\n#GoëloRides #Vélo #Bretagne #CyclismeBretagne #CoëGoëlo #SaintQuay #CyclistesBretons #Sortie`;

  document.getElementById('fb-text').textContent = fb;
  document.getElementById('ig-text').textContent = ig;
  showToast('Textes générés');
}

function copyText(id) {
  const txt = document.getElementById(id).textContent;
  if (!txt || txt.startsWith('—')) { showToast('Génère le texte d\'abord', 'error'); return; }
  navigator.clipboard.writeText(txt).then(() => showToast('Texte copié'));
}

async function loadRoute(routeId) {
  const sb = await getSb();

  const { data, error } = await sb
    .from('routes')
    .select('*')
    .eq('id', routeId)
    .single();

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  populateForm(data);
  await loadRouteParticipants(routeId);
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

  const groupe = (fc.levelClass || '').replace('level-', '') ||
    (route.group_label || '').toLowerCase().match(/blanc|vert|bleu|rouge/)?.[0] || 'vert';
  const groupeEl = document.querySelector('input[name="groupe"][value="' + groupe + '"]');
  if (groupeEl) groupeEl.checked = true;

  const type = fc.raceType || 'route';
  const typeEl = document.querySelector('input[name="type"][value="' + type + '"]');
  if (typeEl) typeEl.checked = true;

  document.getElementById('rte-desc').innerHTML =
    fc.description || fc.shortDesc || '';

  const statut = fc.sortieStatus || (fc.visibility === 'public' ? 'publiee' : 'brouillon');
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
  // Date par défaut : prochaine sortie (samedi suivant)
  const now = new Date();
  const day = now.getDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + daysUntilSat);
  document.getElementById('date').value = nextSat.toISOString().split('T')[0];

  // ── PARAMS URL (UNE SEULE FOIS) ──
  const params = new URLSearchParams(window.location.search);

  window.routeId = params.get('id');
  window.mode = params.get('mode') || 'create';

  console.log("MODE =", window.mode);
  console.log("ROUTE ID =", window.routeId);

  // ── LOAD MODE EDIT ──
  if (window.mode === 'edit' && window.routeId) {
    await loadRoute(window.routeId);
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
      if (capEl && window.mode !== 'edit' && !capEl.value.trim()) {
        capEl.value = label;
      }
    }
  } catch(e) { /* silencieux */ }

  updateProgress();
});

window.addEventListener("goelo:signup-changed", function (e) {
  var detail = e && e.detail;
  if (!detail || !window.routeId || detail.routeId !== window.routeId) return;
  loadRouteParticipants(window.routeId);
});

bindGuestParticipantUi();
