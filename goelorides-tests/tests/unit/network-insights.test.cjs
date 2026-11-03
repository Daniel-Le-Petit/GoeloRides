const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
function api(){const c={window:{},console,document:{addEventListener(){},readyState:'loading'},localStorage:{getItem(){return null}},crypto:globalThis.crypto};c.window=c;vm.createContext(c);for(const f of ['goelo-journey-insights','goelo-activity','goelo-network-insights'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);return c;}
test('réseaux répétés : visites distinctes sans fusionner les navigateurs et sans confondre attente/confirmation',()=>{
 const c=api(),key='a'.repeat(64);
 const row=(sid,time,type,meta={})=>({id:Math.random().toString(),visitor_session_id:sid,created_at:'2026-11-03T'+time+':00Z',event_type:type,metadata:{network_key:key,network_period:'2026-11',...meta}});
 const rows=[row('one','10:00','PAGE_PARCOURS_VIEWED'),row('one','11:00','RIDE_PARTICIPATE_CLICKED'),row('two','12:00','RIDE_PARTICIPATE_CLICKED'),row('two','12:01','RIDE_JOINED',{status:'waiting'}),row('three','13:00','RIDE_JOINED')];
 const groups=c.GoeloNetworkInsights.group(c.GoeloActivity.formatEvents(rows),c.GoeloActivity);
 assert.equal(groups.length,1);assert.equal(groups[0].sessions,4);assert.equal(groups[0].browsers,3);assert.equal(groups[0].noClick,1);assert.equal(groups[0].noConfirmation,1);assert.equal(groups[0].confirmed,1);
});
test('les anciennes activités sans réseau et les réseaux avec une seule visite ne deviennent pas des retours',()=>{
 const c=api();assert.equal(c.GoeloNetworkInsights.group([{visitor_session_id:'x',created_at:new Date().toISOString(),metadata:{}}],c.GoeloActivity).length,0);
 assert.equal(c.GoeloNetworkInsights.key({metadata:{network_key:'<img>'}}),null);
});
