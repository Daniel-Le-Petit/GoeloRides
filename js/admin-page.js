/** Accès commun aux pages admin : aucun chargement de détail sur le Dashboard. */
(function(global){
 'use strict';
 var initializedUser=null;
 function state(){return global.GoeloAuthState?global.GoeloAuthState.getState():{pending:global.GOELO_AUTH_PENDING,role:global.GOELO_ROLE,user:global.GOELO_USER,pseudo:global.GOELO_DISPLAY_NAME};}
 function apply(){
  var s=state(),allowed=!s.pending&&s.role==='admin'&&s.user&&s.user.id;
  var gate=document.getElementById('gtr-admin-gate'),panel=document.getElementById('gtr-admin-panel');
  if(gate)gate.style.display=allowed?'none':'flex';if(panel)panel.style.display=allowed?'block':'none';
  document.querySelectorAll('[data-admin-only]').forEach(function(el){el.hidden=!allowed;});
  if(!allowed){initializedUser=null;return;}
  var name=String(s.pseudo||global.GOELO_DISPLAY_NAME||'Admin'),label=document.getElementById('admin-name'),avatar=document.getElementById('admin-avatar');
  if(label)label.textContent=name;if(avatar)avatar.textContent=name.slice(0,2).toUpperCase();
  if(initializedUser===s.user.id)return;initializedUser=s.user.id;
  if(document.getElementById('act-dashboard')&&global.GoeloAdminActivity)global.GoeloAdminActivity.init();
 }
 function init(){
  var file=String(global.location.pathname).split('/').pop()||'index.html';
  var oldLinks={'#act-dashboard':'admin-activite.html','#admin-participation-panel':'admin-participations.html','#admin-home-alerts':'admin-alertes-accueil.html','#gtr-approvals':'admin-approbations.html'};
  if(file==='admin.html'&&oldLinks[global.location.hash]){global.location.replace(oldLinks[global.location.hash]);return;}
  var logout=document.getElementById('admin-logout-btn');
  if(logout)logout.addEventListener('click',async function(){
   if(typeof global.goeloSignOut!=='function')return;logout.disabled=true;
   try{await global.goeloSignOut();global.location.href='index.html';}
   catch(_){logout.disabled=false;logout.textContent='Réessayer';}
  });
  global.addEventListener('goelo:auth-state',apply);global.addEventListener('goelo:role-ready',apply);apply();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
