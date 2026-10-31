/** Gestion des alertes de l’accueil : permissions vérifiées par chaque RPC. */
(function(){
 'use strict';
 var root,list,feedback,revision=0,busy=false;
 function text(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
 function client(){return window.goeloGetSb&&window.goeloGetSb();}
 async function request(name,args){var sb=client();if(!sb)throw Error('session');var timer;try{var result=await Promise.race([sb.rpc(name,args),new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('timeout'));},12000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}}
 function status(message,error){feedback.textContent=message;feedback.dataset.error=String(!!error);}
 function render(rows){
  list.innerHTML=rows.length?rows.map(function(r){
   var when=/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')?new Date(r.date+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',weekday:'long',timeZone:'Europe/Paris'}):'Date à confirmer';
   return '<article class="admin-ha-card" data-alert-route="'+text(r.route_id)+'"><div class="admin-ha-card__head"><div><h3>'+text(r.title||'Sortie')+'</h3><p>'+text([when,r.departure,r.group].filter(Boolean).join(' · '))+'</p></div><span class="admin-ha-badge'+(r.visible?' is-visible':'')+'">'+(r.visible?'Visible sur l’accueil':r.suppressed?'Retirée':'Aucune alerte')+'</span></div><label>Message sur l’accueil <span>(facultatif, 400 caractères maximum)</span><textarea maxlength="400" rows="2" placeholder="Ex. : départ décalé, consultez les nouveaux horaires…">'+text(r.message||'')+'</textarea></label><div class="admin-ha-actions"><button type="button" data-alert-action="show">'+(r.visible?'Actualiser le message':'Afficher sur l’accueil')+'</button><button type="button" data-alert-action="hide" '+(!r.visible?'disabled':'')+'>Retirer</button><a href="gestion-sorties.html?mode=edit&id='+encodeURIComponent(r.route_id)+'">Modifier la sortie →</a></div></article>';
  }).join(''):'<p class="admin-ha-empty">Aucune sortie publique à annoncer dans les sept prochains jours.</p>';
 }
 async function load(){
  var ticket=++revision;status('Chargement des alertes…');
  try{var rows=await request('admin_home_alerts_list');if(ticket!==revision)return;if(!Array.isArray(rows))throw Error('format');render(rows);status('');return true;}
  catch(error){if(ticket!==revision)return;list.innerHTML='';status(error.code==='42501'?'Accès réservé aux administrateurs.':'Impossible de charger les alertes. Clique sur Actualiser pour réessayer.',true);return false;}
 }
 async function act(button){
  if(busy)return;var card=button.closest('[data-alert-route]');if(!card)return;
  var enabled=button.dataset.alertAction==='show',message=card.querySelector('textarea').value.trim();
  if(message.length>400){status('Le message est limité à 400 caractères.',true);return;}
  var ticket=revision;busy=true;root.querySelectorAll('button,textarea').forEach(function(el){el.disabled=true;});status(enabled?'Publication de l’alerte…':'Retrait de l’alerte…');
  try{var result=await request('admin_home_alert_set',{p_route_id:card.dataset.alertRoute,p_enabled:enabled,p_message:message||null});if(ticket!==revision)return;if(!result||result.ok!==true||result.visible!==enabled)throw Error('unconfirmed');var refreshed=await load();if(refreshed)status(enabled?'Alerte affichée sur l’accueil.':'Alerte retirée de l’accueil.');}
  catch(error){if(ticket===revision)status(error.code==='42501'?'Accès réservé aux administrateurs.':'Action non confirmée. Actualise pour vérifier l’état avant de réessayer.',true);}
  finally{busy=false;root.querySelectorAll('button,textarea').forEach(function(el){el.disabled=false;});list.querySelectorAll('.admin-ha-card').forEach(function(card){if(!card.querySelector('.is-visible'))card.querySelector('[data-alert-action=hide]').disabled=true;});}
 }
 function auth(detail){if(detail&&detail.role==='admin'){if(root.hidden){root.hidden=false;load();}}else{revision++;root.hidden=true;list.innerHTML='';status('');}}
 function init(){root=document.getElementById('admin-home-alerts');if(!root)return;list=document.getElementById('admin-home-alerts-list');feedback=document.getElementById('admin-home-alerts-status');root.addEventListener('click',function(e){var b=e.target.closest('[data-alert-action]');if(b)act(b);});document.getElementById('admin-home-alerts-refresh').addEventListener('click',function(){if(!busy)load();});window.addEventListener('goelo:role-ready',function(e){auth(e.detail);});auth({role:window.GOELO_ROLE});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
