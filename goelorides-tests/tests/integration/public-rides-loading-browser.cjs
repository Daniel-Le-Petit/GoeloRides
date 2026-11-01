/** Le vrai code des pages doit afficher les sorties même si l'auth et les enrichissements restent bloqués. */
const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message);});
 await page.clock.install();
 await page.addInitScript(()=>{
  window.failPublic=false;window.publicRows=[{id:'public-1',track_name:'Sortie publique visible',group_label:'Groupe vert',is_active:true,front_config:{visibility:'public',sortieStatus:'publiee',rideDateIso:'2099-06-13',rideTime:'09:00',meetTime:'08:45',meetPlace:'Kasino',stats:{totalKm:40,elevGainM:300}}}];
  const stuck=()=>new Promise(()=>{});
  window.GOELO_CONFIG={SUPABASE_URL:'https://api-fixture.test',SUPABASE_ANON_KEY:'public-fixture-key'};
  window.GOELO_AUTH_PENDING=true;window.GOELO_ROLE='visitor';window.GOELO_USER=null;
  window.GoeloUI={waitForRole:stuck,syncRoleUI(){},catchUpRoleUI(){}};
  window.goeloGetSb=()=>({rpc:stuck,from:()=>({select(){return this},eq(){return this},order:async()=>({data:[...window.publicRows,{id:'private-1',track_name:'Brouillon privé admin',front_config:{visibility:'draft',sortieStatus:'brouillon',rideDateIso:'2099-06-14'}}]})})});
  window.GoeloSignupParticipants={enrichCardsWithParticipants:stuck,renderParticipantsPreview:()=>''};
  window.GoeloWeather={enrichSorties:stuck};
  window.GoeloActivity={EVENT_TYPES:{PAGE_HOME_VIEWED:'home',PAGE_SORTIES_VIEWED:'sorties'},logEvent(){},trackScrollDepth(){return {refresh(){}}},observeFooterOnce(){}};
 });
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='api-fixture.test'){
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   var failed,rows;
   try { failed=await page.evaluate(()=>window.failPublic);rows=await page.evaluate(()=>window.publicRows); } catch (_) { return route.abort().catch(()=>{}); }
   if(failed)return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({code:'test_unavailable'})});
   const data=url.pathname.endsWith('routes_upcoming_homepage')?rows.map(r=>({...r,...r.front_config})):rows;
   return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(url.hostname!=='rides.test')return route.fulfill({body:'',contentType:'text/javascript'});
  const enabled=['/js/home.js','/js/sorties.js','/js/goelo-public-data.js','/js/goelo-sortie-dates.js','/js/sortie-cards.js'];
  if(url.pathname.endsWith('.js')&&!enabled.includes(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
  const file=path.join(root,decodeURIComponent(url.pathname));if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
 });
 for(const file of ['index','sorties']){
  await page.goto('http://rides.test/'+file+'.html');
  const host=file==='index'?'#gr-upcoming-rides':'#sorties-list';
  await page.locator(host+' .go-sc-card').waitFor();
  assert((await page.textContent(host)).includes('Sortie publique visible'));assert(await page.evaluate(()=>window.GOELO_AUTH_PENDING));
  if(file==='sorties'){
   await page.evaluate(()=>{window.GOELO_ROLE='admin';window.GOELO_USER={id:'admin'};window.GOELO_AUTH_PENDING=false;window.dispatchEvent(new CustomEvent('goelo:role-ready',{detail:{role:'admin'}}));});
   await page.waitForFunction(()=>document.querySelector('#sorties-list').textContent.includes('Brouillon privé admin'));
   await page.evaluate(()=>{window.failPublic=true;window.GOELO_ROLE='visitor';window.GOELO_USER=null;window.dispatchEvent(new CustomEvent('goelo:role-ready',{detail:{role:'visitor'}}));});
   assert(!(await page.textContent(host)).includes('Brouillon privé admin'));
  }
  await page.reload();
  await page.evaluate(()=>window.failPublic=true);
  // Relancer le chargement avec un échec avant toute réponse.
  await page.route('**/rest/v1/rpc/*',async route=>route.fulfill({status:503,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'},contentType:'application/json',body:'{"code":"offline"}'}));
  await page.reload();
  await page.locator(host+' [role=alert]').waitFor();
  assert(!(await page.textContent(host)).includes('Aucune sortie'));
  await page.unroute('**/rest/v1/rpc/*');await page.evaluate(()=>window.failPublic=false);
  await page.locator(host).getByRole('button',{name:'Réessayer'}).click();
  await page.locator(host+' .go-sc-card').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS',file,': affichage sans session, enrichissements bloqués, erreur explicite, reprise et mobile');
 }
 assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
