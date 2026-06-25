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
const FIELDS = ['titre','date','heure-rdv','lieu','capitaine','route-km','route-dplus','route-duree'];
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
    { step: 3, ids: ['route-km','route-dplus','route-duree'] },
    { step: 4, ids: ['capitaine'] },
  ];
  stepMap.forEach(({ step, ids }) => {
    const el = document.querySelector(`.step-item[data-step="${step}"]`);
    if (!el) return;
    const filled = ids.every(id => { const f = document.getElementById(id); return f && f.value.trim(); });
    if (filled && ids.length > 0) { el.classList.add('done'); el.classList.remove('active'); }
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
  } catch (e) {
    console.error(e);
    label.textContent = 'Erreur';
    showToast('Erreur : ' + e.message, 'error');
  }
}

function readRouteStats() {
  const km = parseFloat(document.getElementById('route-km')?.value);
  const dplus = parseInt(document.getElementById('route-dplus')?.value, 10);
  const duree = document.getElementById('route-duree')?.value?.trim() || '';
  return { km, dplus, duree };
}

function validateRouteStats() {
  const { km, dplus, duree } = readRouteStats();
  if (!km || km <= 0) {
    showToast('Distance requise (km > 0)', 'error');
    return false;
  }
  if (isNaN(dplus) || dplus < 0) {
    showToast('Dénivelé requis (m ≥ 0)', 'error');
    return false;
  }
  if (!duree) {
    showToast('Durée requise (ex : 2h30)', 'error');
    return false;
  }
  return true;
}

function syncRouteInputs(dist, dplus, dur) {
  const kmEl = document.getElementById('route-km');
  const dplusEl = document.getElementById('route-dplus');
  const durEl = document.getElementById('route-duree');
  if (kmEl) kmEl.value = dist;
  if (dplusEl) dplusEl.value = dplus;
  if (durEl) durEl.value = dur;
}

async function publishSortie() {
  const titre = document.getElementById('titre').value.trim();
  const date  = document.getElementById('date').value;
  if (!titre || !date) { showToast('Titre et date requis pour publier', 'error'); return; }
  if (!validateRouteStats()) return;
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
  const { km, dplus, duree } = readRouteStats();

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

  syncRouteInputs(dist.toFixed(1), Math.round(dplus), durStr);

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

/* ── FLYER GENERATOR ── */
let _flyerBgImage = null;

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

  const canvas = document.getElementById('flyer-canvas');
  const ctx    = canvas.getContext('2d');
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;

  // Données du formulaire
  const titre  = document.getElementById('titre').value || 'Sortie GoëloRides';
  const date   = document.getElementById('date').value;
  const stats  = readRouteStats();
  const dist   = stats.km ? String(stats.km) : (document.getElementById('gpx-dist').textContent || '—');
  const dplus  = !isNaN(stats.dplus) ? String(stats.dplus) : (document.getElementById('gpx-dplus').textContent || '—');
  const groupe = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const lieu   = document.getElementById('lieu').value || 'Saint-Quay-Portrieux';
  const hrdv   = document.getElementById('heure-rdv').value || '08:00';
  const niveau = document.getElementById('niveau');
  const niveauLabel = niveau.options[niveau.selectedIndex]?.text || 'Tous niveaux';

  const groupeColors = { blanc: '#9CA3AF', vert: '#3A7D44', bleu: '#1E3A8A', rouge: '#8B1A1A' };
  const gc = groupeColors[groupe] || '#3A7D44';

  // ── 1. PHOTO DE FOND (cover) ──────────────────────────────────
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

  // ── 2. OVERLAY GRADIENT sombre (bas → haut + haut) ───────────
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   'rgba(0,0,0,0.55)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0.15)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1,   'rgba(0,0,0,0.80)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── 3. BANDE VERTE EN HAUT (semi-transparente) ────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, 130);

  // ── 4. LOGO GOËLORIDES ───────────────────────────────────────
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 48px Arial, sans-serif';
  ctx.textAlign = 'left';
  // Icône vélo stylisée (chevron)
  ctx.fillStyle = '#C8F135';
  ctx.font = '700 40px Arial';
  ctx.fillText('≋', 48, 88);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 42px Arial, sans-serif';
  ctx.fillText('GOËLORIDES', 110, 88);

  // ── 5. BADGE ROND EN HAUT À DROITE ───────────────────────────
  const badgeCx = W - 110, badgeCy = 100, badgeR = 90;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR - 12, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.fill();
  // Texte badge
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = '700 18px Arial';
  ctx.fillText('COMMUNITY', badgeCx, badgeCy - 18);
  ctx.font = '700 13px Arial';
  ctx.fillText('▲', badgeCx, badgeCy + 2);
  ctx.font = '700 18px Arial';
  ctx.fillText('RIDE', badgeCx, badgeCy + 26);

  // ── 6. GRAND TITRE (style flyer de référence) ────────────────
  ctx.textAlign = 'left';
  const titreUpper = titre.toUpperCase();
  // Taille adaptée
  let titreSize = 165;
  ctx.font = `900 ${titreSize}px "Arial Black", Impact, sans-serif`;
  while (ctx.measureText(titreUpper.split(' ')[0]).width > W - 60 && titreSize > 80) {
    titreSize -= 5;
    ctx.font = `900 ${titreSize}px "Arial Black", Impact, sans-serif`;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  const mots = titreUpper.split(' ');
  let ty = 310;
  mots.forEach(mot => {
    ctx.fillText(mot, 40, ty);
    ty += titreSize * 0.95;
  });
  ctx.shadowBlur = 0;

  // ── 7. TAGLINE ───────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '400 30px Arial';
  ctx.fillText('DISCOVER. CONNECT.', 48, ty + 10);

  // ── 8. BLOCS D'INFOS (style référence) ──────────────────────
  const infoY0 = ty + 70;
  const infoLineH = 110;
  const infos = [];

  if (date) {
    const d = new Date(date + 'T00:00:00');
    const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).toUpperCase();
    infos.push({ main: jour, sub: hrdv.replace(':', 'H') });
  }
  infos.push({ main: lieu.toUpperCase(), sub: null });
  infos.push({ main: niveauLabel.toUpperCase(), sub: 'ALL LEVELS WELCOME' });

  infos.forEach((info, i) => {
    const y = infoY0 + i * infoLineH;

    // Barre verte à gauche
    ctx.fillStyle = '#C8F135';
    ctx.fillRect(0, y - 36, 8, info.sub ? 75 : 55);

    // Fond léger
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(8, y - 38, 560, info.sub ? 78 : 58);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 46px "Arial Black", sans-serif';
    ctx.fillText(info.main, 30, y);

    if (info.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '400 24px Arial';
      ctx.fillText(info.sub, 30, y + 30);
    }
  });

  // ── 9. STATS EN BAS (distance / D+ / groupe) ─────────────────
  const statsY = H - 220;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, statsY - 10, W, 120);

  const statsData = [
    { icon: '≋', label: 'TOTAL', val: dist !== '—' ? dist + ' km' : '—' },
    { icon: '◎', label: 'COMMUNITY PACE', val: groupe.toUpperCase() },
    { icon: '△', label: 'NO RACE JUST RIDE', val: dplus !== '—' ? dplus + ' m' : '' },
  ];
  statsData.forEach((s, i) => {
    const x = 80 + i * 340;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '400 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(s.icon, x, statsY + 28);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 26px Arial';
    ctx.fillText(s.label, x, statsY + 58);
    if (s.val) {
      ctx.fillStyle = '#C8F135';
      ctx.font = '700 30px Arial';
      ctx.fillText(s.val, x, statsY + 92);
    }
  });
  ctx.textAlign = 'left';

  // ── 10. FOOTER VERT ─────────────────────────────────────────
  ctx.fillStyle = '#C8F135';
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = '#000000';
  ctx.font = '700 44px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('goelorides.onrender.com', W / 2, H - 62);
  ctx.font = '400 26px Arial';
  ctx.fillText('@goelo.rides', W / 2, H - 26);

  // ── 11. HASHTAG COIN BAS DROITE ──────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '400 22px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('#GoëloRides', W - 30, H - 120);
  ctx.textAlign = 'left';

  // Afficher le résultat
  document.getElementById('flyer-wrap').style.display = 'grid';
  showToast('Flyer généré !');
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

function downloadFlyer() {
  const canvas = document.getElementById('flyer-canvas');
  const titre  = document.getElementById('titre').value || 'sortie';
  const link   = document.createElement('a');
  link.download = 'flyer-' + titre.replace(/\s+/g,'-').toLowerCase() + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Flyer téléchargé');
}

function copyFlyer() {
  const canvas = document.getElementById('flyer-canvas');
  canvas.toBlob(blob => {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => showToast('Image copiée dans le presse-papiers'))
      .catch(() => showToast('Copie non supportée — télécharge le PNG', 'error'));
  });
}

/* ── SOCIAL TEXT ── */
function generateSocial() {
  const titre  = document.getElementById('titre').value || 'Sortie GoëloRides';
  const date   = document.getElementById('date').value;
  const stats  = readRouteStats();
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

  if (kmVal != null || dplusVal != null || durVal) {
    syncRouteInputs(
      kmVal != null ? Number(kmVal).toFixed(1) : '',
      dplusVal != null ? Math.round(dplusVal) : '',
      durVal
    );
  }

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
    if (user?.email) {
      document.getElementById('nav-username').textContent = user.email.split('@')[0];
      document.getElementById('capitaine').value = user.email.split('@')[0];
    }
  } catch(e) { /* silencieux */ }

  updateProgress();
});
