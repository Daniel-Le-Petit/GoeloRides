const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const file of ['index','sorties']){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let fail=false;
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='early-api.test'){
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(fail)return route.fulfill({status:503,headers,body:'{}',contentType:'application/json'});
    const rows=[{id:'r1',track_name:'Sortie avant les autres scripts',group_label:'Vert',rideDateIso:'2099-06-13',rideTime:'09:00',meetTime:'08:45',meetPlace:'Kasino',visibility:'public'}, {id:'private',track_name:'Information privée à masquer',rideDateIso:'2099-06-13',visibility:'private'}];
    return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(rows)});
   }
   if(u.pathname==='/js/goelo-config.js')return route.fulfill({contentType:'text/javascript',body:"window.GOELO_CONFIG={SUPABASE_URL:'https://early-api.test',SUPABASE_ANON_KEY:'public-fixture'}"});
   // Tous les autres scripts, y compris SDK/cartes/auth, restent indéfiniment en attente.
   if(u.pathname.endsWith('.js'))return new Promise(()=>{});
   if(u.hostname!=='early.test')return route.fulfill({body:'',contentType:'text/css'});
   const f=path.join(root,decodeURIComponent(u.pathname));if(!f.startsWith(root+'/')||!fs.existsSync(f))return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':f.endsWith('.jpg')?'image/jpeg':'image/png'});
  });
  await page.goto('http://early.test/'+file+'.html',{waitUntil:'commit'});
  const host=file==='index'?'#gr-upcoming-rides':'#sorties-list';
  const card=file==='index'?'.go-sc-card':'.early-ride-card';
  await page.locator(host+' '+card).waitFor();assert.equal(await page.locator(host+' '+card).count(),1);
  assert(!(await page.textContent(host)).includes('Information privée'));if(file==='index') assert.equal(await page.locator(host+' .go-sc-card__bg').count(),1);
  assert.equal(await page.locator(host+' a[href*="parcours.html"]').first().getAttribute('href'),'parcours.html?id=r1');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // La reprise native fonctionne toujours quand aucun module ultérieur n'a démarré.
  await page.locator(host+' '+card).evaluate(el=>el.remove());
  fail=true;await page.evaluate(()=>{window.GoeloInitialPublicReads={};});
  await page.reload({waitUntil:'commit'});await page.locator(host+' .early-rides-error').waitFor();
  fail=false;await page.locator(host).getByRole('button',{name:'Réessayer'}).click();await page.locator(host+' '+card).waitFor();
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',file,': scripts bloqués, carte visible, données privées exclues, erreur et reprise, mobile.');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
