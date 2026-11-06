/** Albums et suivi sur une origine simulée ; aucune écriture en production. */
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),BASE='https://iqxyiwnjwcepfgngkzsm.supabase.co';
const url=name=>BASE+'/storage/v1/object/public/ride-photos/test/'+name+'.jpg';
const albums=Array.from({length:8},(_,i)=>({id:'a'+(i+1),title:'GoëloRides #'+(20-i),ride_date:'2026-10-20',photos:i===0?[url('one'),url('two'),url('missing')]:[url('album-'+i)]}));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
 const events=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 // L’automatisation reste exclue en production ; ce contexte de test exerce le chemin humain.
 await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===BASE&&u.pathname==='/rest/v1/ride_albums')return route.fulfill({contentType:'application/json',body:JSON.stringify(albums)});
  if(u.origin===BASE&&u.pathname==='/rest/v1/rpc/activity_event_log'){
   events.push(route.request().postDataJSON().p_metadata);
   return route.fulfill({contentType:'application/json',body:JSON.stringify('11111111-1111-4111-8111-111111111111')});
  }
  if(u.origin===BASE&&u.pathname.endsWith('/missing.jpg'))return route.fulfill({status:404,body:'missing'});
  if(u.origin===BASE&&u.pathname.startsWith('/storage/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#416951"/></svg>'});
  if(u.hostname!=='album.test')return route.fulfill({body:'',contentType:'text/javascript'});
  if(u.pathname==='/js/goelo-config.js')return route.fulfill({contentType:'text/javascript',body:'window.GOELO_CONFIG='+JSON.stringify({SUPABASE_URL:BASE,SUPABASE_ANON_KEY:'public-test'})+';'});
  const file=path.resolve(root,'.'+u.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 const matching=(action,id,photo)=>events.filter(e=>e.album_id===id&&(action==='exposed'?e.analytics_action==='exposed':e.album_action===action)&&(photo==null||e.photo_index===photo));
 await page.goto('https://album.test/dans-la-roue.html');
 await page.locator('#album-a1 .cover').scrollIntoViewIfNeeded();
 await expect.poll(()=>matching('exposed','a1').length,{timeout:10000}).toBe(1);
 assert.equal(matching('exposed','a8').length,0);
 await page.locator('#album-a1 .cover').click();
 await expect.poll(()=>matching('album_opened','a1').length).toBe(1);
 await expect.poll(()=>matching('photo_opened','a1',1).length).toBe(1);
 await page.locator('#photo-next').click();
 await expect.poll(()=>matching('photo_opened','a1',2).length).toBe(1);
 await page.locator('#photo-next').click();
 await page.waitForFunction(()=>{const img=document.getElementById('photo-large');return img.complete&&img.naturalWidth===0});
 assert.equal(matching('photo_opened','a1',3).length,0);
 await page.evaluate(()=>document.querySelector('#album-a8 .cover').scrollIntoView({block:'center'}));
 await page.waitForTimeout(1200);
 assert.equal(matching('exposed','a8').length,0,'Ne pas compter les albums masqués par la visionneuse');
 await page.locator('#photo-close').click();
 await expect.poll(()=>matching('exposed','a8').length,{timeout:10000}).toBe(1);
 await page.locator('#album-a8 .cover').click();
 await expect.poll(()=>matching('photo_opened','a8',1).length).toBe(1);
 await page.locator('#photo-close').click();
 await page.locator('#album-a1 .cover').scrollIntoViewIfNeeded();
 await page.waitForTimeout(1200);assert.equal(matching('exposed','a1').length,1);
 await page.locator('#album-a1 .cover').click();await page.waitForTimeout(200);
 assert.equal(matching('album_opened','a1').length,1);assert.equal(matching('photo_opened','a1',1).length,1);
 assert(!JSON.stringify(events.filter(e=>e.album_id)).includes('/storage/'));
 assert.equal(events.find(e=>e.album_action==='photo_opened').photo_count,3);
 const label=await page.evaluate(e=>window.GoeloJourneyInsights.eventLabel({metadata:e}),events.find(e=>e.album_action==='photo_opened'&&e.photo_index===2));
 assert.equal(label,'Photo 2/3 ouverte : GoëloRides #20');
 await page.screenshot({path:'/tmp/album-detail-tracking.png'});
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS : albums visibles après une seconde, albums hors écran non comptés, ouvertures distinctes, chargement photo confirmé, erreur image sans faux succès, modal et déduplication.');
})().catch(e=>{console.error(e);process.exit(1)});
