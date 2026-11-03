/** Parcours mobile isolé : aucune requête ni modification en production. */
const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='admin.test')return route.fulfill({body:'',contentType:'text/javascript'});
  if(u.pathname==='/js/auth.js')return route.fulfill({contentType:'text/javascript',body:`
   window.adminCalls=[];const visitor=new URLSearchParams(location.search).has('visitor');
   window.GoeloAuthState.setState({pending:false,role:visitor?'visitor':'admin',user:visitor?null:{id:'11111111-1111-4111-8111-111111111111'},pseudo:visitor?null:'Daniel'});
   window.goeloGetSb=()=>({rpc:async(name,args)=>{adminCalls.push(name);
    if(name==='admin_participation_notifications_list')return {data:{ok:true,items:[],unread_count:0,device_enabled:false,service:{configured:false}}};
    if(name==='admin_home_alerts_list')return {data:[{route_id:'r1',title:'Boucle des falaises',date:'2099-04-13',departure:'09:00',group:'Groupe vert',visible:false}]};
    if(name==='activity_admin_dashboard')return {data:{stats:{rides_active:1},events:[]}};
    return {data:{ok:true}};
   },from:()=>{adminCalls.push('history');const q={select:()=>q,gte:()=>q,lte:()=>q,order:()=>q,range:async()=>({data:[]})};return q;}});
   window.goeloSignOut=async()=>{};
  `});
  if(u.pathname==='/goelo-onesignal.js')return route.fulfill({contentType:'text/javascript',body:'window.goeloOneSignalInitPromise=async()=>null;'});
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Débordement horizontal');
 await page.goto('http://admin.test/admin.html');await page.locator('#gtr-admin-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('.admin-quicklinks a').count(),7);assert.equal(await page.locator('#act-dashboard,#admin-home-alerts,#admin-participation-panel').count(),0);assert.deepEqual(await page.evaluate(()=>window.adminCalls),[]);await overflow();await page.screenshot({path:'/tmp/admin-hub-mobile.png',fullPage:true});
 await page.getByRole('link',{name:/Alertes de participation/}).last().click();await page.locator('#admin-participation-panel').waitFor({state:'visible'});assert(await page.getByRole('button',{name:'Activer les alertes sur cet appareil'}).isVisible());await overflow();await page.screenshot({path:'/tmp/admin-participations-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'← Retour au Dashboard'}).click();await page.locator('.admin-quicklinks').waitFor();assert.deepEqual(await page.evaluate(()=>window.adminCalls),[]);
 await page.locator('.admin-quicklinks').getByRole('link',{name:/Alertes de l’accueil/}).click();await page.locator('.admin-ha-card').waitFor();assert(await page.locator('[data-alert-action=show]').isVisible());await overflow();await page.screenshot({path:'/tmp/admin-alertes-accueil-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'← Retour au Dashboard'}).click();await page.locator('.admin-quicklinks').getByRole('link',{name:/Activité du site/}).click();await page.getByRole('heading',{name:'Ce qui se passe sur le site'}).waitFor();assert(await page.locator('#act-export-btn').isVisible());await page.getByRole('tab',{name:'Fonctionnalités'}).click();await page.getByRole('heading',{name:'Ce qui est vu et utilisé'}).waitFor();await overflow();await page.screenshot({path:'/tmp/admin-activite-mobile.png',fullPage:true});
 await page.goto('http://admin.test/admin.html#admin-participation-panel');await page.waitForURL('**/admin-participations.html');await page.locator('#admin-participation-panel').waitFor({state:'visible'});
 for(const file of ['admin.html','admin-participations.html','admin-alertes-accueil.html','admin-activite.html']){await page.goto('http://admin.test/'+file+'?visitor=1');assert(await page.locator('#gtr-admin-panel').isHidden());assert(await page.locator('#gtr-admin-gate').isVisible());assert.deepEqual(await page.evaluate(()=>window.adminCalls),[]);}
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS : Dashboard en cadres, zéro chargement de détails, navigation mobile des trois pages, retour, favoris historiques et contrôle admin.');
})().catch(e=>{console.error(e);process.exitCode=1});
