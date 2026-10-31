/** Parcours navigateur avec Supabase simulé ; aucune donnée de production modifiée. */
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const root=path.resolve(__dirname,'../../..');
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname!=='account.test')return route.fulfill({body:'',contentType:'text/javascript'});
 if(u.pathname==='/js/auth.js')return route.fulfill({contentType:'text/javascript',body:`
 window.testProfile={pseudo:'Camille',city:'Saint-Quay',cyclist_level:'intermediaire',role:'user'};
 window.testRows=[{route_id:'later',status:'waiting',route:{id:'later',track_name:'Plus tard',front_config:{rideDateIso:'2099-06-12',rideTime:'09:00',meetPlace:'Port',sortieStatus:'open'}}},{route_id:'next',status:'joined',route:{id:'next',track_name:'Prochaine <sortie>',group_label:'Bleu',front_config:{rideDateIso:'2099-06-10',rideTime:'08:30',meetPlace:'Kasino',sortieStatus:'open'}}},{route_id:'past',status:'joined',route:{id:'past',track_name:'Ancienne',front_config:{rideDateIso:'2020-06-10',rideTime:'08:30',sortieStatus:'open'}}}];
 window.testCancel={ok:true,action:'removed',joined:false};
 window.goeloGetSb=()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:window.testProfile})})}),upsert:(p)=>({select:()=>({single:async()=>{window.testProfile={...window.testProfile,...p};return {data:window.testProfile}}})})}),auth:{updateUser:async()=>({})},rpc:async(name)=>name==='account_my_bookings'?{data:window.testRows}:{data:window.testCancel}});
 GoeloAuthState.setState({pending:false,user:{id:'user-1',email:'camille@example.test'},role:'user',pseudo:'Camille'});
 `});
 const file=path.join(root,decodeURIComponent(u.pathname));
 if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
 return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
});
await page.goto('http://account.test/profile.html');
await page.locator('#profile-content').waitFor({state:'visible'});
assert.equal(await page.inputValue('#profile-city'),'Saint-Quay');
await page.fill('#profile-pseudo','Nouveau pseudo');await page.fill('#profile-city','Paimpol');await page.click('#profile-save');
await page.waitForFunction(()=>document.querySelector('#profile-feedback').textContent.includes('bien été'));
assert.equal(await page.textContent('#profile-name'),'Nouveau pseudo');
await page.fill('#profile-city','Modification');await page.click('button[type=reset]');assert.equal(await page.inputValue('#profile-city'),'Paimpol');
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:path.join(process.env.QA_OUTPUT_DIR,'profile-mobile.png'),fullPage:true});
await page.goto('http://account.test/my-bookings.html');await page.locator('.ac-booking').first().waitFor();
assert.equal(await page.locator('.ac-booking').count(),2);assert((await page.locator('.ac-booking').first().textContent()).includes('Prochaine <sortie>'));
assert((await page.locator('.ac-booking').first().textContent()).includes('08:30'));assert((await page.locator('.ac-booking').first().textContent()).includes('Kasino'));
await page.click('[data-period=past]');assert.equal(await page.locator('.ac-booking').count(),1);assert.equal(await page.locator('.ac-booking__unsub').count(),0);
await page.click('[data-period=upcoming]');
page.on('dialog',d=>d.accept());
await page.evaluate(()=>window.testCancel={ok:true,action:'added',joined:true});await page.locator('.ac-booking__unsub').first().click();await page.waitForFunction(()=>document.querySelector('#bookings-feedback').dataset.error==='true');assert.equal(await page.locator('.ac-booking').count(),2);
await page.evaluate(()=>window.testCancel={ok:true,action:'removed',joined:false});await page.locator('.ac-booking__unsub').first().click();await page.waitForFunction(()=>document.querySelector('#bookings-feedback').textContent.includes('confirmée'));assert.equal(await page.locator('.ac-booking').count(),1);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:path.join(process.env.QA_OUTPUT_DIR,'bookings-mobile.png'),fullPage:true});
await page.setViewportSize({width:1440,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.evaluate(()=>GoeloAuthState.setState({user:null,role:'visitor'}));assert(await page.locator('#bookings-gate').isVisible());
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: édition, sauvegarde, annulation des modifications, tri, heure Paris, historique, refus de faux retrait, désinscription confirmée, déconnexion, mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
