/** Annonces publiques prioritaires, visibles dès l'ouverture, même sans connexion. */
(function () {
  'use strict';
  var root, requestId=0, timer;
  function text(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function dayLabel(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'Date à confirmer';
    var today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    var date=new Date(iso+'T12:00:00Z');
    var tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    var prefix=iso===today ? 'Aujourd’hui' : iso===tomorrow.toISOString().slice(0,10) ? 'Demain' : '';
    var label=date.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
    return prefix ? prefix+' · '+label : label;
  }
  function hour(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value.replace(':',' h ') : ''; }
  function changes(row) {
    var before=row.previous || {}, bits=[];
    if(before.date && before.date!==row.date) bits.push('Date : '+dayLabel(before.date)+' → '+dayLabel(row.date));
    if(before.departure!==row.departure && hour(row.departure)) bits.push('Départ : '+(hour(before.departure) ? hour(before.departure)+' → ' : '')+hour(row.departure));
    if(before.meeting!==row.meeting && hour(row.meeting)) bits.push('Rendez-vous : '+(hour(before.meeting) ? hour(before.meeting)+' → ' : '')+hour(row.meeting));
    if(!bits.length) bits.push('Départ : '+(hour(row.departure) || 'horaire à confirmer'));
    return bits.join(' · ');
  }
  function render(rows) {
    root.innerHTML=rows.map(function(row) {
      var cancelled=row.kind==='cancelled';
      var when=dayLabel(row.date);
      return '<article class="home-priority-alert '+(cancelled?'home-priority-alert--cancelled':'home-priority-alert--schedule')+'">'+
        '<div class="home-priority-alert__icon" aria-hidden="true">!</div><div class="home-priority-alert__body">'+
        '<p class="home-priority-alert__label">INFORMATION IMPORTANTE · '+text(when)+'</p>'+
        '<h2>'+(cancelled?'Sortie annulée':row.kind==='information'?'Information importante':'Horaire ou date modifiés')+' — '+text(row.title || 'Sortie GoëloRides')+'</h2>'+
        '<p>'+text(cancelled ? 'Ne te rends pas au départ prévu'+(hour(row.departure)?' à '+hour(row.departure):'')+'.' : changes(row))+'</p>'+
        (row.message ? '<p class="home-priority-alert__message">'+text(row.message)+'</p>' : '')+
        (row.group || row.place ? '<p class="home-priority-alert__meta">'+text([row.group,row.place].filter(Boolean).join(' · '))+'</p>' : '')+
        '</div><a class="home-priority-alert__link" href="parcours.html?id='+encodeURIComponent(row.route_id)+'">Voir les informations →</a></article>';
    }).join('');
    root.hidden=!rows.length;
    document.documentElement.classList.toggle('has-priority-alerts',!!rows.length);
  }
  async function refresh() {
    if(document.hidden) return;
    var ticket=++requestId;
    var sb=window.goeloGetSb && window.goeloGetSb();
    if(!sb) return;
    var timeout;
    try {
      var result=await Promise.race([sb.rpc('home_priority_alerts'),new Promise(function(_,reject){timeout=setTimeout(function(){reject(new Error('timeout'));},10000);})]);
      if(ticket!==requestId) return;
      if(result.error || !Array.isArray(result.data)) throw new Error('alerts_unavailable');
      render(result.data);
    } catch(error) {
      console.warn('[home-priority-alerts] Actualisation impossible');
      // Une alerte connue ne disparaît pas silencieusement sur une panne réseau.
      if(root.children.length && !root.querySelector('.home-priority-alert__stale')) {
        var notice=document.createElement('p');notice.className='home-priority-alert__stale';notice.textContent='Informations non actualisées. Consulte la fiche de la sortie pour vérifier les dernières nouvelles.';root.appendChild(notice);
      }
    } finally {clearTimeout(timeout);}
  }
  function init() {
    root=document.getElementById('home-priority-alerts');if(!root) return;
    refresh();timer=setInterval(refresh,60000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
    window.addEventListener('pageshow',function(event){if(event.persisted)refresh();});
    window.addEventListener('online',refresh);
    window.addEventListener('pagehide',function(){clearInterval(timer);});
    window.addEventListener('pageshow',function(event){if(event.persisted)timer=setInterval(refresh,60000);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
