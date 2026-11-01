const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.GOELO_CONFIG={SUPABASE_URL:'https://detail-api.test',SUPABASE_ANON_KEY:'public-fixture'};const stuck=()=>new Promise(()=>{});
 window.goeloGetSb=()=>({auth:{getSession:stuck,getUser:stuck}});
 window.GoeloSignupParticipants={fetchForRoute:stuck,renderParticipantsListHtml:()=>'<li>Participants en attente</li>'};
 window.GoeloWeather={t:()=>'',getWeatherForSortie:stuck};
});
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='detail-api.test'){
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  return route.fulfill({headers,contentType:'application/json',body:JSON.stringify([{id:'r1',track_name:'Sortie visible sans connexion',group_label:'Vert',front_config:{visibility:'public',rideDateIso:'2099-06-13',rideTime:'09:00',meetTime:'08:45',meetPlace:'Kasino',stats:{totalKm:40,elevGainM:300}}}])});
 }
 if(u.hostname!=='detail.test')return route.fulfill({body:'',contentType:'text/javascript'});
 const enabled=['/js/goelo-public-data.js','/js/parcours.js'];
 if(u.pathname.endsWith('.js')&&!enabled.includes(u.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
 const file=path.join(root,decodeURIComponent(u.pathname));if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
 return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
});
await page.goto('http://detail.test/parcours.html?id=r1');await page.waitForFunction(()=>document.querySelector('#pd-title').textContent==='Sortie visible sans connexion');
assert(await page.locator('#loading').isHidden());assert((await page.textContent('#pd-place')).includes('Kasino'));assert.equal(await page.textContent('#error'),'');
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);await browser.close();console.log('PASS : fiche publique visible avec connexion, participants et météo bloqués ; fin du chargement et mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
