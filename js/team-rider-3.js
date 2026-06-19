
/* ── CONSTANTS ─────────────────────────────── */
const MONTH_SHORT = ['','JAN','FÉV','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
const AV_COLORS = ['#C8F135','#7DD3FC','#FCA5A5','#FCD34D','#C4B5FD','#86EFAC'];
const GRUP_COLOR = {blanc:'#9ca3af',vert:'#C8F135',bleu:'#60a5fa',rouge:'#f87171'};
const GRUP_LABEL = {blanc:'Blanc',vert:'Vert',bleu:'Bleu',rouge:'Rouge'};
const MOCK_SORTIES = [];
const MOCK_DEMANDS = [];

const supabase = window.supabase.createClient(
  window.GOELO_SUPABASE_URL,
  window.GOELO_SUPABASE_ANON_KEY
);

const URGENCE_MSGS = {
  retard:    '⏱ GOËLORIDES — Retard\n\nDépart retardé de 15 min.\nMerci de patienter au Parking du Kasino.\n\n💬 Message du Team Rider',
  annulation:'❌ GOËLORIDES — Annulation\n\nSortie annulée — conditions météo.\n\nProchaine sortie bientôt :\ngoelorides.onrender.com',
  meteo:     '🌧 GOËLORIDES — Météo\n\nSortie maintenue ✅\nAverses possibles — coupe-vent recommandé.\n\n⏰ Horaire inchangé',
  rdv:       '📍 GOËLORIDES — Changement RDV\n\n⚠️ Nouveau point de départ :\nParking de la plage du Châtelet\n(et non le Kasino)\n\n⏰ Horaire inchangé'
};

/* ── TOAST ─────────────────────────────────── */
function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── HELPERS ────────────────────────────────── */
function initials(str) { return str.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase(); }
function scrollToId(id) { document.getElementById(id)?.scrollIntoView({behavior:'smooth'}); }

/* ── AUTH ───────────────────────────────────── */
function decodeJwt(t) {
  try {
    const b64 = t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b64 + '='.repeat((4-b64.length%4)%4)));
  } catch(e) { return null; }
}

function detectRole() {
  const key = Object.keys(localStorage)
    .find(k => k.includes('auth-token'));

  if (!key) return null;

  const s = JSON.parse(localStorage.getItem(key));
  const p = decodeJwt(s.access_token);

  if (!p) return null;

  const um = p.user_metadata || {};

  return {
    role: 'teamrider',   // 💥 FORCE TEMPORAIRE
    pseudo: um.pseudo || 'Team Rider'
  };
}

/* ── RENDER ─────────────────────────────────── */
async function fetchSorties() {
  const res = await fetch(`${window.GOELO_SUPABASE_URL}/rest/v1/sorties?select=*`, {
    headers: {
      apikey: window.GOELO_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${window.GOELO_SUPABASE_ANON_KEY}`
    }
  });

  return await res.json();
}

async function boot(rider) {
  document.getElementById('gate-panel').style.display = 'none';
  document.getElementById('dashboard').style.display  = 'block';

  document.getElementById('user-name').textContent =
    `${rider.pseudo} (${rider.role})`;

  document.getElementById('user-avatar').textContent = initials(rider.pseudo);

  const badge = document.getElementById('role-badge');
  if (rider.role === 'admin') {
    badge.textContent = '👑 ADMIN';
    badge.classList.add('is-admin');
  }

  await renderSorties(rider.role);

  if (rider.role === 'admin') renderDemands();
}

async function renderSorties(role) {
  const list = document.getElementById('sorties-list');

  const { data, error } = await supabase
    .from('routes')
    .select('*');

  if (error) {
    console.error(error);
    list.innerHTML = `<pre>${JSON.stringify(error, null, 2)}</pre>`;
    return;
  }

  const safe = data || [];

  const items = _currentFilter === 'all'
    ? safe
    : safe.filter(s => s.statut === _currentFilter);

  if (items.length === 0) {
    list.innerHTML = '<p>Aucune sortie</p>';
    return;
  }

  list.innerHTML = items.map(s => `
    <div class="sortie-card">
      <div class="s-title">${s.titre ?? 'Sans titre'}</div>
      <div class="s-sub">${s.km ?? 0} km · ${s.dplus ?? 0} m D+</div>

      <div class="s-actions">
        <button onclick="location.href='parcours.html?id=${s.id}'">
          Voir
        </button>
      </div>
    </div>
  `).join('');
}

function filterSorties(filter, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _currentFilter = filter;
  const role = document.getElementById('role-badge').classList.contains('is-admin') ? 'admin' : 'teamrider';
  renderSorties(role);
}

function cancelSortie(id, titre, btn) {
  if (!confirm(`Annuler "${titre}" ?\n\nPense à envoyer un message urgence Messenger aux participants.`)) return;
  const card = btn.closest('.sortie-card');
  card.querySelector('.badge').className = 'badge badge-cancel';
  card.querySelector('.badge').textContent = 'ANNULÉ';
  toast(`Sortie "${titre}" annulée — envoie un message Messenger ↓`);
  setTimeout(() => scrollToId('urgence-section'), 800);
}

async function renderDemands() {
  const section = document.getElementById('demands-section');
  const list = document.getElementById('demand-list');
  const label = document.getElementById('demands-count-label');

  section.style.display = 'block';

  const { data: demands, error } = await supabase
    .from('demandes')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = '<p style="color:var(--red)">Erreur demandes</p>';
    return;
  }

  let pending = demands.length;
  label.textContent = `· ${pending} en attente`;

  list.innerHTML = demands.map((d, i) => `
    <div class="demand-card" id="dc-${i}">
      <div class="d-head">
        <span class="d-name">${d.name}</span>
        <span class="badge-att">EN ATTENTE</span>
      </div>

      <div class="d-meta">${d.email} · ${d.date}</div>

      <div class="d-actions">
        <button class="da-approve" onclick="approveDemand(${i}, '${d.id}')">✓ APPROUVER</button>
        <button class="da-refuse" onclick="refuseDemand(${i}, '${d.id}')">✕ REFUSER</button>
      </div>
    </div>
  `).join('');

  window._demandPending = pending;
}

async function approveDemand(i, id) {
  await supabase.from('demandes')
    .update({ status: 'approved' })
    .eq('id', id);

  toast('Demande approuvée');
  renderDemands();
}

async function refuseDemand(i, id) {
  await supabase.from('demandes')
    .update({ status: 'refused' })
    .eq('id', id);

  toast('Demande refusée');
  renderDemands();
}

function updateDemandCount(delta) {
  window._demandPending = Math.max(0, (window._demandPending||0) + delta);
  const lbl = document.getElementById('demands-count-label');
  if (lbl) lbl.textContent = window._demandPending > 0 ? `· ${window._demandPending} en attente` : '· Aucune en attente';
}

/* ── URGENCE ────────────────────────────────── */
function genUrgence(btn, type) {
  const result = btn.querySelector('.u-result');
  if (result.style.display === 'block') { result.style.display='none'; return; }
  const msg = URGENCE_MSGS[type] || '';
  result.textContent = msg;
  result.style.display = 'block';
  navigator.clipboard?.writeText(msg).then(() => toast('Message copié — colle dans Messenger'));
  if (!btn.querySelector('.u-copy')) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'u-copy';
    copyBtn.textContent = '📋 Copier à nouveau';
    copyBtn.addEventListener('click', e => { e.stopPropagation(); navigator.clipboard?.writeText(msg).then(()=>toast('Copié !')); });
    result.after(copyBtn);
  }
}

/* ── INIT ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  let rider = detectRole();

  // Mode démo : ?demo=teamrider ou ?demo=admin
  if (!rider) {
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo === 'admin')     rider = { role:'admin',     pseudo:'Admin' };
    if (demo === 'teamrider') rider = { role:'teamrider', pseudo:'Team Rider' };
  }

  if (rider) {
    boot(rider);
  } else {
    document.getElementById('gate-panel').style.display = 'block';
    document.getElementById('dashboard').style.display  = 'none';
  }

  window.addEventListener('goelo:auth-success', () => {
    const r = detectRole();
    if (r) boot(r);
  });
});
