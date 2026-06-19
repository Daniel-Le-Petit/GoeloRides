/* ═══════════════════════════════════════════════════════════════
   GoëloRides — team-rider.js
   Corrections :
   - Supabase client créé en lazy (getSb) — plus d'erreur createClient au load
   - .from('sorties') → .from('routes') + lecture front_config
   - fetch() REST manuel supprimé
   - renderSorties lit track_name, front_config (km, D+, statut, date)
   - renderDemands reste sur table 'demandes'
   ═══════════════════════════════════════════════════════════════ */

/* ── CONSTANTS ─────────────────────────────── */
const MONTH_SHORT = ['','JAN','FÉV','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
const AV_COLORS   = ['#C8F135','#7DD3FC','#FCA5A5','#FCD34D','#C4B5FD','#86EFAC'];
const GRUP_COLOR  = { blanc:'#9ca3af', vert:'#C8F135', bleu:'#60a5fa', rouge:'#f87171' };
const GRUP_LABEL  = { blanc:'Blanc', vert:'Vert', bleu:'Bleu', rouge:'Rouge' };

const URGENCE_MSGS = {
  retard:    '⏱ GOËLORIDES — Retard\n\nDépart retardé de 15 min.\nMerci de patienter au Parking du Kasino.\n\n💬 Message du Team Rider',
  annulation:'❌ GOËLORIDES — Annulation\n\nSortie annulée — conditions météo.\n\nProchaine sortie bientôt :\ngoelorides.onrender.com',
  meteo:     '🌧 GOËLORIDES — Météo\n\nSortie maintenue ✅\nAverses possibles — coupe-vent recommandé.\n\n⏰ Horaire inchangé',
  rdv:       '📍 GOËLORIDES — Changement RDV\n\n⚠️ Nouveau point de départ :\nParking de la plage du Châtelet\n(et non le Kasino)\n\n⏰ Horaire inchangé'
};

/* ── SUPABASE — lazy singleton ──────────────────────────────────
   CORRECTION : ne pas appeler createClient au niveau module.
   Le CDN est chargé avec defer → window.supabase.createClient
   n'est pas encore disponible quand le script s'exécute.
   getSb() est appelé uniquement à l'intérieur de fonctions async,
   après DOMContentLoaded, quand le CDN est forcément chargé.
   ─────────────────────────────────────────────────────────────── */
let _sb = null;
function getSb() {
  if (_sb) return _sb;
  const url = (window.GOELO_SUPABASE_URL  || '').trim();
  const key = (window.GOELO_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) throw new Error('GOELO_SUPABASE_URL / ANON_KEY manquants');
  if (typeof window.supabase?.createClient !== 'function') {
    throw new Error('Supabase CDN non chargé — vérifier le <script> CDN dans le HTML');
  }
  _sb = window.supabase.createClient(url, key);
  return _sb;
}

/* ── FILTER STATE ──────────────────────────── */
let _currentFilter = 'all';

/* ── TOAST ─────────────────────────────────── */
function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── HELPERS ────────────────────────────────── */
function initials(str) {
  return String(str || '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}
function scrollToId(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }

/* ── front_config parser ────────────────────── */
function parseFc(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/*
 * Convertit une ligne `routes` en objet normalisé pour l'affichage.
 * CORRECTION : les champs titre, km, D+, statut vivent dans front_config,
 * pas au niveau de la ligne (contrairement à l'ancienne table 'sorties').
 */
function routeToCard(row) {
  const fc     = parseFc(row.front_config);
  const stats  = fc.stats || {};
  const statut = fc.sortieStatus === 'cancelled' ? 'annulee'
               : fc.visibility   === 'public'    ? 'publiee'
               : 'brouillon';
  return {
    id:        row.id,
    titre:     row.track_name || '—',
    groupe:    row.group_label || '—',
    pace:      row.pace_label  || '—',
    statut,
    km:        stats.totalKm   ?? fc.km    ?? null,
    dplus:     stats.elevGainM ?? fc.dplus ?? null,
    date:      fc.rideDateIso  || null,
    meetTime:  fc.meetTime     || fc.rideTime || null,
    meetPlace: fc.meetPlace    || 'Devant le Kasino',
    captain:   fc.captain      || fc.rideLeader || '—',
    isActive:  row.is_active !== false,
  };
}

/* ── AUTH ───────────────────────────────────── */
function decodeJwt(t) {
  try {
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)));
  } catch (e) { return null; }
}

function detectRole() {
  const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
  if (!key) return null;
  try {
    const s = JSON.parse(localStorage.getItem(key));
    const tok = s?.access_token || s?.currentSession?.access_token;
    if (!tok) return null;
    const p = decodeJwt(tok);
    if (!p) return null;
    const am = p.app_metadata || {};
    const um = p.user_metadata || {};
    const isAdmin = am.goelo_admin === true || am.goelo_admin === 'true'
                 || am.goelo_admin === 1    || am.goelo_admin === '1';
    return {
      role:   isAdmin ? 'admin' : 'teamrider',
      pseudo: um.pseudo || p.email?.split('@')[0] || 'Team Rider',
      email:  p.email || ''
    };
  } catch { return null; }
}

/* ── BOOT ───────────────────────────────────── */
async function boot(rider) {
  document.getElementById('gate-panel').style.display = 'none';
  document.getElementById('dashboard').style.display  = 'block';

  document.getElementById('user-name').textContent   = `${rider.pseudo} (${rider.role})`;
  document.getElementById('user-avatar').textContent = initials(rider.pseudo);

  const badge = document.getElementById('role-badge');
  if (rider.role === 'admin') {
    badge.textContent = '👑 ADMIN';
    badge.classList.add('is-admin');
  } else {
    badge.textContent = '🚴 TEAM RIDER';
  }

  await renderSorties(rider.role, rider.email);
  if (rider.role === 'admin') renderDemands();
}

/* ── RENDER SORTIES ─────────────────────────────────────────────
   CORRECTION :
   - .from('routes') au lieu de .from('sorties')
   - lecture de front_config via routeToCard()
   - filtre 'mine' basé sur fc.captain === rider.email
   - filtre 'publiee' / 'brouillon' basé sur fc.visibility
   ─────────────────────────────────────────────────────────────── */
async function renderSorties(role, email = '') {
  const list = document.getElementById('sorties-list');
  if (!list) return;
  list.innerHTML = '<p style="opacity:.5">Chargement…</p>';

  let query = getSb()
    .from('routes')
    .select('id, track_name, group_label, pace_label, sort_order, is_active, front_config, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at',  { ascending: false });

  // Les admins voient tout ; les team riders voient seulement les actives
  if (role !== 'admin') {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('renderSorties error:', error);
    list.innerHTML = `<p style="color:var(--red)">Erreur : ${error.message}</p>`;
    return;
  }

  let cards = (data || []).map(routeToCard);

  // Filtres UI
  if (_currentFilter === 'publiee') {
    cards = cards.filter(c => c.statut === 'publiee');
  } else if (_currentFilter === 'brouillon') {
    cards = cards.filter(c => c.statut === 'brouillon');
  } else if (_currentFilter === 'mine') {
    cards = cards.filter(c =>
      email && (c.captain === email || c.captain === email.split('@')[0])
    );
  }

  if (cards.length === 0) {
    list.innerHTML = '<p style="opacity:.5">Aucune sortie pour ce filtre.</p>';
    return;
  }

  list.innerHTML = cards.map(c => {
    const badgeClass = c.statut === 'publiee'   ? 'badge-pub'
                     : c.statut === 'annulee'   ? 'badge-cancel'
                     : 'badge-draft';
    const badgeLabel = c.statut === 'publiee'   ? 'PUB'
                     : c.statut === 'annulee'   ? 'ANNULÉ'
                     : 'DRAFT';
    const kmStr    = c.km    != null ? `${c.km} km`    : '— km';
    const dplusStr = c.dplus != null ? `${c.dplus} m D+` : '— m D+';
    const dateStr  = c.date
      ? new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
      : '—';

    return `
      <div class="sortie-card" id="sc-${c.id}">
        <div class="s-head">
          <span class="s-title">${c.titre}</span>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="s-sub">${kmStr} · ${dplusStr} · ${c.groupe}</div>
        <div class="s-meta">📅 ${dateStr} · 📍 ${c.meetPlace} · 🕒 ${c.meetTime || '—'}</div>
        <div class="s-actions">
          <button class="btn-sm" onclick="location.href='parcours.html?id=${c.id}'">👁 Voir</button>
          <button class="btn-sm" onclick="location.href='gestion-sorties.html?mode=edit&id=${c.id}'">✏️ Modifier</button>
          <button class="btn-sm btn-cancel" onclick="cancelSortie('${c.id}','${c.titre.replace(/'/g,"\\'")}',this)">✕ Annuler</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ── FILTER ─────────────────────────────────── */
function filterSorties(filter, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _currentFilter = filter;
  const isAdmin = document.getElementById('role-badge')?.classList.contains('is-admin');
  const role    = isAdmin ? 'admin' : 'teamrider';
  // Récupérer l'email depuis le pseudo affiché n'est pas fiable ;
  // on repasse par detectRole() pour avoir l'email réel.
  const rider = detectRole();
  renderSorties(role, rider?.email || '');
}

/* ── CANCEL SORTIE ──────────────────────────── */
async function cancelSortie(id, titre, btn) {
  if (!confirm(`Annuler "${titre}" ?\n\nPense à envoyer un message urgence aux participants.`)) return;
  try {
    const sb = getSb();
    // Récupérer le front_config actuel
    const { data: row, error: fetchErr } = await sb
      .from('routes')
      .select('front_config')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    const fc = parseFc(row.front_config);
    fc.sortieStatus = 'cancelled';
    const { error: updateErr } = await sb
      .from('routes')
      .update({ front_config: fc })
      .eq('id', id);
    if (updateErr) throw updateErr;
    // Mise à jour visuelle immédiate
    const card = btn.closest('.sortie-card');
    const badge = card?.querySelector('.badge');
    if (badge) { badge.className = 'badge badge-cancel'; badge.textContent = 'ANNULÉ'; }
    toast(`Sortie "${titre}" annulée — envoie un message Messenger ↓`);
    setTimeout(() => scrollToId('urgence-section'), 800);
  } catch (e) {
    console.error('cancelSortie error:', e);
    toast('Erreur lors de l\'annulation : ' + e.message);
  }
}

/* ── RENDER DEMANDS ─────────────────────────── */
async function renderDemands() {
  const section = document.getElementById('demands-section');
  const list = document.getElementById('demand-list');
  const label = document.getElementById('demands-count-label');

  section.style.display = 'block';

  const { data: demands, error } = await getSb()
    .from('demandes')
    .select('*')
    .eq('status', 'pending')
    .order('create_at', { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = '<p style="color:var(--red)">Erreur demandes</p>';
    return;
  }

  const pending = demands.length;

  label.textContent =
    pending > 0
      ? `· ${pending} en attente`
      : '· Aucune en attente';

  list.innerHTML = demands.map((d, i) => `
    <div class="demand-card">
      <div class="d-head">
        <span class="d-name">${d.name}</span>
        <span class="badge-att">EN ATTENTE</span>
      </div>

      <div class="d-meta">${d.email}</div>

      <div class="d-actions">
        <button class="da-approve"
          onclick="approveDemand(${i}, '${d.id}')">
          ✓ APPROUVER
        </button>

        <button class="da-refuse"
          onclick="refuseDemand(${i}, '${d.id}')">
          ✕ REFUSER
        </button>
      </div>
    </div>
  `).join('');
}

function updateDemandCount() {
  renderDemands();
}

async function approveDemand(i, id) {
  const { error } = await getSb()
    .from('demandes')
    .update({ status: 'approved' })
    .eq('id', id);
  if (error) {
    toast('Erreur : ' + error.message);
    return;
  }
  toast('Demande approuvée ✓');
  await renderDemands();
}

async function refuseDemand(i, id) {
  const { error } = await getSb()
    .from('demandes')
    .update({ status: 'refused' })
    .eq('id', id);
  if (error) {
    toast('Erreur : ' + error.message);
    return;
  }
  toast('Demande refusée ✕');
  await renderDemands();
}

/* ── URGENCE ────────────────────────────────── */
function genUrgence(btn, type) {
  const result = btn.querySelector('.u-result');
  if (result.style.display === 'block') { result.style.display = 'none'; return; }
  const msg = URGENCE_MSGS[type] || '';
  result.textContent = msg;
  result.style.display = 'block';
  navigator.clipboard?.writeText(msg).then(() => toast('Message copié — colle dans Messenger'));
  if (!btn.querySelector('.u-copy')) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'u-copy';
    copyBtn.textContent = '📋 Copier à nouveau';
    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard?.writeText(msg).then(() => toast('Copié !'));
    });
    result.after(copyBtn);
  }
}

/* ── INIT ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  let rider = detectRole();

  // Mode démo : ?demo=teamrider ou ?demo=admin
  if (!rider) {
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo === 'admin')     rider = { role: 'admin',     pseudo: 'Admin Demo',      email: '' };
    if (demo === 'teamrider') rider = { role: 'teamrider', pseudo: 'Team Rider Demo', email: '' };
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
