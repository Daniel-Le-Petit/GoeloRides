const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='review.test'||u.pathname.endsWith('.js'))return route.fulfill({body:'',contentType:'text/javascript'});
  const file=path.resolve(root,'.'+u.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 for(const file of ['profile.html','my-bookings.html']){
  await page.goto('http://review.test/'+file);
  await page.evaluate(()=>{
   for(const id of ['profile-loading','bookings-loading']){var el=document.getElementById(id);if(el)el.hidden=true}
   for(const id of ['profile-content','bookings-content']){var el=document.getElementById(id);if(el)el.hidden=false}
  });
  const palette=await page.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,card:getComputedStyle(document.querySelector('.ac-card')).backgroundColor,button:getComputedStyle(document.querySelector('.ac-btn:not(.ac-btn--secondary)')).backgroundColor}));
  assert.deepEqual(palette,{body:'rgb(13, 13, 13)',card:'rgb(26, 26, 26)',button:'rgb(200, 241, 53)'});
  for(const width of [320,390,1100]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/'+file.replace('.html','')+'-goelo.png'});
  if(file==='profile.html'){
   await page.locator('#profile-email-editor').evaluate(el=>el.showModal());
   assert.equal(await page.locator('#profile-email-editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 26)');
   await page.locator('#profile-email-editor').evaluate(el=>el.close());
  }
 }
 await page.goto('http://review.test/parcours.html?id=r1');
 await page.evaluate(()=>{
  window.GOELO_ROLE='admin';window.GOELO_USER={id:'admin-1'};window.GOELO_AUTH_PENDING=false;
  window.testCalls=[];window.GoeloSignupParticipants={addGuestParticipant:async(id,data)=>{window.testCalls.push({id,data});return {ok:true,participant:{id:'g1'}}}};
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/admin-manual-participant.js'),'utf8')});
 await page.locator('#pd-admin-participant summary').click();
 await page.locator('#pd-admin-pseudo').fill('Camille');await page.locator('#pd-admin-participant button').click();
 await page.waitForFunction(()=>document.querySelector('#pd-admin-participant [role="status"]').textContent.includes('a été ajouté'));
 assert.equal(await page.evaluate(()=>testCalls[0].data.first_name),'Camille');
 await page.evaluate(()=>{window.GOELO_ROLE='user';window.dispatchEvent(new Event('goelo:role-ready'))});
 assert(await page.locator('#pd-admin-participant').isHidden());
 await browser.close();console.log('PASS : palette réelle Profil/Inscriptions/e-mail, mobile 320/390, desktop et ajout manuel admin.');
})().catch(e=>{console.error(e);process.exit(1)});
