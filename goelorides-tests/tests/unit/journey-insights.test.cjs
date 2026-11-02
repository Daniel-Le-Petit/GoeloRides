const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
function app() { const c = { console }; c.window = c; vm.createContext(c); for (const f of ['goelo-journey-insights','goelo-activity']) vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c); return c; }
function ev(action, feature, minute=0, page='parcours', extra={}) { return { event_type:'RIDE_INFO_OPENED', visitor_session_id:'one', created_at:new Date(Date.UTC(2026,10,2,12,minute)).toISOString(), metadata:{analytics_version:1,analytics_action:action,page,feature,...extra} }; }
test('album observé sans fausse consultation de sortie ; libellés lisibles',()=>{
 const c=app(), e=ev('exposed','album',0,'album');
 assert.equal(c.GoeloActivity.registrationProgress({items:[e]}).viewed,false);
 assert.equal(c.GoeloActivity.formatEvent(e).label,'Visible à l’écran : Photos des albums');
 assert.match(c.GoeloActivity.detailTimelineLabel(ev('navigation',null,1,'home',{target_page:'album',surface:'bottom'})),/Album.*menu du bas/);
 assert.equal(c.GoeloActivity.registrationProgress({items:[ev('page',null)]}).viewed,true);
});
test('les anciennes traces et les visiteurs sur une autre page ne sont pas déclarés non exposés',()=>{
 const c=app(), legacy={...ev('page',null),metadata:{},visitor_session_id:'old'};
 const rows=[legacy,ev('page',null,0,'album'),ev('page',null,0,'home',{page_view_id:'p2'})];
 const summary=c.GoeloJourneyInsights.summarize(rows,c.GoeloActivity);
 const level=summary.features.find(f=>f.key==='level');assert.equal(level.eligible,0);assert.equal(level.unseen,0);
 assert.equal(summary.features.find(f=>f.key==='polls').unseen,0);
 rows.push(ev('available','polls',1,'home'));assert.equal(c.GoeloJourneyInsights.summarize(rows,c.GoeloActivity).features.find(f=>f.key==='polls').unseen,1);
});
test('une visibilité sans clic est distincte d’une absence de visibilité ; déduplication par parcours',()=>{
 const c=app(), data=[ev('page',null),ev('exposed','gpx',1),ev('exposed','gpx',2)];
 let row=c.GoeloJourneyInsights.summarize(data,c.GoeloActivity).features.find(f=>f.key==='gpx');
 assert.equal(row.seen,1);assert.equal(row.seenWithoutUse,1);assert.equal(row.unseen,0);
 data.push(ev('used','gpx',3,'parcours',{outcome:'error'}));
 row=c.GoeloJourneyInsights.summarize(data,c.GoeloActivity).features.find(f=>f.key==='gpx');
 assert.equal(row.used,1);assert.equal(row.errors,1);assert.equal(row.seenWithoutUse,0);assert.equal(row.followed,0);
});
test('la succession exige une inscription ultérieure et la même sortie lorsqu’elle est connue',()=>{
 const c=app(); const join=(minute,route,status)=>({...ev('',null,minute),event_type:'RIDE_JOINED',metadata:{route_id:route,status}});
 const used=ev('used','level',3,'parcours',{outcome:'success',route_id:'route-a'});
 const analyze=items=>c.GoeloJourneyInsights.summarize([ev('page',null),used,...items],c.GoeloActivity).features.find(f=>f.key==='level').followed;
 assert.equal(analyze([join(1,'route-a')]),0);assert.equal(analyze([join(4,'route-b')]),0);
 assert.equal(analyze([join(4,'route-a','waiting')]),0);assert.equal(analyze([join(4,'route-a')]),1);
 assert.equal(analyze([join(40,'route-a')]),0);
});
test('les tentatives existantes alimentent les interactions participation sans inventer de confirmation',()=>{
 const c=app(), attempt={...ev('',null,1),event_type:'RIDE_PARTICIPATE_CLICKED',metadata:{participation_phase:'request',participation_attempt_id:'x'}};
 let result=c.GoeloJourneyInsights.summarize([ev('page',null),attempt],c.GoeloActivity);
 assert.equal(result.features.find(f=>f.key==='participation').used,1);assert.equal(result.confirmed,0);assert.equal(result.noConfirmation,1);
 const waiting={...attempt,created_at:ev('',null,2).created_at,metadata:{...attempt.metadata,participation_phase:'result',participation_result:'waiting'}};
 result=c.GoeloJourneyInsights.summarize([ev('page',null),attempt,waiting],c.GoeloActivity);assert.equal(result.noConfirmation,0);
});
test('robots, tests locaux et vrais visiteurs ne sont pas confondus',()=>{
 const {GoeloJourneyInsights:I}=app();assert(I.automated({metadata:{user_agent:'Googlebot/2.1'}}));assert(I.automated({metadata:{user_agent:'HeadlessChrome'}}));assert(I.automated({metadata:{referrer:'http://127.0.0.1:3000/index.html'}}));assert(!I.automated({metadata:{user_agent:'Safari iPhone'}}));
});
test('collecte paginée sur une borne stable, limite explicite et erreurs sans faux historique complet',async()=>{
 const {GoeloJourneyInsights:I}=app();const calls=[];let count=0;
 const sb={from(table){assert.equal(table,'activity_feed_human');const q={select(){return q},gte(k,v){calls.push(['gte',v]);return q},lte(k,v){calls.push(['lte',v]);return q},order(){return q},async range(a,b){calls.push([a,b]);return {data:Array(++count===1?500:2).fill({id:'x'})}}};return q}};
 const result=await I.collect(sb,Date.UTC(2026,10,2));assert.equal(result.rows.length,502);assert.equal(result.partial,false);assert.equal(new Set(calls.filter(c=>c[0]==='lte').map(c=>c[1])).size,1);
 count=0;sb.from=()=>{const q={select(){return q},gte(){return q},lte(){return q},order(){return q},async range(){return {data:Array(500).fill({id:++count})}}};return q};assert.equal((await I.collect(sb)).partial,true);
 sb.from=()=>{throw Error('forbidden')};await assert.rejects(I.collect(sb),/forbidden/);
});
