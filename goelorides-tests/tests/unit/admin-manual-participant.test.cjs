const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../../js/admin-manual-participant.js'),'utf8');
function app(options={}){
 const input={value:'Camille'},button={},status={},form={reportValidity:()=>true,reset(){input.value=''},querySelector:s=>s==='input'?input:button,addEventListener:(name,fn)=>form[name]=fn};
 const host={querySelector:s=>s==='form'?form:status,open:true},listeners={},events=[],calls=[];
 const w={GOELO_ROLE:options.role||'admin',GOELO_USER:{id:'admin-id'},location:{href:'https://example.test/parcours.html?id=r1'},addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:e=>events.push(e),GoeloSignupParticipants:{addGuestParticipant:async(id,data)=>{calls.push({id,data});if(options.block)await new Promise(r=>w.release=r);return options.fail?{ok:false,error:'full'}:{ok:true,participant:{id:'guest1'}}}}};
 const c={window:w,URL,CustomEvent:class{constructor(type,detail){this.type=type;this.detail=detail.detail}},document:{readyState:'complete',getElementById:()=>host}};vm.createContext(c);vm.runInContext(source,c);input.value='Camille';
 return {w,host,form,input,button,status,listeners,events,calls,submit:()=>form.submit({preventDefault(){}})};
}
test('admin : ajout par pseudo, un seul appel en cas de double clic et mise à jour après succès serveur',async()=>{
 const a=app({block:true});const p=a.submit();await a.submit();assert.equal(a.calls.length,1);assert.equal(a.calls[0].data.first_name,'Camille');a.w.release();await p;assert.match(a.status.textContent,/a été ajouté/);assert.equal(a.events[0].detail.route_id,'r1');
});
test('visiteur ou erreur serveur : aucun ajout confirmé ; perte du rôle masque et efface la zone',async()=>{
 const a=app({role:'user'});assert.equal(a.host.hidden,true);await a.submit();assert.equal(a.calls.length,0);
 const b=app({fail:true});await b.submit();assert.match(b.status.textContent,/complète/);assert.equal(b.events.length,0);
 b.w.GOELO_ROLE='user';b.listeners['goelo:role-ready']();assert.equal(b.host.hidden,true);assert.equal(b.status.textContent,'');
});
