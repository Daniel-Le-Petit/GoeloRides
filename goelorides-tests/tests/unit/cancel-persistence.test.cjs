const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../../../js/gestion-sorties.js'),'utf8');
const code=source.slice(source.indexOf('async function confirmCancel()'),source.indexOf('/* ── GPX IMPORT'));
async function scenario(fail){
 const nodes={},toasts=[],updates=[];const el=id=>nodes[id]||(nodes[id]={value:'publiee',classList:{remove(){},add(){}},textContent:''});
 const sb = {
  from() { return {
   select() { return {eq() { return {single:async()=>({data:{front_config:{visibility:'public',rideTime:'09:00',sortieStatus:'publiee'}}})}; }}; },
   update(payload) { updates.push(payload); return {eq() { return {select() { return {single:async()=>fail ? {error:{}} : {data:{id:'r1'}}}; }}; }}; }
  }; }
 };
 const context={window:{routeId:'r1'},document:{getElementById:el,querySelectorAll:()=>[]},routeSavePending:false,updateStatusBadge(){},syncEditorMode(){},showToast:(...args)=>toasts.push(args),getSb:async()=>sb};
 vm.createContext(context);vm.runInContext(code,context);await context.confirmCancel();assert.equal(updates.length,1);assert.equal(updates[0].front_config.visibility,'public');assert.equal(updates[0].front_config.sortieStatus,'annulee');assert.equal(context.routeSavePending,false);
 if(fail){assert(!toasts.some(t=>t[0]==='Sortie annulée et enregistrée.'));assert.equal(el('statut').value,'publiee');}else{assert.equal(el('statut').value,'annulee');assert(toasts.some(t=>t[0]==='Sortie annulée et enregistrée.'));}
}
(async()=>{await scenario(false);await scenario(true);console.log('PASS : annulation persistée, visibilité conservée, pas de faux succès en cas de refus.');})().catch(e=>{console.error(e);process.exit(1)});
