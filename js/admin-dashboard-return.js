/** Retour fixe vers le Dashboard depuis ses pages de destination. */
(function(global){
 'use strict';
 function init(){
  var page=global.location.pathname.split('/').pop();
  var targets={'gestion-sorties.html':'#form-main','allrides.html':'.gr-page-header','admin-sondages.html':'#gtr-admin-panel .page','admin-approbations.html':'#gtr-admin-panel .page','admin-cyclistes.html':'#gtr-admin-panel .page','team-rider.html':'#dashboard','community-manager.html':'#dashboard'};
  if(!targets[page])return;
  var fromDashboard=new URLSearchParams(global.location.search).get('from')==='admin';
  try{var previous=new URL(document.referrer);fromDashboard=fromDashboard||(previous.origin===global.location.origin&&previous.pathname.endsWith('/admin.html'));}catch(_){}
  var link=document.createElement('a');link.href='admin.html';link.className='goelo-dashboard-return';link.textContent='← Retour au Dashboard';
  function sync(){
   var state=global.GoeloAuthState?global.GoeloAuthState.getState():{role:global.GOELO_ROLE,pending:global.GOELO_AUTH_PENDING};
   var visible=fromDashboard||page==='admin-sondages.html'||(!state.pending&&state.role==='admin');
   var host=document.querySelector(targets[page]);
   if(visible&&host&&link.parentNode!==host)host.insertBefore(link,host.firstChild);
   else if(!visible&&link.parentNode)link.parentNode.removeChild(link);
  }
  global.addEventListener('goelo:auth-state',sync);global.addEventListener('goelo:role-ready',sync);sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
