window.GOELO_SUPABASE_URL      = 'https://iqxyiwnjwcepfgngkzsm.supabase.co';
window.GOELO_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';

/* ── CONSTANTS ─────────────────────────────── */
const MONTH_SHORT = ['','JAN','FÉV','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
const AV_COLORS = ['#C8F135','#7DD3FC','#FCA5A5','#FCD34D','#C4B5FD','#86EFAC'];

const GRUP_COLOR = {blanc:'#9ca3af',vert:'#C8F135',bleu:'#60a5fa',rouge:'#f87171'};
const GRUP_LABEL = {blanc:'Blanc',vert:'Vert',bleu:'Bleu',rouge:'Rouge'};

const URGENCE_MSGS = {
  retard:'⏱ GOËLORIDES — Retard\n\nDépart retardé de 15 min.\nMerci de patienter au Parking du Kasino.\n\n💬 Message du Team Rider',
  annulation:'❌ GOËLORIDES — Annulation\n\nSortie annulée — conditions météo.\n\nProchaine sortie bientôt :\ngoelorides.onrender.com',
  meteo:'🌧 GOËLORIDES — Météo\n\nSortie maintenue ✅\nAverses possibles — coupe-vent recommandé.\n\n⏰ Horaire inchangé',
  rdv:'📍 GOËLORIDES — Changement RDV\n\n⚠️ Nouveau point de départ : Parking du Châtelet\n\n⏰ Horaire inchangé'
};

/* MOCK DATA */
const MOCK_SORTIES = [/* inchangé */];
const MOCK_DEMANDS = [/* inchangé */];

/* ── TOAST ─────────────────────────────────── */
function toast(msg){
  const wrap=document.getElementById('toast-wrap');
  const el=document.createElement('div');
  el.className='toast';
  el.textContent=msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

/* ── HELPERS ────────────────────────────────── */
function initials(str){
  return str.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
}

function scrollToId(id){
  document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
}

/* ── AUTH ───────────────────────────────────── */
function decodeJwt(t){
  try{
    const b64=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b64));
  }catch(e){return null;}
}

function detectRole(){
  try{
    const raw=sessionStorage.getItem('goelo_admin_auth_v1');
    if(raw){
      const o=JSON.parse(raw);
      const p=o?.access_token?decodeJwt(o.access_token):null;
      if(p?.exp*1000>Date.now()){
        const am=p.app_metadata||{};
        const isAdmin=am.goelo_admin===true||am.goelo_admin==='true';
        if(isAdmin){
          const um=p.user_metadata||{};
          return {role:am.goelo_super_admin?'admin':'teamrider',pseudo:um.pseudo||p.email};
        }
      }
    }
  }catch(e){}
  return null;
}

/* ── BOOT ───────────────────────────────────── */
function boot(rider){
  document.getElementById('gate-panel').style.display='none';
  document.getElementById('dashboard').style.display='block';

  document.getElementById('user-name').textContent=rider.role;
  document.getElementById('user-avatar').textContent=initials(rider.pseudo);

  const badge=document.getElementById('role-badge');
  if(rider.role==='admin'){
    badge.textContent='👑 ADMIN';
    badge.classList.add('is-admin');
  }

  renderSorties(rider.role);
  if(rider.role==='admin') renderDemands();
}

/* ── SORTIES ────────────────────────────────── */
let _currentFilter='all';

function renderSorties(role){
  const list=document.getElementById('sorties-list');
  const items=MOCK_SORTIES;
  list.innerHTML=items.map(s=>`
    <div class="sortie-card">
      <div class="sortie-main">
        <div class="s-title">${s.titre}</div>
      </div>
    </div>
  `).join('');
}

function filterSorties(f,btn){
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  _currentFilter=f;
}

/* ── URGENCE ────────────────────────────────── */
function genUrgence(btn,type){
  const msg=URGENCE_MSGS[type];
  navigator.clipboard?.writeText(msg);
  toast('Message copié');
}

/* ── INIT ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{
  let rider=detectRole();

  const demo=new URLSearchParams(location.search).get('demo');
  if(!rider){
    if(demo==='admin') rider={role:'admin',pseudo:'Admin'};
    if(demo==='teamrider') rider={role:'teamrider',pseudo:'TR'};
  }

  if(rider) boot(rider);
  else{
    document.getElementById('gate-panel').style.display='block';
  }
});
