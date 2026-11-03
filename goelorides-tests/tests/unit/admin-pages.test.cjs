const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('le Dashboard ne contient que son titre et ses sept cadres, sans détail ni requête d’activité',()=>{
 const html=read('admin.html');const main=html.slice(html.indexOf('<div id="gtr-admin-panel"'),html.indexOf('</div><!-- /#gtr-admin-panel -->'));
 assert.equal((main.match(/<a href=/g)||[]).length,7);assert(!/<section|<details|<table|<textarea/.test(main));
 for(const id of ['id="act-dashboard"','id="admin-home-alerts"','id="admin-participation-panel"'])assert(!main.includes(id));
 for(const script of ['gestion-team-rider-admin.js','goelo-admin-activity.js','admin-home-alerts.js','admin-participation-notifications.js','goelo-onesignal.js'])assert(!html.includes('src="js/'+script)&&!html.includes('src="'+script));
 for(const target of ['admin-participations.html','admin-alertes-accueil.html','admin-activite.html'])assert(main.includes('href="'+target+'"'));
});
test('chaque page de détail conserve ses contrôles, son module et un retour Dashboard',()=>{
 for(const [file,id,script] of [['admin-participations.html','admin-participation-panel','admin-participation-notifications.js'],['admin-alertes-accueil.html','admin-home-alerts','admin-home-alerts.js'],['admin-activite.html','act-dashboard','goelo-admin-activity.js']]){
  const html=read(file);assert(html.includes('href="admin.html">← Retour au Dashboard'));assert(html.includes('id="'+id+'"'));assert(html.includes('src="js/'+script));assert(html.includes('src="js/admin-page.js'));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,file+' : identifiant dupliqué');
 }
 assert(read('admin-participations.html').includes('data-apn-page="true"'));
 assert(read('admin-activite.html').includes('id="act-export-btn"'));assert(read('admin-activite.html').includes('data-act-tab="members"'));
});
function setup({file='admin.html',hash='',admin=false,activity=false}={}){
 const elements=new Map(),handlers={},redirects=[];let initialized=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{style:{},hidden:true,textContent:'',addEventListener(){}});return elements.get(id)};
 const link=el('link');const c={document:{readyState:'complete',getElementById:id=>id==='act-dashboard'&&!activity?null:el(id),querySelectorAll:()=>[link]},location:{pathname:'/'+file,hash,replace:to=>redirects.push(to)},GOELO_ROLE:admin?'admin':'visitor',GOELO_USER:admin?{id:'admin'}:null,GOELO_DISPLAY_NAME:'Daniel',addEventListener:(name,fn)=>handlers[name]=fn,GoeloAdminActivity:{init:()=>initialized++}};c.window=c;vm.createContext(c);vm.runInContext(read('js/admin-page.js'),c);return {c,el,handlers,redirects,initialized:()=>initialized};
}
test('l’accès au contenu exige une session admin, y compris après un changement de rôle',()=>{
 const a=setup();assert.equal(a.el('gtr-admin-panel').style.display,'none');assert.equal(a.initialized(),0);
 a.c.GOELO_ROLE='admin';a.c.GOELO_USER={id:'admin'};a.handlers['goelo:role-ready']();assert.equal(a.el('gtr-admin-panel').style.display,'block');assert.equal(a.initialized(),0);
 a.c.GOELO_ROLE='user';a.handlers['goelo:auth-state']();assert.equal(a.el('gtr-admin-panel').style.display,'none');assert.equal(a.el('link').hidden,true);
 const b=setup({admin:true,activity:true,file:'admin-activite.html'});assert.equal(b.initialized(),1);b.handlers['goelo:role-ready']();assert.equal(b.initialized(),1);
});
test('les anciens favoris profonds restent utilisables sans charger le détail sur le hub',()=>{
 for(const [hash,target] of [['#act-dashboard','admin-activite.html'],['#admin-home-alerts','admin-alertes-accueil.html'],['#admin-participation-panel','admin-participations.html']]){
  const a=setup({hash});assert.deepEqual(a.redirects,[target]);assert.equal(a.initialized(),0);
 }
});

function dashboardReturn({page='allrides.html',search='',referrer='',role='visitor'}={}){
 const handlers={},host={children:[],firstChild:null,insertBefore(link){if(!this.children.includes(link))this.children.unshift(link);link.parentNode=this;this.firstChild=this.children[0]},removeChild(link){this.children=this.children.filter(n=>n!==link);link.parentNode=null;this.firstChild=this.children[0]||null}};
 const c={URL,URLSearchParams,location:{pathname:'/'+page,search,origin:'https://goelorides.onrender.com'},document:{readyState:'complete',referrer,querySelector:()=>host,createElement:()=>({parentNode:null})},GOELO_ROLE:role,addEventListener:(key,fn)=>handlers[key]=fn};c.window=c;vm.createContext(c);vm.runInContext(read('js/admin-dashboard-return.js'),c);return {c,host,handlers};
}
test('retour explicite pour les pages appelées depuis le Dashboard, même après rechargement',()=>{
 for(const page of ['allrides.html','gestion-sorties.html']){
  const a=dashboardReturn({page,search:'?mode=create&from=admin'});assert.equal(a.host.children.length,1);assert.equal(a.host.children[0].href,'admin.html');assert.equal(a.host.children[0].textContent,'← Retour au Dashboard');
  const b=dashboardReturn({page,referrer:'https://goelorides.onrender.com/admin.html'});assert.equal(b.host.children.length,1);
 }
 assert.equal(dashboardReturn({page:'admin-sondages.html'}).host.children.length,1);
});
test('les vues publiques et Ride Leader ordinaires ne montrent pas de lien admin ; le rôle tardif est pris en compte',()=>{
 const a=dashboardReturn();assert.equal(a.host.children.length,0);a.c.GOELO_ROLE='admin';a.handlers['goelo:role-ready']();assert.equal(a.host.children.length,1);a.c.GOELO_ROLE='user';a.handlers['goelo:auth-state']();assert.equal(a.host.children.length,0);
 assert.equal(dashboardReturn({page:'gestion-sorties.html',role:'team_rider'}).host.children.length,0);assert.equal(dashboardReturn({page:'sorties.html',role:'admin'}).host.children.length,0);
 for(const file of ['gestion-sorties.html','allrides.html','admin-sondages.html'])assert(read(file).includes('js/admin-dashboard-return.js?v=20261103'));
});
