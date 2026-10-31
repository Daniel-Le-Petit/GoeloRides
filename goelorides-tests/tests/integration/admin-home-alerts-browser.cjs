const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.hostname!=='admin.test')return route.fulfill({body:'',contentType:'text/javascript'});
 if(u.pathname==='/js/auth.js')return route.fulfill({contentType:'text/javascript',body:`
 window.GOELO_ROLE='admin';window.alertRows=[{route_id:'r1',title:'Boucle des falaises',date:'2026-11-01',departure:'09:00',group:'Groupe vert',visible:false,suppressed:false}];
 window.goeloGetSb=()=>({rpc:async(name,args)=>{
  if(window.testError)return {error:{code:'42501'}};
  if(name==='admin_home_alerts_list')return {data:window.alertRows};
  const row=window.alertRows.find(r=>r.route_id===args.p_route_id);row.visible=args.p_enabled;row.suppressed=!args.p_enabled;row.message=args.p_message;
  return {data:{ok:true,visible:args.p_enabled}};
 }});
 document.addEventListener('DOMContentLoaded',()=>{document.querySelector('#gtr-admin-panel').style.display='block';document.querySelector('#gtr-admin-gate')?.remove();});
 `});
 if(u.pathname.endsWith('.js')&&u.pathname!=='/js/admin-home-alerts.js')return route.fulfill({body:'',contentType:'text/javascript'});
 const file=path.join(root,decodeURIComponent(u.pathname));if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
 return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
});
await page.goto('http://admin.test/admin.html#admin-home-alerts');await page.locator('.admin-ha-card').waitFor();
assert(await page.locator('[data-alert-action=hide]').isDisabled());
await page.locator('textarea').fill('Départ <modifié> : vérifie les horaires.');await page.click('[data-alert-action=show]');await page.waitForFunction(()=>document.querySelector('#admin-home-alerts-status').textContent==='Alerte affichée sur l’accueil.');
assert.equal(await page.textContent('.admin-ha-badge'),'Visible sur l’accueil');assert.equal(await page.inputValue('.admin-ha-card textarea'),'Départ <modifié> : vérifie les horaires.');
await page.click('[data-alert-action=hide]');await page.waitForFunction(()=>document.querySelector('#admin-home-alerts-status').textContent==='Alerte retirée de l’accueil.');assert.equal(await page.textContent('.admin-ha-badge'),'Retirée');
await page.click('#admin-home-alerts-refresh');await page.waitForFunction(()=>document.querySelector('#admin-home-alerts-status').textContent==='');assert.equal(await page.textContent('.admin-ha-badge'),'Retirée');
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#admin-home-alerts').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/admin-home-alerts-mobile.png'});
await page.evaluate(()=>window.testError=true);await page.click('[data-alert-action=show]');await page.waitForFunction(()=>document.querySelector('#admin-home-alerts-status').dataset.error==='true');assert((await page.textContent('#admin-home-alerts-status')).includes('réservé'));
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('goelo:role-ready',{detail:{role:'team_rider'}})));assert(await page.locator('#admin-home-alerts').isHidden());assert.equal(await page.locator('.admin-ha-card').count(),0);
assert.deepEqual(errors,[]);await browser.close();console.log('PASS : activation, message, retrait durable après actualisation, erreur serveur, contrôle du rôle et mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
