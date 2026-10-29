const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i=0;i<5;i++) await tick(); }
function setup() {
  const listeners = {}, docListeners = {}, storage = new Map(), calls = [];
  const track = { innerHTML:'', dataset:{}, addEventListener(){}, querySelector(){return null} };
  let joined = false, block = false, release;
  const sb = { rpc: async (name,args) => {
    calls.push(name);
    if(name==='routes_upcoming_homepage')return {data:[{id:'r1',track_name:'Boucle',rideDateIso:'2099-04-13',rideTime:'09:00',group_label:'Groupe Vert'}]};
    if(name==='signup_list_registered_routes')return {data:[]};
    if(name==='signup_list_for_route')return {data:{participants:[]}};
    if(name==='guest_participants_list_for_route')return {data:{participants:joined?[{id:'guest-1',first_name:'Camille',is_guest:true}]:[]}};
    if(name==='guest_pseudo_participation') { const state=joined;if(block){block=false;await new Promise(resolve=>release=resolve)}return {data:{ok:true,joined:state,pseudo:state?'Camille':null}}; }
    throw Error('RPC inattendue '+name);
  }};
  const document={readyState:'complete',visibilityState:'visible',activeElement:null,getElementById:id=>id==='gr-upcoming-rides'?track:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(docListeners[name]??=[]).push(fn)}};
  const context={document,console:{...console,log(){}},setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),crypto:globalThis.crypto,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},GOELO_ROLE:'visitor',GOELO_USER:null,goeloGetSb:()=>sb,addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn)},GoeloActivity:{EVENT_TYPES:{},logEvent(){},trackScrollDepth:()=>({refresh(){}})}};
  context.window=context;vm.createContext(context);
  for(const file of ['js/goelo-profile.js','js/signup-participants.js','js/goelo-pseudo-participation.js','js/sortie-cards.js','js/home.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return {context,track,calls,async ready(){await settle()},writeGuest(active){joined=active;storage.set('goelo-guest-pseudo:r1',JSON.stringify({token:'a'.repeat(64),joined:active,pseudo:'Camille'}))},setServer(active){joined=active},block(){block=true},release(){release()},async emit(name,event={}){for(const fn of listeners[name]||[])fn(event);await settle()},async visible(){for(const fn of docListeners.visibilitychange||[])fn();await settle()}};
}
test('retour Safari après inscription sur le détail : Ma participation, compteur et initiales sur l’accueil',async()=>{
 const app=setup();await app.ready();assert(app.track.innerHTML.includes('>Rejoindre</button>'));
 app.writeGuest(true);await app.emit('pageshow',{persisted:true});
 assert(app.track.innerHTML.includes('>Ma participation</button>'));
 assert(app.track.innerHTML.includes('1 participant'));assert(app.track.innerHTML.includes('class="go-sc-avatar"'));assert(app.track.innerHTML.includes('title="Camille">CA</span>'));
});
test('une session membre existante ne masque pas la participation par pseudo',async()=>{
 const app=setup();await app.ready();app.writeGuest(true);app.context.GOELO_ROLE='user';app.context.GOELO_USER={id:'member'};
 await app.emit('goelo:role-ready',{detail:{role:'user'}});
 assert(app.track.innerHTML.includes('>Ma participation</button>'));assert(!app.track.innerHTML.includes('>Rejoindre</a>'));assert(app.track.innerHTML.includes('1 participant'));
});
test('annulation sur une autre page : retour et changement d’onglet retirent compteur et initiales',async()=>{
 const app=setup();await app.ready();app.writeGuest(true);await app.visible();assert(app.track.innerHTML.includes('1 participant'));
 app.writeGuest(false);await app.emit('storage',{key:'goelo-guest-pseudo:r1'});
 assert(app.track.innerHTML.includes('>Rejoindre</button>'));assert(!app.track.innerHTML.includes('1 participant'));assert(!app.track.innerHTML.includes('title="Camille"'));
});
test('un retrait serveur est récupéré sans effacer ni créer une inscription',async()=>{
 const app=setup();await app.ready();app.writeGuest(true);app.setServer(false);await app.visible();
 assert(app.track.innerHTML.includes('>Rejoindre</button>'));assert.equal(app.context.GoeloPseudoParticipation.hasLocal('r1'),false);
});
test('une modification pendant un rafraîchissement déclenche une seconde lecture',async()=>{
 const app=setup();await app.ready();app.writeGuest(true);app.block();const first=app.visible();await tick();app.setServer(false);const second=app.emit('goelo:signup-changed',{});app.release();await first;await second;await settle();
 assert(app.track.innerHTML.includes('>Rejoindre</button>'));assert(!app.track.innerHTML.includes('1 participant'));
});
