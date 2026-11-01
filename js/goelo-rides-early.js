/* Démarrage intégré aux pages : ne dépend ni d'un SDK, ni d'un autre module. */
(function () {
  'use strict';
  var home = document.getElementById('gr-upcoming-rides');
  var host = home || document.getElementById('sorties-list');
  if (!host) return;
  var name = home ? 'routes_upcoming_homepage' : 'routes_list';
  var payload = home ? { p_limit: 3 } : { p_filter: {} };
  var subtitle = home && document.getElementById('gr-upcoming-sub');
  var requestNumber = 0;
  function escape(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function today() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()), values={};
      parts.forEach(function(p){values[p.type]=p.value;});return values.year+'-'+values.month+'-'+values.day;
    } catch (_) { var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  }
  function completeViewExists() { return !!host.querySelector('.go-sc-card,.home-upcoming-card'); }
  function failed() {
    host.setAttribute('aria-busy','false');
    if (completeViewExists()) return;
    if(subtitle)subtitle.textContent='Les sorties ne sont pas disponibles pour le moment.';
    host.innerHTML='<div class="early-rides-error" role="alert"><p>Impossible de charger les sorties.</p><button type="button">Réessayer</button><a href="sorties.html">Ouvrir le calendrier →</a></div>';
    host.querySelector('button').addEventListener('click',load);
  }
  function draw(data) {
    host.setAttribute('aria-busy','false');
    if (completeViewExists()) return;
    if(!Array.isArray(data))throw Error('invalid_public_response');
    var day=today();
    var rows=data.map(function(row){
      var fc=row.front_config||row;
      if(typeof fc==='string'){try{fc=JSON.parse(fc);}catch(_){fc={};}}
      return {id:row.id,title:row.track_name||row.title||'Sortie GoëloRides',group:row.group_label||'',date:fc.rideDateIso||'',time:fc.meetTime||fc.rideTime||'',place:fc.meetPlace||fc.meet_place||'',visibility:fc.visibility||'public',status:fc.sortieStatus||'open',active:row.is_active!==false,stats:fc.stats||{},imageUrl:fc.thumbSrc||fc.coverImageUrl||'',type:fc.raceType||'route'};
    }).filter(function(row){return row.active && row.visibility==='public' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date>=day && !/^(draft|brouillon)$/.test(row.status);});
    rows.sort(function(a,b){return (a.date+' '+a.time).localeCompare(b.date+' '+b.time);});
    if(home)rows=rows.slice(0,3);
    host.setAttribute('aria-busy','false');
    if(subtitle)subtitle.textContent=rows.length ? rows.length+' sortie'+(rows.length>1?'s':'')+' à venir' : 'Aucune sortie programmée pour le moment';
    if(!rows.length){host.innerHTML='<p class="early-rides-empty">Aucune sortie à venir pour le moment.</p>';return;}
    if(home && window.GoeloSortieCards) {
      window.GoeloSortieCards.renderList(rows.map(function(row){
        return {id:row.id,title:row.title,group:row.group,groupKey:window.GoeloSortieCards.groupKeyFromLabel(row.group),date:new Date(row.date+'T12:00:00'),meetTime:row.time,place:row.place,status:row.status,type:row.type,imageUrl:row.imageUrl,km:row.stats.totalKm,dplus:row.stats.elevGainM,participants:[]};
      }),host,{viewMode:'home',groupDots:true});
      return;
    }
    host.innerHTML='<div class="early-rides-list">'+rows.map(function(row){
      var date;
      try{date=new Date(row.date+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});}catch(_){date=row.date;}
      var cancelled=/^(cancelled|canceled|annulee|annulée)$/.test(row.status);
      return '<article class="early-ride-card"><p class="early-ride-card__date">'+escape(date)+(row.time?' · '+escape(row.time):'')+'</p><h3>'+escape(row.title)+'</h3><p>'+escape([row.group,row.place].filter(Boolean).join(' · '))+'</p>'+(cancelled?'<strong class="early-ride-card__cancelled">Sortie annulée</strong>':'')+'<a href="parcours.html?id='+encodeURIComponent(row.id)+'">Voir la sortie →</a></article>';
    }).join('')+'</div>';
  }
  function read() {
    return new Promise(function(resolve,reject){
      var config=window.GOELO_CONFIG||{};
      if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY){reject(Error('missing_config'));return;}
      var xhr=new XMLHttpRequest();
      xhr.open('POST',config.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/rpc/'+name,true);
      xhr.timeout=12000;xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('apikey',config.SUPABASE_ANON_KEY);xhr.setRequestHeader('Authorization','Bearer '+config.SUPABASE_ANON_KEY);
      xhr.onload=function(){try{if(xhr.status<200||xhr.status>=300)throw Error('read_failed');resolve(JSON.parse(xhr.responseText));}catch(error){reject(error);}};
      xhr.onerror=xhr.ontimeout=xhr.onabort=function(){reject(Error('read_unavailable'));};
      xhr.send(JSON.stringify(payload));
    });
  }
  function load() {
    var ticket=++requestNumber;
    if(subtitle)subtitle.textContent='Recherche des sorties…';
    host.setAttribute('aria-busy','true');
    var work=read();
    window.GoeloInitialPublicReads=window.GoeloInitialPublicReads||{};
    window.GoeloInitialPublicReads[name]=work;
    work.then(function(rows){if(ticket===requestNumber){try{draw(rows);}catch(_){failed();}}},function(){
      if(window.GoeloInitialPublicReads[name]===work)delete window.GoeloInitialPublicReads[name];
      if(ticket===requestNumber)failed();
    });
  }
  load();
})();
