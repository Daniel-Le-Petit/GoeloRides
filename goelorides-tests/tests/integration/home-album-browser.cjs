const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),BASE='https://iqxyiwnjwcepfgngkzsm.supabase.co';
const photo=n=>BASE+'/storage/v1/object/public/ride-photos/test/'+n+'.jpg';
const albums=[{id:'one',title:'Sortie des falaises',ride_date:'2099-04-13',published:true,photos:[photo(1),photo(2)]},{id:'two',title:'Tour du Goëlo',ride_date:'2099-04-12',published:true,photos:[photo(3)]}];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];let mode='ok';page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
 const config="window.GOELO_CONFIG={SUPABASE_URL:'"+BASE+"',SUPABASE_ANON_KEY:'public-test'};";
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===BASE&&u.pathname==='/rest/v1/ride_albums')return route.fulfill({status:mode==='error'?500:200,contentType:'application/json',body:JSON.stringify(mode==='empty'?[]:mode==='broken'?albums.map(a=>({...a,photos:a.photos.map(url=>url.replace('/test/','/test/broken-'))})):albums)});
  if(u.origin===BASE&&u.pathname.startsWith('/storage/')&&mode==='broken')return route.fulfill({status:404,contentType:'text/plain',body:'missing image'});
  if(u.origin===BASE&&u.pathname.startsWith('/storage/')){
   const [w,h]=u.pathname.endsWith('/1.jpg')?[320,640]:u.pathname.endsWith('/3.jpg')?[800,400]:[480,480];
   return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#416951"/><circle cx="50%" cy="50%" r="60" fill="#89a897"/></svg>'});
  }
  if(u.hostname!=='home.test')return route.fulfill({body:'',contentType:'text/javascript'});
  if(u.pathname==='/preview.html')return route.fulfill({contentType:'text/html',body:read('index.html')});
  if(u.pathname==='/js/goelo-config.js')return route.fulfill({contentType:'text/javascript',body:config});
  if(u.pathname.endsWith('.js')&&!['/js/home-album.js','/js/ride-gallery.js'].includes(u.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await page.goto('http://home.test/preview.html');await page.locator('#gr-home-album').waitFor({state:'visible'});assert.equal(await page.locator('[data-home-album-photo]').count(),3);assert.equal(await page.locator('[data-home-album-rides]').count(),0);assert.equal(await page.locator('.gr-home-album__actions a').count(),1);assert.equal(await page.locator('[data-home-album-gallery]').getAttribute('href'),'dans-la-roue.html');

 // Assert computed colors with every real home stylesheet and legacy inline rule loaded.
 const palette=await page.evaluate(()=>{
   const color=(selector,property)=>getComputedStyle(document.querySelector(selector))[property];
   return {
     panel:color('#gr-home-album','backgroundColor'),
     caption:color('.gr-home-album__caption','color'),
     secondary:color('[data-home-album-gallery]','color'),
     secondaryBg:color('[data-home-album-gallery]','backgroundColor')
   };
 });
 assert.deepEqual(palette,{panel:'rgb(26, 26, 26)',caption:'rgb(240, 240, 240)',secondary:'rgb(200, 241, 53)',secondaryBg:'rgb(26, 26, 26)'});
 for(const width of [320,390,1100]){
  await page.setViewportSize({width,height:844});await page.locator('#gr-home-album').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#gr-home-album img')).every(img=>img.complete&&img.naturalWidth>0));
  const pictures=await page.locator('#gr-home-album img').evaluateAll(images=>images.map(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})));
  assert.equal(pictures.length,3);
  for(const picture of pictures){assert(Math.abs(picture.width-pictures[0].width)<1);assert(Math.abs(picture.height-pictures[0].height)<1);assert(picture.height>=90);assert.equal(picture.fit,'cover');}
  assert(new Set(pictures.map(p=>p.naturalWidth/p.naturalHeight)).size===3,'Fixtures portrait, paysage et carré');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const a of await page.locator('.gr-home-album__actions a').all())assert((await a.boundingBox()).height>=44);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#gr-home-album').scrollIntoViewIfNeeded();await page.waitForFunction(()=>Array.from(document.querySelectorAll('#gr-home-album img')).every(img=>img.complete&&img.naturalWidth>0));await page.locator('#gr-home-album').screenshot({path:'/tmp/home-album-mobile.png'});
 await page.locator('[data-home-album-photo]').nth(1).click();await page.waitForURL('**/dans-la-roue.html#album-two');await page.locator('#album-two').waitFor();assert(await page.evaluate(()=>window.scrollY>0));await page.locator('#album-two .cover').click();assert(await page.locator('#photo-viewer').isVisible());await page.locator('#photo-close').click();assert(await page.locator('#photo-viewer').isHidden());
 for(const m of ['empty','error','broken']){mode=m;await page.goto('http://home.test/preview.html');await page.waitForFunction(()=>window.GoeloHomeAlbum);await page.evaluate(()=>window.GoeloHomeAlbum.load());if(m==='broken')await page.evaluate(()=>document.getElementById('gr-home-album').scrollIntoView({block:'start'}));await page.locator('#gr-home-album').waitFor({state:'hidden'});}
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS : aperçus publiés, liens vers les albums, visionneuse conservée, bouton album unique, mobile/desktop et repli silencieux.');
})().catch(e=>{console.error(e);process.exit(1)});
