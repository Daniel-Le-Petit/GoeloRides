const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname,'../../../js/goelo-pseudo-participation.js'),'utf8');
function app(options={}) {
  class Element { constructor() { this.handlers={}; this.hidden=false; this.value=''; } addEventListener(name,fn) { this.handlers[name]=fn; } setAttribute() {} focus() { this.focused=true; } }
  const fields={};const field=selector=>fields[selector]||(fields[selector]=new Element());
  const dialog=new Element();dialog.querySelector=field;dialog.querySelectorAll=()=>['[data-pseudo-submit]','[data-pseudo-cancel]','[data-pseudo-close]'].map(field);dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;dialog.handlers.close?.()};field('form').reset=()=>field('input').value='';field('form').reportValidity=()=>field('input').value.trim().length>=2;
  const store=new Map(),calls=[],events=[],tracking=[];let active=false,fail=options.fail;
  const window={crypto:globalThis.crypto,confirm:()=>options.confirm!==false,dispatchEvent:e=>events.push(e),GoeloActivity:{beginParticipationAttempt:()=>{tracking.push('request');return {finish(result){tracking.push(result);if(options.badTracking)throw Error('tracking')}}}},goeloGetSb:()=>({rpc:async(name,payload)=>{calls.push({name,payload});if(fail)return {error:{code:fail,message:'backend absent'}};if(options.block&&payload.p_action==='join')await new Promise(resolve=>window.release=resolve);if(payload.p_action==='join')active=true;if(payload.p_action==='cancel')active=false;return {data:{ok:true,joined:active,pseudo:active?'Camille':null,action:active?'added':'removed'}};}})};
  const context={window,document:{readyState:'complete',activeElement:null,createElement:()=>dialog,body:{appendChild(){}},addEventListener(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(options.storageBlocked)throw Error('storage');store.set(k,v)}},CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail}},Uint8Array};vm.createContext(context);vm.runInContext(source,context);
  return {window,dialog,field,store,calls,events,tracking,api:window.GoeloPseudoParticipation,setFail:value=>fail=value,submit:()=>field('form').handlers.submit({preventDefault(){}})};
}
test('fenêtre pseudo seule, données de sortie affichées en texte et aucun appel Auth',async()=>{
  const a=app();await a.api.open({id:'r1',title:'<img src=x>',summary:'13 avril · 08h30'});assert.equal(a.dialog.open,true);assert.match(a.field('[data-pseudo-route]').textContent,/<img src=x>/);assert.equal(a.calls[0].name,'guest_pseudo_participation');assert.equal(a.calls[0].payload.p_action,'status');assert(!/name="email"|name="password"/.test(a.dialog.innerHTML));
});
test('confirmation serveur simulée, état local et notification de mise à jour malgré un échec du suivi',async()=>{
  const a=app({badTracking:true});await a.api.open({id:'r1',title:'Boucle'});a.field('input').value='Camille';await a.submit();assert.match(a.field('[data-pseudo-message]').textContent,/Tu es inscrit·e, Camille/);assert.equal(a.api.hasLocal('r1'),true);assert.equal(a.events.length,1);assert.equal(a.events[0].type,'goelo:signup-changed');assert.equal(a.calls[1].payload.p_pseudo,'Camille');assert.match(a.calls[1].payload.p_token,/^[a-f0-9]{64}$/);
});
test('double appui : un seul envoi ; annulation par le même jeton',async()=>{
  const a=app({block:true});await a.api.open({id:'r1'});a.field('input').value='Camille';const first=a.submit();await a.submit();assert.equal(a.calls.filter(c=>c.payload.p_action==='join').length,1);a.window.release();await first;await a.field('[data-pseudo-cancel]').handlers.click();assert.equal(a.api.hasLocal('r1'),false);assert.equal(a.calls[2].payload.p_token,a.calls[1].payload.p_token);assert.match(a.field('[data-pseudo-message]').textContent,/annulée/);
});
test('backend non déployé : message explicite, aucun succès ni compteur modifié',async()=>{
  const a=app({fail:'PGRST202'});await a.api.open({id:'r1'});assert.match(a.field('[data-pseudo-message]').textContent,/pas encore activée/);a.field('input').value='Camille';await a.submit();assert.equal(a.api.hasLocal('r1'),false);assert.equal(a.events.length,0);assert.match(a.field('[data-pseudo-message]').textContent,/pas encore activée/);
});
test('stockage bloqué : participation possible, limite d’annulation annoncée',async()=>{
  const a=app({storageBlocked:true});await a.api.open({id:'r1'});a.field('input').value='Camille';await a.submit();assert.equal(a.api.hasLocal('r1'),true);assert.match(a.field('[data-pseudo-storage]').textContent,/ne peut pas mémoriser/);
});

test('le clic ouvre une tentative et la fermeture sans confirmation ne devient pas une inscription',async()=>{const a=app();await a.api.open({id:'r1'});assert.equal(a.tracking[0],'request');a.dialog.close();assert.equal(a.tracking[1],'unknown');assert.equal(a.events.length,0);});
