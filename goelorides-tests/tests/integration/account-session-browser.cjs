/** Charge le vrai auth.js ; seul le SDK Supabase est simulé pour les pannes réseau. */
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sdk = `
window.testSessionMode=new URLSearchParams(location.search).get('scenario')||'ready';
const user={id:'user-1',email:'camille@example.test',created_at:'2025-03-01',user_metadata:{pseudo:'Camille'}};
const profile={pseudo:'Camille',username:'Camille Martin',city:'Saint-Quay',cyclist_level:'intermediaire',role:'user'};
const stuck=()=>new Promise(()=>{});
const query={select(){return this},eq(){return this},maybeSingle(){return window.testSessionMode==='profile-stuck'?stuck():Promise.resolve({data:profile})}};
window.supabase={createClient(){return {from(){return query},rpc(){return Promise.resolve({data:[]})},auth:{
 getSession(){return window.testSessionMode==='stuck'?stuck():Promise.resolve({data:{session:window.testSessionMode==='signedout'?null:{user}}})},
 getUser(){return window.testSessionMode==='user-stuck'?stuck():Promise.resolve({data:{user}})},
 onAuthStateChange(callback){window.testAuthCallback=callback;return {data:{subscription:{unsubscribe(){}}}}},
 signOut(){window.testAuthCallback('SIGNED_OUT',null);return Promise.resolve({})}
}}}};
`;
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.clock.install();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.hostname!=='account.test') return route.fulfill({body:url.pathname.includes('supabase')?sdk:'',contentType:'text/javascript'});
    const file=path.join(root,decodeURIComponent(url.pathname));
    if(!file.startsWith(root+'/')||!fs.existsSync(file)) return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
  });
  for(const file of ['profile','my-bookings']) {
    const prefix=file==='profile'?'profile':'bookings';
    await page.goto('http://account.test/'+file+'.html?scenario=ready');
    await page.locator('#'+prefix+'-content').waitFor({state:'visible'});
    if(file==='profile') assert.equal(await page.inputValue('#profile-fullname'),'Camille Martin');
    await page.evaluate(()=>window.testAuthCallback('SIGNED_OUT',null));
    assert(await page.locator('#'+prefix+'-gate').isVisible());
    await page.goto('http://account.test/'+file+'.html?scenario=user-stuck');
    await page.locator('#'+prefix+'-content').waitFor({state:'visible'}); // résolution du rôle bloquée, page accessible
    await page.goto('http://account.test/'+file+'.html?scenario=signedout');
    await page.locator('#'+prefix+'-gate').waitFor({state:'visible'});
    await page.goto('http://account.test/'+file+'.html?scenario=stuck');
    await page.locator('#'+prefix+'-loading').waitFor({state:'visible'});
    await page.clock.fastForward(13000);
    await page.locator('#'+prefix+'-retry').waitFor({state:'visible'});
    assert(await page.locator('#'+prefix+'-fatal').isVisible());
    await page.evaluate(()=>window.testSessionMode='ready');
    await page.click('#'+prefix+'-retry');
    await page.locator('#'+prefix+'-content').waitFor({state:'visible'});
  }
  await page.goto('http://account.test/profile.html?scenario=profile-stuck');
  await page.locator('#profile-loading').waitFor({state:'visible'});
  await page.clock.fastForward(13000);
  await page.locator('#profile-content').waitFor({state:'visible'});
  assert(await page.locator('#profile-save').isDisabled());
  assert(await page.locator('#profile-retry').isVisible());
  await page.evaluate(()=>window.testSessionMode='ready');
  await page.click('#profile-retry');
  await page.waitForFunction(()=>!document.querySelector('#profile-save').disabled);
  assert.equal(await page.inputValue('#profile-fullname'),'Camille Martin');
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS vrai auth.js : session prête, déconnexion, absence de session, rôle bloqué, délai de session, reprise sur les deux pages.');
})().catch(error=>{console.error(error);process.exit(1)});
