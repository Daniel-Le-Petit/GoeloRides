const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
function setup(options={}) {
 const docListeners={},listeners={},timers=new Map(),events=[];let next=0,intersection,mutation;
 const target={isConnected:true,visible:true,closest:()=>null,getBoundingClientRect(){return {width:300,height:50,top:this.visible?10:900,bottom:this.visible?60:950}}};
 const document={readyState:'complete',visibilityState:'visible',referrer:'https://facebook.com/path?private=secret',body:{},querySelectorAll:selector=>selector.includes('#pd-gpx-btn')?[target]:[],addEventListener:(key,fn)=>docListeners[key]=fn};
 const c={document,console,location:{pathname:'/parcours.html',hostname:'goelorides.onrender.com',origin:'https://goelorides.onrender.com',href:'https://goelorides.onrender.com/parcours.html?id=r1&private=secret',search:'?id=r1&private=secret'},navigator:{userAgent:options.bot?'Googlebot':'Safari iPhone'},URL,URLSearchParams,crypto:{randomUUID:()=>String(++next)},innerHeight:600,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),setTimeout:fn=>{let id=++next;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),addEventListener:(key,fn)=>listeners[key]=fn,goeloGetSb:()=>({}),IntersectionObserver:class{constructor(cb){intersection=cb}observe(){}unobserve(){}},MutationObserver:class{constructor(cb){mutation=cb}observe(){}},GoeloActivity:{EVENT_TYPES:{RIDE_INFO_OPENED:'RIDE_INFO_OPENED'},logEvent:(_,type,meta)=>{if(options.failure)throw Error('offline');events.push({type,meta});return Promise.resolve()}}};
 c.window=c;vm.createContext(c);for(const file of ['goelo-journey-insights','goelo-feature-tracking'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),c);
 return {c,events,target,timers,docListeners,listeners,intersect(value=true){intersection([{target,isIntersecting:value}])},flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn())}};
}
test('exposition après une seconde continue ; pas au chargement, ni doublon',()=>{
 const a=setup();assert.equal(a.events.filter(e=>e.meta.analytics_action!=='available').length,1);assert.equal(a.events[0].meta.analytics_action,'page');
 a.intersect();assert.equal(a.events.filter(e=>e.meta.analytics_action!=='available').length,1);a.flush();a.intersect();a.flush();assert.equal(a.events.filter(e=>e.meta.analytics_action==='exposed').length,1);
});
test('un bloc quitté trop vite ou un onglet caché ne compte pas comme vu',()=>{
 const a=setup();a.intersect();a.intersect(false);a.flush();assert.equal(a.events.filter(e=>e.meta.analytics_action!=='available').length,1);
 a.intersect();a.c.document.visibilityState='hidden';a.docListeners.visibilitychange();a.flush();assert.equal(a.events.filter(e=>e.meta.analytics_action!=='available').length,1);
 a.c.document.visibilityState='visible';a.target.visible=false;a.intersect();a.flush();assert.equal(a.events.filter(e=>e.meta.analytics_action!=='available').length,1);
});
test('métadonnées minimales, pas de valeur saisie, secret, URL complète ou pseudo',()=>{
 const a=setup();a.c.GoeloFeatureTracking.record('gpx','success');a.c.GoeloFeatureTracking.record('gpx','success');
 assert.equal(a.events.filter(e=>e.meta.analytics_action==='used').length,1);assert.equal(a.events.find(e=>e.meta.analytics_action==='used').meta.route_id,'r1');const data=JSON.stringify(a.events);assert(!data.includes('secret'));assert(!data.includes('private'));assert(!data.includes('pseudo'));assert.equal(a.events.find(e=>e.meta.analytics_action==='used').meta.referrer,'https://facebook.com/path');
});
test('robots exclus, panne du suivi indépendante des actions, retour Safari mesuré de nouveau',()=>{
 const robot=setup({bot:true});robot.c.GoeloFeatureTracking.record('gpx','success');assert.equal(robot.events.length,0);
 const failing=setup({failure:true});assert.doesNotThrow(()=>failing.c.GoeloFeatureTracking.record('gpx','success'));
 const a=setup();a.intersect();a.flush();a.listeners.pageshow({persisted:true});a.intersect();a.flush();assert.equal(a.events.filter(e=>e.meta.analytics_action==='page').length,2);assert.equal(a.events.filter(e=>e.meta.analytics_action==='exposed').length,2);
});
