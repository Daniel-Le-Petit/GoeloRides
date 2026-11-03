const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='layout.test'||u.pathname.endsWith('.js'))return route.fulfill({body:'',contentType:'text/javascript'});
  const file=path.resolve(root,'.'+u.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await page.goto('http://layout.test/parcours.html');
 await page.evaluate(()=>{
  for(const [id,text]of Object.entries({'pd-title':'GoëloRides #17 - Avril 2027 - Le retour','pd-datetime':'Mardi 13 avril 2027 · 09h00','pd-cal-month':'Avr','pd-cal-day':'13','pd-cal-wd':'MAR','pd-captain':'Capitaine : On verra','pd-km':'16,8 km','pd-dplus':'200 m D+','pd-duration':'0h46','pd-meet':'08h30','pd-start':'09h00','pd-place':'Esplanade du casino'}))document.getElementById(id).textContent=text;
  document.getElementById('pd-calendar').hidden=false;
  document.getElementById('pd-calendar-link').href='#calendar';
  document.getElementById('pd-level-shortcut').disabled=false;
 });
 for(const width of [320,390,700,1100]){
  await page.setViewportSize({width,height:844});
  const level=await page.locator('#pd-level-shortcut').boundingBox(),calendar=await page.locator('#pd-calendar-link').boundingBox(),join=await page.locator('#pd-join-btn').boundingBox(),hero=await page.locator('#pd-hero').boundingBox();
  assert(Math.abs(level.y-calendar.y)<1);assert(Math.abs(level.height-calendar.height)<1);
  assert(level.width>100&&calendar.width>100);assert(level.height>=44);
  assert(level.x+level.width<calendar.x);
  assert(join.y>level.y+level.height);
  assert(Math.abs(join.x-level.x)<1);assert(Math.abs(join.x+join.width-calendar.x-calendar.width)<1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const text of ['Je participe !','Me désinscrire']){
   await page.locator('#pd-join-btn').evaluate((el,text)=>el.textContent=text,text);
   assert((await page.locator('#pd-join-btn').boundingBox()).width<hero.width);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#pd-join-btn').evaluate(el=>el.textContent='Je participe !');
 await page.locator('#pd-hero').screenshot({path:'/tmp/ride-actions-mobile.png'});
 await page.locator('#pd-calendar').evaluate(el=>el.hidden=true);
 assert(await page.locator('#pd-calendar-link').isHidden());
 assert(await page.locator('#pd-level-shortcut').isVisible());
 await browser.close();console.log('PASS : actions alignées deux par ligne, participation pleine largeur, mobile 320/390 et desktop, calendrier absent.');
})().catch(e=>{console.error(e);process.exit(1)});
