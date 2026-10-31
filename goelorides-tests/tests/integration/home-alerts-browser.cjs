const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 await page.addInitScript(()=>{
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const date=tomorrow.toISOString().slice(0,10);
  window.testAlerts=[{route_id:'cancel',kind:'cancelled',title:'Boucle des falaises',date,departure:'09:00',group:'Groupe vert',place:'Kasino'},{route_id:'change',kind:'schedule',title:'Matinale <test>',date,departure:'10:00',meeting:'09:45',previous:{date,departure:'09:00',meeting:'08:45'}}];
  window.goeloGetSb=()=>({rpc:async()=>window.testFail?{error:{message:'offline'}}:{data:window.testAlerts}});
 });
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='home.test')return route.fulfill({body:'',contentType:'text/javascript'});
  const file=path.join(root,decodeURIComponent(u.pathname));
  if(u.pathname.endsWith('.js')&&!['/js/home-priority-alerts.js','/js/goelo-navbar.js'].includes(u.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
  if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'image/png'});
 });
 await page.goto('http://home.test/index.html');await page.locator('.home-priority-alert').first().waitFor();
 assert.equal(await page.locator('.home-priority-alert').count(),2);
 assert((await page.locator('.home-priority-alert').first().textContent()).includes('Demain'));
 assert((await page.locator('.home-priority-alert').nth(1).textContent()).includes('09 h 00 → 10 h 00'));
 assert((await page.locator('.home-priority-alert').nth(1).textContent()).includes('Matinale <test>'));
 assert.equal(await page.locator('#home-priority-alerts script').count(),0);
 const banner=await page.locator('#home-priority-alerts').boundingBox(),hero=await page.locator('.gr-hero').boundingBox();assert(banner.y<=1);assert(hero.y>=banner.y+banner.height-1);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/home-alerts-mobile.png',fullPage:false});
 await page.setViewportSize({width:1440,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/home-alerts-desktop.png',fullPage:false});
 await page.evaluate(()=>window.testFail=true);await page.clock.fastForward(60000);await page.locator('.home-priority-alert__stale').waitFor();assert.equal(await page.locator('.home-priority-alert').count(),2);
 await page.evaluate(()=>{window.testFail=false;window.testAlerts=[];});await page.clock.fastForward(60000);await page.waitForFunction(()=>document.querySelector('#home-priority-alerts').hidden);
 await page.reload();await page.locator('.home-priority-alert').first().waitFor();assert.equal(await page.evaluate(()=>localStorage.length),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS : première visite, avant le hero, mobile/ordinateur, annulation, anciens/nouveaux horaires, échappement, réactualisation et panne réseau.');
})().catch(e=>{console.error(e);process.exit(1)});
