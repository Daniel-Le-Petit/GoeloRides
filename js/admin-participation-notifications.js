/** Cloche privée et abonnement push explicite pour l'administrateur connecté. */
(function(global){
 'use strict';
 var root,bell,list,status,pushStatus,enable,disable,mark,badge,revision=0,loadRevision=0,rows=[],device=null,enabled=false,busy=false,timer=null,userId=null;
 var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 function $(id){return document.getElementById(id);}
 function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
 function auth(){var a=global.GoeloAuthState&&global.GoeloAuthState.getState();return a||{role:global.GOELO_ROLE,user:global.GOELO_USER,pending:global.GOELO_AUTH_PENDING};}
 function isAdmin(){var a=auth();return !a.pending&&a.role==='admin'&&a.user&&a.user.id;}
 function storageKey(){return 'goelo-admin-push-device:'+userId;}
 function storedDevice(){try{var v=localStorage.getItem(storageKey());return UUID.test(v||'')?v:null;}catch(_){return null;}}
 function rememberDevice(id){device=id;try{localStorage.setItem(storageKey(),id);}catch(_){}}
 async function rpc(name,args){var sb=global.goeloGetSb&&global.goeloGetSb();if(!sb)throw Error('session');var timeout;try{var r=await Promise.race([sb.rpc(name,args),new Promise(function(_,reject){timeout=setTimeout(function(){reject(Error('timeout'));},15000);})]);if(r.error||!r.data||r.data.ok!==true)throw Error(r.error&&r.error.code||'unconfirmed');return r.data;}finally{clearTimeout(timeout);}}
 function when(iso){var d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
 function render(data){
  rows=data.items||[];enabled=data.device_enabled===true;
  var count=Number(data.unread_count)||0;badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;
  bell.setAttribute('aria-label','Participations : '+count+' alerte'+(count===1?'':'s')+' non lue'+(count===1?'':'s'));
  list.innerHTML=rows.length?rows.map(function(n){return '<li class="apn-item'+(n.is_read?' is-read':'')+'"><div><p><strong>'+esc(n.participant_name)+'</strong> '+(n.action==='joined'?'participe à':'s’est désinscrit·e de')+' <strong>'+esc(n.route_title)+'</strong></p><p class="apn-meta">'+esc(when(n.created_at))+' · '+esc(n.participant_count)+' participant'+(n.participant_count===1?'':'s')+' lors du changement</p><a href="parcours.html?id='+encodeURIComponent(n.route_id)+'">Voir la sortie →</a></div>'+(!n.is_read?'<button type="button" data-apn-read="'+esc(n.id)+'">Marquer lue</button>':'<span class="apn-read-label">Lue</span>')+'</li>';}).join(''):'<li class="apn-empty">Les prochaines inscriptions et désinscriptions apparaîtront ici.</li>';
  mark.disabled=!rows.some(function(n){return !n.is_read;});disable.hidden=!enabled;enable.hidden=enabled;
  var s=data.service||{},recent=s.checked_at&&Date.now()-new Date(s.checked_at).getTime()<30*60000;
  var permission=global.Notification&&global.Notification.permission;
  if(enabled&&(permission==='denied'||permission==='default'||!global.Notification)){enable.hidden=false;pushStatus.textContent='Cet appareil est enregistré, mais les notifications ne sont pas autorisées dans cette fenêtre. Ouvre l’application installée puis réactive les alertes.';}
  else if(s.problem==='provider_authorization')pushStatus.textContent='OneSignal refuse l’authentification du service d’envoi. La configuration serveur doit être corrigée ; les alertes restent disponibles ici.';
  else if(!s.configured)pushStatus.textContent=enabled?'Cet appareil est enregistré. L’envoi OneSignal reste à configurer côté serveur ; les alertes sont conservées ici.':'Les alertes sont disponibles ici. L’envoi OneSignal doit encore être configuré côté serveur.';
  else if(enabled)pushStatus.textContent=recent?'Alertes activées sur cet appareil. Envoi périodique, généralement en quelques minutes.':'Cet appareil est enregistré. Le dernier contrôle de l’envoi serveur date de plus de 30 minutes ; vérifie le traitement des notifications.';
  else pushStatus.textContent='Active les alertes sur cet appareil pour recevoir les prochaines participations et désinscriptions.';
 }
 async function load(){if(!isAdmin())return;var version=revision,loadVersion=++loadRevision;try{var data=await rpc('admin_participation_notifications_list',{p_subscription_id:device});if(version!==revision||loadVersion!==loadRevision||!isAdmin())return;render(data);status.textContent='';}catch(_){if(version!==revision||loadVersion!==loadRevision)return;status.textContent='Impossible de charger les alertes. Actualise pour réessayer.';}}
 async function read(ids){if(!isAdmin()||busy||!ids.length)return;busy=true;var version=revision;try{await rpc('admin_participation_notifications_read',{p_ids:ids});if(version===revision)await load();}catch(_){if(version===revision)status.textContent='Lecture non confirmée. Réessaie.';}finally{busy=false;}}
 async function subscriptionId(O){
  var sub=O&&O.User&&O.User.PushSubscription;if(!sub)throw Error('subscription');
  if(sub.id&&sub.optedIn!==false)return sub.id;
  return new Promise(function(resolve,reject){var wait=setTimeout(function(){cleanup();reject(Error('subscription'));},20000);
   function cleanup(){clearTimeout(wait);if(sub.removeEventListener)sub.removeEventListener('change',changed);}
   function changed(){if(sub.id&&sub.optedIn!==false){cleanup();resolve(sub.id);}}
   if(sub.addEventListener)sub.addEventListener('change',changed);changed();
  });
 }
 async function activate(){
  if(!isAdmin()||busy)return;
  var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  var standalone=global.matchMedia&&global.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  if(ios&&!standalone){pushStatus.textContent='Sur iPhone : ouvre GoëloRides dans Safari, Partager → Sur l’écran d’accueil. Ouvre ensuite le site depuis son icône, connecte-toi en admin et active ces alertes.';return;}
  busy=true;enable.disabled=true;var version=revision;pushStatus.textContent='Autorise les notifications puis patiente pendant l’enregistrement…';
  try{
   if(!global.goeloRequestPushSubscription||!global.goeloOneSignalInitPromise)throw Error('sdk');
   var result=await global.goeloRequestPushSubscription();if(!result||!result.ok)throw Error('permission');
   var O=await global.goeloOneSignalInitPromise(),id=await subscriptionId(O);
   if(!UUID.test(id||'')||version!==revision||!isAdmin())throw Error('session');
   var saved=await rpc('admin_participation_device_set',{p_subscription_id:id,p_enabled:true});
   if(!saved.enabled||version!==revision||!isAdmin())throw Error('session');rememberDevice(id);await load();
  }catch(error){if(version===revision)pushStatus.textContent=error.message==='permission'?'Autorisation non confirmée. Vérifie les notifications du navigateur puis réessaie.':'Abonnement aux alertes non confirmé. Recharge puis réessaie ; aucune activation n’est annoncée sans confirmation serveur.';}
  finally{busy=false;enable.disabled=false;}
 }
 async function deactivate(){if(!isAdmin()||busy||!device)return;busy=true;disable.disabled=true;var version=revision;try{await rpc('admin_participation_device_set',{p_subscription_id:device,p_enabled:false});if(version===revision)await load();}catch(_){if(version===revision)pushStatus.textContent='Désactivation non confirmée. Réessaie.';}finally{busy=false;disable.disabled=false;}}
 function openPanel(scroll){
  if(!isAdmin())return;
  root.hidden=false;bell.setAttribute('aria-expanded','true');load();
  if(scroll)root.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function openFromHash(){if(global.location&&global.location.hash==='#admin-participation-panel')openPanel(true);}
 function changeAuth(){
  var a=auth();if(a.pending||a.role!=='admin'||!a.user){revision++;userId=null;device=null;rows=[];enabled=false;root.hidden=true;bell.hidden=true;bell.setAttribute('aria-expanded','false');list.innerHTML='';badge.hidden=true;clearInterval(timer);timer=null;return;}
  if(userId===a.user.id)return;revision++;userId=a.user.id;device=storedDevice();bell.hidden=false;load();openFromHash();clearInterval(timer);timer=setInterval(function(){if(document.visibilityState!=='hidden')load();},30000);
 }
 function init(){
  root=$('admin-participation-panel');bell=$('admin-participation-bell');if(!root||!bell)return;
  list=$('admin-participation-list');status=$('admin-participation-status');pushStatus=$('admin-participation-push-status');badge=$('admin-participation-count');enable=$('admin-participation-enable');disable=$('admin-participation-disable');mark=$('admin-participation-mark');
  bell.addEventListener('click',function(){root.hidden=!root.hidden;bell.setAttribute('aria-expanded',String(!root.hidden));if(!root.hidden){load();root.scrollIntoView({block:'start',behavior:'smooth'});}});
  ['admin-participation-open','admin-participation-nav'].forEach(function(id){var link=$(id);if(link)link.addEventListener('click',function(){openPanel(true);});});
  global.addEventListener('hashchange',openFromHash);
  enable.addEventListener('click',activate);disable.addEventListener('click',deactivate);mark.addEventListener('click',function(){read(rows.filter(function(n){return !n.is_read;}).map(function(n){return n.id;}));});
  $('admin-participation-refresh').addEventListener('click',load);list.addEventListener('click',function(event){var b=event.target.closest('[data-apn-read]');if(b)read([b.getAttribute('data-apn-read')]);});
  global.addEventListener('goelo:auth-state',changeAuth);global.addEventListener('goelo:role-ready',changeAuth);global.addEventListener('goelo:auth-success',changeAuth);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')load();});changeAuth();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
