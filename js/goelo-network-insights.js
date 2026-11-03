/** Regroupement descriptif des réseaux ; aucune fusion des identités. */
(function(global){
 'use strict';
 function key(event){var value=(event.metadata||{}).network_key;return /^[a-f0-9]{64}$/.test(value||'')?value:null}
 function group(events,GA){
  var groups=new Map();
  events.forEach(function(e){var k=key(e);if(k){if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}});
  return Array.from(groups,function(pair){
   var sessions=GA.buildVisitorSessions(pair[1]),progress=sessions.map(GA.registrationProgress);
   var browsers=new Set(sessions.map(function(s){return s.visitor_id}).filter(Boolean));
   return {key:pair[0],period:(pair[1][0].metadata||{}).network_period||'',sessions:sessions.length,browsers:browsers.size,
    clicked:progress.filter(function(p){return p.clicked}).length,confirmed:progress.filter(function(p){return p.confirmed}).length,
    accounts:pair[1].filter(function(e){return e.event_type==='USER_REGISTERED'}).length,
    errors:progress.filter(function(p){return p.hasError}).length,
    noClick:progress.filter(function(p){return p.viewed&&!p.clicked&&!p.confirmed&&!p.waiting}).length,
    noConfirmation:progress.filter(function(p){return p.clicked&&!p.confirmed&&!p.waiting}).length};
  }).filter(function(g){return g.sessions>1}).sort(function(a,b){return b.sessions-a.sessions});
 }
 global.GoeloNetworkInsights={key:key,group:group};
})(window);
