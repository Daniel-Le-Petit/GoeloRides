/**
 * GoëloRides — js/newclaudegestion-route.js
 * Gestion des sorties : création (?mode=create) et édition (?mode=edit&id=xxx)
 *
 * Corrections appliquées :
 *  - getSb singleton sur window.__GOELO_SB__ (résistant au double chargement)
 *  - fetchAllRoutes() utilise la RPC routes_list (aligné avec sorties.js)
 *    avec p_filter: { includeNonPublic: true } pour voir brouillons + publiées
 *  - loadRoute() continue d'utiliser .from('routes') pour l'édition unitaire
 *  - buildPayload écrit captain (et non rideLeader) — clé lue par sorties.js
 *  - meetTime = heure RDV, rideTime = heure départ (cohérent avec sorties.js)
 */

console.log('🔥 newclaudegestion-route.js LOADED — ' + new Date().toISOString());
window.__DEBUG_GS__ = true;

/* ═══════════════════════════════════════════════════════════════
   ÉTAT GLOBAL
   ═══════════════════════════════════════════════════════════════ */
window.mode    = 'create';
window.routeId = null;
window.currentEmbeddedPoints = [];
window.currentCoverImage     = '';

/* ═══════════════════════════════════════════════════════════════
   SUPABASE — singleton robuste (résistant au double chargement)
   ═══════════════════════════════════════════════════════════════ */
if (typeof window.__GOELO_SB__ === 'undefined') {
  window.__GOELO_SB__ = null;
}

async function getSb() {
  if (window.__GOELO_SB__) return window.__GOELO_SB__;

  const url = (window.GOELO_SUPABASE_URL  || '').trim();
  const key = (window.GOELO_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) {
    throw new Error('Supabase config manquante (GOELO_SUPABASE_URL ou GOELO_SUPABASE_ANON_KEY non définis)');
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="supabase-js"]');
      if (existing) {
        if (window.supabase?.createClient) { resolve(); return; }
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload  = () => { console.log('✅ Supabase UMD chargé'); resolve(); };
      s.onerror = () => reject(new Error('Impossible de charger Supabase UMD'));
      document.head.appendChild(s);
    });
  }

  if (typeof window.supabase?.createClient !== 'function') {
    throw new Error('window.supabase.createClient indisponible après chargement');
  }

  window.__GOELO_SB__ = window.supabase.createClient(url, key);
  console.log('✅ Supabase client prêt');
  return window.__GOELO_SB__;
}

/* ═══════════════════════════════════════════════════════════════
   FETCH TOUTES LES ROUTES (vue admin)
   Utilise la même RPC routes_list que sorties.js,
   mais avec includeNonPublic: true pour voir brouillons + publiées.
   Aligné avec sorties.js : même source de données, filtre différent.
   ═══════════════════════════════════════════════════════════════ */
async function fetchAllRoutes() {
  const cfg = _getSupabaseConfig();
  if (!cfg) {
    console.warn('fetchAllRoutes : config Supabase manquante');
    return [];
  }
  try {
    const res = await fetch(cfg.url + '/rest/v1/rpc/routes_list', {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ p_filter: { includeNonPublic: true } })
    });
    if (!res.ok) {
      console.warn('fetchAllRoutes : routes_list HTTP', res.status);
      return [];
    }
    const raw = await res.json();
    const rows = Array.isArray(raw) ? raw
      : (raw && Array.isArray(raw.routes)) ? raw.routes
      : [];
    console.log('📋 fetchAllRoutes : ' + rows.length + ' routes reçues');
    return rows;
  } catch (err) {
    console.error('fetchAllRoutes error:', err);
    return [];
  }
}

function _getSupabaseConfig() {
  const url = (window.GOELO_SUPABASE_URL  || '').trim();
  const key = (window.GOELO_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || url.indexOf('xxxxxxxx.supabase.co') !== -1) return null;
  return { url: url.replace(/\/?$/, ''), key };
}

/* ═══════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

/* ═══════════════════════════════════════════════════════════════
   PROGRESSION WIZARD
   ═══════════════════════════════════════════════════════════════ */
const PROGRESS_FIELDS = ['titre', 'date', 'heure-rdv', 'lieu', 'capitaine'];

function updateProgress() {
  let done = 0;
  PROGRESS_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value.trim()) done++;
  });
  const gpxDone = document.getElementById('gpx-status')?.classList.contains('visible') ? 1 : 0;
  const total   = PROGRESS_FIELDS.length + 1;
  const pct     = Math.round(((done + gpxDone) / total) * 100);
  const bar   = document.getElementById('progress-bar');
  const pctEl = document.getElementById('progress-pct');
  if (bar)   bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  const stepMap = [
    { step: 1, ids: ['titre'] },
    { step: 2, ids: ['date', 'heure-rdv', 'lieu'] },
    { step: 3, ids: [] },
    { step: 4, ids: ['capitaine'] },
  ];
  stepMap.forEach(({ step, ids }) => {
    const el = document.querySelector(`.step-item[data-step="${step}"]`);
    if (!el || ids.length === 0) return;
    const filled = ids.every(id => {
      const f = document.getElementById(id);
      return f && f.value.trim();
    });
    if (filled) { el.classList.add('done'); el.classList.remove('active'); }
  });
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION WIZARD
   ═══════════════════════════════════════════════════════════════ */
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
  const stepNum = id.replace('s', '');
  document.querySelector(`.step-item[data-step="${stepNum}"]`)?.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════
   RICH TEXT EDITOR
   ═══════════════════════════════════════════════════════════════ */
function fmt(cmd) {
  if (cmd === 'createLink') {
    const url = prompt('URL du lien :');
    if (url) document.execCommand('createLink', false, url);
  } else {
    document.execCommand(cmd, false, null);
  }
  document.getElementById('rte-desc')?.focus();
}

/* ═══════════════════════════════════════════════════════════════
   PARTICIPANTS
   ═══════════════════════════════════════════════════════════════ */
function changeNum(delta) {
  const el = document.getElementById('num-participants');
  if (!el) return;
  const val = parseInt(el.value) + delta;
  if (val >= 1) el.value = val;
}

function toggleIllimite(cb) {
  const el   = document.getElementById('num-participants');
  const btns = document.querySelectorAll('.num-btn');
  el.disabled = cb.checked;
  btns.forEach(b => b.disabled = cb.checked);
  el.value = cb.checked ? '∞' : '20';
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BADGE
   ═══════════════════════════════════════════════════════════════ */
function updateStatusBadge(val) {
  const badge = document.getElementById('status-badge');
  if (!badge) return;
  const map = {
    brouillon: ['status-pill--draft',  '● Brouillon'],
    publiee:   ['status-pill--pub',    '● Publiée'],
    complete:  ['status-pill--pub',    '● Complète'],
    annulee:   ['status-pill--cancel', '● Annulée'],
    reportee:  ['status-pill--draft',  '● Reportée'],
  };
  const [cls, label] = map[val] || ['status-pill--draft', '● ' + val];
  badge.className   = 'status-pill ' + cls;
  badge.textContent = label;
}

/* ═══════════════════════════════════════════════════════════════
   BUILD PAYLOAD
   CORRECTION : meetTime = heure RDV, rideTime = heure départ.
   CORRECTION : clé captain (lue par sorties.js dbRowToSortie).
   ═══════════════════════════════════════════════════════════════ */
function buildPayload(statut) {
  const groupe  = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const type    = document.querySelector('input[name="type"]:checked')?.value   || 'route';
  const titre   = document.getElementById('titre').value.trim();
  const date    = document.getElementById('date').value;
  const hRdv    = document.getElementById('heure-rdv').value;   // heure RDV
  const hDepart = document.getElementById('heure-depart').value; // heure départ
  const lieu    = document.getElementById('lieu').value.trim();
  const ville   = document.getElementById('ville').value.trim();
  const cp      = document.getElementById('cp').value.trim();
  const cap     = document.getElementById('capitaine').value.trim();
  const niveau  = document.getElementById('niveau').value;
  const illimite = document.getElementById('illimite')?.checked;
  const maxP    = illimite ? null : parseInt(document.getElementById('num-participants').value) || null;
  const desc    = document.getElementById('rte-desc')?.innerHTML || '';

  const pace = {
    blanc: '18–22 km/h',
    vert:  '22–25 km/h',
    bleu:  '25–30 km/h',
    rouge: '30+ km/h'
  };
  const groupLabel = 'Groupe ' + groupe.charAt(0).toUpperCase() + groupe.slice(1);

  const front_config = {
    visibility:        statut === 'publiee' ? 'public' : 'draft',
    sortieStatus:      statut === 'annulee' ? 'cancelled' : 'open',
    raceType:          type,
    levelClass:        'level-' + groupe,
    rideDateIso:       date,
    // CORRECTION : meetTime = RDV, rideTime = départ (cohérent avec sorties.js)
    meetTime:          hRdv,
    rideTime:          hDepart,
    meetPlace:         lieu || 'Parking du Kasino',
    city:              ville,
    cp:                cp,
    // CORRECTION : clé "captain" (lue par sorties.js, pas "rideLeader")
    captain:           cap,
    niveau:            niveau,
    maxParticipants:   maxP,
    description:       desc,
    embeddedPoints:    window.currentEmbeddedPoints || [],
    coverImageDataUrl: window.currentCoverImage     || '',
  };

  return {
    p_track_name:   titre,
    p_group_label:  groupLabel,
    p_pace_label:   pace[groupe] || '22–25 km/h',
    p_front_config: front_config,
    p_sort_order:   50,
  };
}

/* ═══════════════════════════════════════════════════════════════
   SAVE DRAFT
   ═══════════════════════════════════════════════════════════════ */
async function saveDraft() {
  const dot   = document.getElementById('save-dot');
  const label = document.getElementById('save-status');
  if (dot)   dot.classList.remove('saved');
  if (label) label.textContent = 'Sauvegarde…';
  try {
    const sb      = await getSb();
    const payload = buildPayload('brouillon');
    console.log('💾 saveDraft | mode:', window.mode, '| routeId:', window.routeId);
    let result;
    if (window.mode === 'edit' && window.routeId) {
      result = await sb.rpc('route_update', {
        p_route_id:     window.routeId,
        p_track_name:   payload.p_track_name,
        p_group_label:  payload.p_group_label,
        p_pace_label:   payload.p_pace_label,
        p_front_config: payload.p_front_config,
        p_sort_order:   payload.p_sort_order,
      });
    } else {
      result = await sb.rpc('route_create', payload);
      if (result?.data) {
        const newId = result.data.route_id || result.data;
        if (newId && typeof newId === 'string') {
          window.routeId = newId;
          window.mode    = 'edit';
          const u = new URL(window.location.href);
          u.searchParams.set('mode', 'edit');
          u.searchParams.set('id', window.routeId);
          window.history.replaceState({}, '', u.toString());
          console.log('✅ Nouvelle route créée, id:', window.routeId);
        }
      }
    }
    if (result?.error) throw result.error;
    if (dot)   dot.classList.add('saved');
    if (label) label.textContent = 'Sauvegardé ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    showToast('Brouillon sauvegardé');
  } catch (e) {
    console.error('❌ saveDraft error:', e);
    if (label) label.textContent = 'Erreur';
    showToast('Erreur : ' + (e.message || e), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PUBLISH
   ═══════════════════════════════════════════════════════════════ */
async function publishSortie() {
  const titre = document.getElementById('titre')?.value.trim();
  const date  = document.getElementById('date')?.value;
  if (!titre || !date) {
    showToast('Titre et date requis pour publier', 'error');
    return;
  }
  try {
    const sb      = await getSb();
    const payload = buildPayload('publiee');
    console.log('🚀 publishSortie | mode:', window.mode, '| routeId:', window.routeId);
    let result;
    if (window.mode === 'edit' && window.routeId) {
      result = await sb.rpc('route_update', {
        p_route_id:     window.routeId,
        p_track_name:   payload.p_track_name,
        p_group_label:  payload.p_group_label,
        p_pace_label:   payload.p_pace_label,
        p_front_config: payload.p_front_config,
        p_sort_order:   payload.p_sort_order,
      });
    } else {
      result = await sb.rpc('route_create', payload);
      if (result?.data) {
        const newId = result.data.route_id || result.data;
        if (newId && typeof newId === 'string') {
          window.routeId = newId;
          window.mode    = 'edit';
          const u = new URL(window.location.href);
          u.searchParams.set('mode', 'edit');
          u.searchParams.set('id', window.routeId);
          window.history.replaceState({}, '', u.toString());
        }
      }
    }
    if (result?.error) throw result.error;
    const statutEl = document.getElementById('statut');
    if (statutEl) statutEl.value = 'publiee';
    updateStatusBadge('publiee');
    const dot   = document.getElementById('save-dot');
    const label = document.getElementById('save-status');
    if (dot)   dot.classList.add('saved');
    if (label) label.textContent = 'Publié';
    showToast('🚀 Sortie publiée avec succès !');
  } catch (e) {
    console.error('❌ publishSortie error:', e);
    showToast('Erreur : ' + (e.message || e), 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   DUPLICATE & CANCEL
   ═══════════════════════════════════════════════════════════════ */
function duplicateSortie() {
  const titreEl  = document.getElementById('titre');
  const statutEl = document.getElementById('statut');
  if (titreEl)  titreEl.value  = titreEl.value + ' (copie)';
  if (statutEl) statutEl.value = 'brouillon';
  window.mode    = 'create';
  window.routeId = null;
  updateStatusBadge('brouillon');
  showToast('Sortie dupliquée — modifie la date et publie');
}

function confirmCancel() {
  document.getElementById('confirm-cancel')?.classList.remove('open');
  const statutEl = document.getElementById('statut');
  if (statutEl) statutEl.value = 'annulee';
  updateStatusBadge('annulee');
  showToast('Sortie annulée');
}

/* ═══════════════════════════════════════════════════════════════
   LOAD ROUTE (mode edit) — lecture unitaire via .from()
   Alignement : on lit les mêmes champs que dbRowToSortie() dans sorties.js
   ═══════════════════════════════════════════════════════════════ */
let __loadRouteRunning = false;

async function loadRoute(id) {
  if (__loadRouteRunning) { console.warn('loadRoute bloqué (déjà en cours)'); return; }
  __loadRouteRunning = true;
  console.log('📥 loadRoute | id:', id);
  try {
    const sb = await getSb();
    const { data, error } = await sb
      .from('routes')
      .select('id, track_name, group_label, pace_label, sort_order, route_kind, front_config, is_active')
      .eq('id', id)
      .maybeSingle();
    console.log('📥 loadRoute data:', data, '| error:', error);
    if (error) throw error;
    if (!data) { showToast('Sortie introuvable (id: ' + id + ')', 'error'); return; }
    populateForm(data);
  } catch (e) {
    console.error('❌ loadRoute error:', e);
    showToast('Impossible de charger la sortie : ' + (e.message || e), 'error');
  }
  __loadRouteRunning = false;
}

/* ── POPULATE FORM depuis une route Supabase ── */
function populateForm(route) {
  const fc = (typeof route.front_config === 'string')
    ? JSON.parse(route.front_config)
    : (route.front_config || {});
  console.log('📋 populateForm | route:', route.id, '| fc:', fc);

  const titreEl = document.getElementById('titre');
  if (titreEl) titreEl.value = route.track_name || '';

  const dateEl = document.getElementById('date');
  if (dateEl) dateEl.value = fc.rideDateIso || '';

  // CORRECTION : meetTime = RDV, rideTime = départ
  const hRdvEl = document.getElementById('heure-rdv');
  if (hRdvEl) hRdvEl.value = fc.meetTime || '08:30';

  const hDepartEl = document.getElementById('heure-depart');
  if (hDepartEl) hDepartEl.value = fc.rideTime || '09:00';

  const lieuEl = document.getElementById('lieu');
  if (lieuEl) lieuEl.value = fc.meetPlace || '';

  const villeEl = document.getElementById('ville');
  if (villeEl) villeEl.value = fc.city || '';

  const cpEl = document.getElementById('cp');
  if (cpEl) cpEl.value = fc.cp || '';

  // CORRECTION : lire fc.captain (clé unifiée)
  const capEl = document.getElementById('capitaine');
  if (capEl) capEl.value = fc.captain || fc.rideLeader || '';

  const descEl = document.getElementById('rte-desc');
  if (descEl) descEl.innerHTML = fc.description || '';

  const groupe = fc.levelClass?.replace('level-', '') || 'vert';
  const groupeRadio = document.getElementById('g-' + groupe);
  if (groupeRadio) groupeRadio.checked = true;

  const type = fc.raceType || 'route';
  const typeRadio = document.getElementById('t-' + type);
  if (typeRadio) typeRadio.checked = true;

  const niveauEl = document.getElementById('niveau');
  if (niveauEl && fc.niveau) niveauEl.value = fc.niveau;

  const statutEl = document.getElementById('statut');
  const statut = fc.sortieStatus === 'cancelled' ? 'annulee'
               : fc.visibility   === 'public'    ? 'publiee'
               : 'brouillon';
  if (statutEl) statutEl.value = statut;
  updateStatusBadge(statut);

  if (fc.maxParticipants != null) {
    const maxEl = document.getElementById('num-participants');
    if (maxEl) maxEl.value = fc.maxParticipants;
  }

  const distEl  = document.getElementById('gpx-dist');
  const dplusEl = document.getElementById('gpx-dplus');
  if (distEl  && fc.stats?.totalKm)   distEl.textContent  = parseFloat(fc.stats.totalKm).toFixed(1);
  if (dplusEl && fc.stats?.elevGainM) dplusEl.textContent = fc.stats.elevGainM;

  if (Array.isArray(fc.embeddedPoints) && fc.embeddedPoints.length > 0) {
    window.currentEmbeddedPoints = fc.embeddedPoints;
    const coords = fc.embeddedPoints.map(p => {
      if (Array.isArray(p)) return { lat: p[0], lng: p[1], ele: p[2] || 0 };
      return { lat: p.lat, lng: p.lng, ele: p.ele || 0 };
    });
    const gpxStatus = document.getElementById('gpx-status');
    if (gpxStatus) {
      gpxStatus.classList.add('visible');
      const msgEl = document.getElementById('gpx-msg');
      if (msgEl) msgEl.textContent = '✓ Parcours chargé depuis la base';
    }
    initMap(coords);
    const hasEle = coords.some(c => c.ele !== 0);
    if (hasEle) drawElevation(coords);
  }

  if (fc.coverImageDataUrl) {
    window.currentCoverImage = fc.coverImageDataUrl;
    const img = new Image();
    img.onload = () => {
      _flyerBgImage = img;
      document.getElementById('flyer-photo-pick').style.display = 'none';
      document.getElementById('flyer-ready').style.display = 'block';
      const nameEl = document.getElementById('flyer-bg-name');
      if (nameEl) nameEl.textContent = 'Image restaurée depuis la base';
    };
    img.src = fc.coverImageDataUrl;
  }

  updateProgress();
}

/* ═══════════════════════════════════════════════════════════════
   GPX IMPORT
   ═══════════════════════════════════════════════════════════════ */
let gpxMap = null;

function _bindGpxEvents() {
  const fileInput = document.getElementById('gpx-file');
  const zone      = document.getElementById('gpx-zone');
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file || !file.name.endsWith('.gpx')) {
        showToast('Fichier GPX invalide (.gpx requis)', 'error');
        return;
      }
      loadGpx(file);
    });
  }
  if (zone) {
    zone.addEventListener('click', () => fileInput?.click());
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) loadGpx(file);
    });
  }
}

function loadGpx(file) {
  const statusEl = document.getElementById('gpx-status');
  const dotEl    = document.getElementById('gpx-dot');
  const fnameEl  = document.getElementById('gpx-filename');
  const msgEl    = document.getElementById('gpx-msg');
  if (statusEl) statusEl.classList.add('visible');
  if (dotEl)    dotEl.classList.add('loading');
  if (fnameEl)  fnameEl.textContent = file.name;
  if (msgEl)    msgEl.textContent   = 'Analyse du parcours en cours…';
  ;['gpx-dist','gpx-dplus','gpx-dur','gpx-pts'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const reader = new FileReader();
  reader.onload = function (e) {
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
  window.currentEmbeddedPoints = coords.map(c => [c.lat, c.lng, c.ele]);
  let dist = 0;
  for (let i = 1; i < coords.length; i++) dist += haversine(coords[i-1], coords[i]);
  let dplus = 0;
  for (let i = 1; i < coords.length; i++) {
    const diff = coords[i].ele - coords[i-1].ele;
    if (diff > 0) dplus += diff;
  }
  const groupeVal = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const speeds    = { blanc: 20, vert: 22, bleu: 25, rouge: 30 };
  const vitesse   = speeds[groupeVal] || 22;
  const heures    = dist / vitesse;
  const hh        = Math.floor(heures);
  const mm        = Math.round((heures - hh) * 60);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('gpx-dist',  dist.toFixed(1));
  set('gpx-dplus', Math.round(dplus));
  set('gpx-dur',   hh + 'h' + String(mm).padStart(2, '0'));
  set('gpx-pts',   pts.length);
  const dotEl = document.getElementById('gpx-dot');
  const msgEl = document.getElementById('gpx-msg');
  if (dotEl) dotEl.classList.remove('loading');
  if (msgEl) msgEl.textContent = '✓ Parcours prêt';
  initMap(coords);
  drawElevation(coords);
  updateProgress();
}

function haversine(a, b) {
  const R    = 6371;
  const p    = Math.PI / 180;
  const dLat = (b.lat - a.lat) * p;
  const dLng = (b.lng - a.lng) * p;
  const s    = Math.sin(dLat/2) ** 2
             + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function initMap(coords) {
  if (typeof L === 'undefined') { console.warn('Leaflet non chargé'); return; }
  if (!gpxMap) {
    gpxMap = L.map('gpx-map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18,
    }).addTo(gpxMap);
  } else {
    gpxMap.eachLayer(l => {
      if (l instanceof L.Polyline || l instanceof L.CircleMarker) gpxMap.removeLayer(l);
    });
  }
  const latlngs = coords.map(c => [c.lat, c.lng]);
  const poly    = L.polyline(latlngs, { color: '#C8F135', weight: 3, opacity: 0.9 }).addTo(gpxMap);
  gpxMap.fitBounds(poly.getBounds(), { padding: [24, 24] });
  L.circleMarker(latlngs[0], { radius: 7, fillColor: '#22C55E', color: '#fff', fillOpacity: 1, weight: 2 })
    .bindTooltip('Départ').addTo(gpxMap);
  L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, fillColor: '#EF4444', color: '#fff', fillOpacity: 1, weight: 2 })
    .bindTooltip('Arrivée').addTo(gpxMap);
  setTimeout(() => gpxMap.invalidateSize(), 150);
}

function drawElevation(coords) {
  const elevDiv = document.getElementById('gpx-elev');
  const canvas  = document.getElementById('elev-canvas');
  if (!elevDiv || !canvas) return;
  elevDiv.classList.add('visible');
  canvas.width  = (canvas.offsetWidth || 600) * window.devicePixelRatio;
  canvas.height = 80 * window.devicePixelRatio;
  const ctx   = canvas.getContext('2d');
  const W     = canvas.width;
  const H     = canvas.height;
  const eles  = coords.map(c => c.ele);
  const minE  = Math.min(...eles);
  const maxE  = Math.max(...eles);
  const range = maxE - minE || 1;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  coords.forEach((c, i) => {
    const x = (i / (coords.length - 1)) * W;
    const y = H - ((c.ele - minE) / range) * (H - 10);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(200,241,53,0.2)';
  ctx.fill();
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

/* ═══════════════════════════════════════════════════════════════
   FLYER GENERATOR
   ═══════════════════════════════════════════════════════════════ */
let _flyerBgImage = null;

function onFlyerBgSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      _flyerBgImage            = img;
      window.currentCoverImage = e.target.result;
      const nameEl = document.getElementById('flyer-bg-name');
      if (nameEl) nameEl.textContent = file.name;
      document.getElementById('flyer-photo-pick').style.display = 'none';
      document.getElementById('flyer-ready').style.display      = 'block';
      showToast('Photo chargée — clique sur Générer le flyer');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function generateFlyer() {
  if (!_flyerBgImage) { showToast("Choisis d'abord la photo de fond", 'error'); return; }
  const canvas = document.getElementById('flyer-canvas');
  const ctx    = canvas.getContext('2d');
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const titre  = document.getElementById('titre')?.value || 'Sortie GoëloRides';
  const date   = document.getElementById('date')?.value;
  const dist   = document.getElementById('gpx-dist')?.textContent   || '—';
  const dplus  = document.getElementById('gpx-dplus')?.textContent  || '—';
  const groupe = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const lieu   = document.getElementById('lieu')?.value             || 'Saint-Quay-Portrieux';
  const hrdv   = document.getElementById('heure-rdv')?.value        || '08:00';
  const niveauEl    = document.getElementById('niveau');
  const niveauLabel = niveauEl?.options[niveauEl.selectedIndex]?.text || 'Tous niveaux';
  const ir = _flyerBgImage.width / _flyerBgImage.height;
  const cr = W / H;
  let sx = 0, sy = 0, sw = _flyerBgImage.width, sh = _flyerBgImage.height;
  if (ir > cr) { sw = sh * cr; sx = (_flyerBgImage.width - sw) / 2; }
  else          { sh = sw / cr; sy = (_flyerBgImage.height - sh) / 2; }
  ctx.drawImage(_flyerBgImage, sx, sy, sw, sh, 0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.3, 'rgba(0,0,0,0.15)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0.80)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, 130);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#C8F135'; ctx.font = '700 40px Arial'; ctx.fillText('≋', 48, 88);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '700 42px Arial, sans-serif'; ctx.fillText('GOËLORIDES', 110, 88);
  const bx = W - 110, by = 100, br = 90;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = '700 18px Arial'; ctx.fillText('COMMUNITY', bx, by - 18);
  ctx.font = '700 18px Arial'; ctx.fillText('RIDE', bx, by + 26);
  ctx.textAlign = 'left';
  const titreUpper = titre.toUpperCase();
  let titreSize = 160;
  ctx.font = `900 ${titreSize}px "Arial Black", Impact, sans-serif`;
  while (ctx.measureText(titreUpper.split(' ')[0]).width > W - 80 && titreSize > 80) {
    titreSize -= 5;
    ctx.font = `900 ${titreSize}px "Arial Black", Impact, sans-serif`;
  }
  ctx.fillStyle = '#FFF'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
  let ty = 310;
  titreUpper.split(' ').forEach(mot => { ctx.fillText(mot, 40, ty); ty += titreSize * 0.95; });
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '400 30px Arial';
  ctx.fillText('DISCOVER. CONNECT.', 48, ty + 10);
  const infoY0 = ty + 70;
  const infos  = [];
  if (date) {
    const d = new Date(date + 'T00:00:00');
    infos.push({ main: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).toUpperCase(), sub: hrdv.replace(':', 'H') });
  }
  infos.push({ main: lieu.toUpperCase(), sub: null });
  infos.push({ main: niveauLabel.toUpperCase(), sub: 'ALL LEVELS WELCOME' });
  infos.forEach((info, i) => {
    const y = infoY0 + i * 110;
    ctx.fillStyle = '#C8F135'; ctx.fillRect(0, y-36, 8, info.sub ? 75 : 55);
    ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(8, y-38, 560, info.sub ? 78 : 58);
    ctx.fillStyle = '#FFF'; ctx.font = '700 46px "Arial Black", sans-serif'; ctx.fillText(info.main, 30, y);
    if (info.sub) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '400 24px Arial'; ctx.fillText(info.sub, 30, y+30); }
  });
  const statsY = H - 220;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, statsY-10, W, 120);
  [
    { icon:'≋', label:'TOTAL',             val: dist  !== '—' ? dist  + ' km' : '—' },
    { icon:'◎', label:'COMMUNITY PACE',    val: groupe.toUpperCase() },
    { icon:'△', label:'NO RACE JUST RIDE', val: dplus !== '—' ? dplus + ' m'  : ''  },
  ].forEach((s, i) => {
    const x = 80 + i * 340;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '400 22px Arial'; ctx.fillText(s.icon, x, statsY+28);
    ctx.fillStyle = '#FFF'; ctx.font = '700 26px Arial'; ctx.fillText(s.label, x, statsY+58);
    if (s.val) { ctx.fillStyle = '#C8F135'; ctx.font = '700 30px Arial'; ctx.fillText(s.val, x, statsY+92); }
  });
  ctx.fillStyle = '#C8F135'; ctx.fillRect(0, H-110, W, 110);
  ctx.fillStyle = '#000'; ctx.font = '700 44px "Arial Black", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('goelorides.onrender.com', W/2, H-62);
  ctx.font = '400 26px Arial'; ctx.fillText('@goelo.rides', W/2, H-26);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '400 22px Arial'; ctx.textAlign = 'right';
  ctx.fillText('#GoëloRides', W-30, H-120);
  ctx.textAlign = 'left';
  document.getElementById('flyer-wrap').style.display = 'grid';
  showToast('Flyer généré !');
}

function downloadFlyer() {
  const canvas = document.getElementById('flyer-canvas');
  const titre  = document.getElementById('titre')?.value || 'sortie';
  const link   = document.createElement('a');
  link.download = 'flyer-' + titre.replace(/\s+/g, '-').toLowerCase() + '.png';
  link.href     = canvas.toDataURL('image/png');
  link.click();
  showToast('Flyer téléchargé');
}

function copyFlyer() {
  const canvas = document.getElementById('flyer-canvas');
  canvas.toBlob(blob => {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => showToast('Image copiée dans le presse-papiers'))
      .catch(()  => showToast('Copie non supportée — télécharge le PNG', 'error'));
  });
}

/* ═══════════════════════════════════════════════════════════════
   TEXTES RÉSEAUX SOCIAUX
   ═══════════════════════════════════════════════════════════════ */
function generateSocial() {
  const titre  = document.getElementById('titre')?.value || 'Sortie GoëloRides';
  const date   = document.getElementById('date')?.value;
  const dist   = document.getElementById('gpx-dist')?.textContent  || '—';
  const dplus  = document.getElementById('gpx-dplus')?.textContent || '—';
  const groupe = document.querySelector('input[name="groupe"]:checked')?.value || 'vert';
  const hrdv   = document.getElementById('heure-rdv')?.value || '08h30';
  const lieu   = document.getElementById('lieu')?.value      || 'Saint-Quay-Portrieux';
  const dateStr   = date
    ? new Date(date).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
    : 'prochainement';
  const dateUpper = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const fb = `🚴 ${titre}\n\nOn repart sur les routes du Goëlo !\n\n📅 ${dateUpper}\n⏰ RDV ${hrdv} — ${lieu}\n📍 Groupe ${groupe.charAt(0).toUpperCase()+groupe.slice(1)}${dist!=='—'?' · '+dist+' km':''}${dplus!=='—'?' · '+dplus+' m D+':''}\n\nInscription : goelorides.onrender.com\n\n#GoëloRides #Cyclisme #SaintQuayPortrieux #Bretagne`;
  const ig = `🚴‍♂️ ${titre}\n\n${dateUpper} · Groupe ${groupe.toUpperCase()}${dist!=='—'?' · '+dist+' km':''}\n\nInfos & inscription en bio 🔗\n\n#GoëloRides #Vélo #Bretagne #CyclismeBretagne #SaintQuay`;
  const fbEl = document.getElementById('fb-text');
  const igEl = document.getElementById('ig-text');
  if (fbEl) fbEl.textContent = fb;
  if (igEl) igEl.textContent = ig;
  showToast('Textes générés');
}

function copyText(id) {
  const el  = document.getElementById(id);
  const txt = el?.textContent || '';
  if (!txt || txt.startsWith('—')) { showToast("Génère le texte d'abord", 'error'); return; }
  navigator.clipboard.writeText(txt).then(() => showToast('Texte copié'));
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('confirm-cancel')?.classList.remove('open');
  }
});

/* ═══════════════════════════════════════════════════════════════
   INIT — point d'entrée unique
   ═══════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  window.routeId = urlParams.get('id')   || null;
  window.mode    = urlParams.get('mode') || (window.routeId ? 'edit' : 'create');

  console.log('🎯 MODE    :', window.mode);
  console.log('🎯 ROUTE ID:', window.routeId);

  const navTitle = document.querySelector('.nav__title');
  if (navTitle) {
    navTitle.textContent = window.mode === 'edit' ? 'Modifier une sortie' : 'Nouvelle sortie';
  }

  try {
    const sb = await getSb();
    console.log('✅ Supabase ready in DOM');

    if (window.mode === 'edit' && window.routeId) {
      showToast('Chargement de la sortie…');
      await loadRoute(window.routeId);
    }

    const { data: { user } } = await sb.auth.getUser();
    if (user?.email) {
      const pseudo     = user.email.split('@')[0];
      const usernameEl = document.getElementById('nav-username');
      if (usernameEl) usernameEl.textContent = pseudo;
      const capEl = document.getElementById('capitaine');
      if (capEl && !capEl.value) capEl.value = pseudo;
    }

    updateProgress();
    console.log('✅ INIT COMPLETE');
  } catch (e) {
    console.error('INIT ERROR', e);
  }
});
