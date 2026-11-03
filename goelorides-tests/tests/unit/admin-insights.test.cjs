const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
function setup(rows, options={}) {
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:true,dataset:{},setAttribute(){},handlers:{},addEventListener(name,fn){this.handlers[name]=fn},focus(){this.focused=true},closest(){return null}});return elements.get(id)};
 const c={console,document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,GOELO_ROLE:'admin',GOELO_USER:{id:'daniel-id'},GOELO_DISPLAY_NAME:'Daniel',addEventListener(){}};c.window=c;
 c.goeloGetSb=()=>({});vm.createContext(c);
 for(const file of ['goelo-journey-insights','goelo-activity'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),c);
 c.GoeloActivity.fetchAnalyticsEvents=async()=>({stats:{},events:c.GoeloActivity.formatEvents(rows)});
 c.GoeloJourneyInsights.collect=options.denied?async()=>{throw Error('denied')}:async()=>({rows,partial:!!options.partial});
 const source=fs.readFileSync(path.join(root,'js/goelo-admin-activity.js'),'utf8').replace('window.GoeloAdminActivity = { init: init, refresh: loadActivity };','window.GoeloAdminActivity = { init: init, refresh: loadActivity, tab: setActiveTab, bind: bindControls };');vm.runInContext(source,c);
 return {c,el};
}
function event(sid,name,extra={}) {return {id:Math.random().toString(),event_type:'RIDE_INFO_OPENED',visitor_session_id:sid,actor_pseudo:name,created_at:new Date().toISOString(),metadata:{analytics_version:1,analytics_action:'page',page:'home',...extra}};}
test('synthèse par défaut, masquage du parcours admin entier et des robots ; pas de faux abandon',async()=>{
 const rows=[event('own','?'),event('own','Daniel'),event('bot','?',{user_agent:'Googlebot'}),event('real','Camille')];
 const a=setup(rows);await a.c.GoeloAdminActivity.refresh();const html=a.el('act-analytics-panel').innerHTML;
 assert.match(html,/Ce qui se passe sur le site/);assert.match(html,/1 parcours observés/);assert(!html.includes('Daniel'));assert.match(html,/Aucune absence.*ne prouve un abandon/);assert.match(html,/30 derniers jours/);
});
test('historique limité explicitement annoncé et détail des fonctionnalités disponible sans mesure inventée',async()=>{
 const a=setup([event('real','Camille'),event('real','Camille',{analytics_action:'available',feature:'polls'})],{denied:true});await a.c.GoeloAdminActivity.refresh();assert.match(a.el('act-analytics-panel').innerHTML,/200 événements au maximum/);
 a.c.GoeloAdminActivity.tab('features');const html=a.el('act-analytics-panel').innerHTML;assert.match(html,/Ce qui est vu et utilisé/);assert.match(html,/Pas encore de mesures/);assert.match(html,/Une absence d’interaction ne signifie pas un désintérêt/);
});
test('les libellés de parcours échappent les données utilisateur et les filtres membres restent disponibles',async()=>{
 const row=event('real','<img src=x onerror=alert(1)>');const a=setup([row]);await a.c.GoeloAdminActivity.refresh();
 a.c.GoeloAdminActivity.tab('journeys');let html=a.el('act-analytics-panel').innerHTML;assert(!html.includes('<img'));assert(html.includes('&lt;img'));
 a.c.GoeloAdminActivity.tab('members');html=a.el('act-analytics-panel').innerHTML;assert.match(html,/Fonctionnalités et navigation/);assert(!html.includes('<img'));
});
test('pas de lecture hors session admin ; un changement de rôle pendant la lecture efface les données',async()=>{
 const a=setup([event('real','Camille')]);a.c.GOELO_ROLE='user';await a.c.GoeloAdminActivity.refresh();assert.equal(a.el('act-analytics-panel').innerHTML,'');
 a.c.GOELO_ROLE='admin';let release;a.c.GoeloJourneyInsights.collect=()=>new Promise(resolve=>release=resolve);const pending=a.c.GoeloAdminActivity.refresh();await Promise.resolve();a.c.GOELO_ROLE='user';release({rows:[event('real','Camille')]});await pending;assert(!a.el('act-analytics-panel').innerHTML.includes('Camille'));
});

test('accès aux parcours sans clic ou sans confirmation, avec les mêmes compteurs et filtres',async()=>{
 const raw=(sid,type,metadata={})=>({id:sid+type,event_type:type,visitor_session_id:sid,created_at:new Date().toISOString(),metadata});
 const rows=[
 raw('lecture','PAGE_PARCOURS_VIEWED'),raw('lecture','PAGE_PARCOURS_VIEWED'),
 raw('clic','RIDE_PARTICIPATE_CLICKED'),
 raw('inscrit','RIDE_PARTICIPATE_CLICKED'),raw('inscrit','RIDE_JOINED'),
 raw('attente','RIDE_PARTICIPATE_CLICKED'),raw('attente','RIDE_JOINED',{status:'waiting'})
 ];
 const a=setup(rows);await a.c.GoeloAdminActivity.refresh();
 const html=a.el('act-analytics-panel').innerHTML;
 for(const key of ['viewed','clicked'])assert.match(html,new RegExp('data-act-review-journeys="'+key+'"[^>]*><strong>1</strong>'));
 assert.match(html,/data-act-review-journeys="error" disabled/);
 assert.match(html,/Sortie consultée/);assert.match(html,/Inscription confirmée/);
 a.c.GoeloAdminActivity.bind();
 a.el('act-analytics-panel').handlers.click({target:{closest(selector){return selector==='[data-act-review-journeys]'?{getAttribute:()=> 'clicked',disabled:false}:null}}});
 const detail=a.el('act-analytics-panel').innerHTML;
 assert.match(detail,/<option value="clicked" selected>/);
 assert.match(detail,/1 parcours · page 1\/1/);
 assert.equal(a.el('act-journey-filter').focused,true);
 assert(!detail.includes('Liste d’attente observée'));
});
test('aucune activité : accès désactivés et pas de conclusion sur un abandon',async()=>{
 const a=setup([]);await a.c.GoeloAdminActivity.refresh();const html=a.el('act-analytics-panel').innerHTML;
 assert.equal((html.match(/data-act-review-journeys="[^"]+" disabled/g)||[]).length,3);
 assert.match(html,/Aucune absence.*ne prouve un abandon/);
});
