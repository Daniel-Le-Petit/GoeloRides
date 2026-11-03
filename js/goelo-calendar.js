/** Export calendrier public : rendez-vous en heure de Paris, sans inscription. */
(function (global) {
  'use strict';
  function parts(date) {
    var values = {};
    new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
      .formatToParts(date).forEach(function(p){if(p.type!=='literal')values[p.type]=p.value;});
    return [values.year,values.month,values.day,values.hour,values.minute,values.second].join('');
  }
  function start(route) {
    var date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(route.date || '').trim());
    var time = /^(\d{1,2})[:h](\d{2})(?::00)?$/.exec(String(route.meetTime || route.startTime || route.rideTime || '').trim());
    if (!date || !time || +date[1]<2000 || +time[1]>23 || +time[2]>59) return null;
    var civil=Date.UTC(+date[1],+date[2]-1,+date[3],+time[1],+time[2]), candidate=civil;
    var expected=date[1]+date[2]+date[3]+time[1].padStart(2,'0')+time[2]+'00';
    for(var i=0;i<3;i++){
      var p=parts(new Date(candidate));
      var observed=Date.UTC(+p.slice(0,4),+p.slice(4,6)-1,+p.slice(6,8),+p.slice(8,10),+p.slice(10,12));
      candidate+=civil-observed;
    }
    return parts(new Date(candidate))===expected ? new Date(candidate) : null;
  }
  function escape(value) {
    return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
      .replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  }
  function stamp(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
  function fold(line) {
    var result='',bytes=0,encoder=new TextEncoder();
    for(var char of line){var size=encoder.encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1;}result+=char;bytes+=size;}
    return result;
  }
  function build(route, origin, now) {
    if(!route || !route.id || route.status==='cancelled' || route.status==='annulee')return null;
    var when=start(route);now=now || new Date();
    if(!when || when.getTime()<=now.getTime())return null;
    var url=new URL('parcours.html',origin);url.searchParams.set('id',String(route.id));
    var description='Rendez-vous GoëloRides. Consulte la fiche avant le départ pour les mises à jour : '+url.href;
    if(route.startTime || route.rideTime)description+='\nDépart à vélo : '+(route.startTime || route.rideTime);
    var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GoeloRides//Sorties//FR','CALSCALE:GREGORIAN',
      'BEGIN:VEVENT','UID:'+encodeURIComponent(route.id)+'@goelorides','DTSTAMP:'+stamp(now),
      'DTSTART:'+stamp(when),'SUMMARY:'+escape(route.title || 'Sortie GoëloRides'),
      'LOCATION:'+escape([route.place,route.city].filter(Boolean).join(', ')),
      'DESCRIPTION:'+escape(description),'URL:'+url.href,'END:VEVENT','END:VCALENDAR'];
    return lines.map(fold).join('\r\n')+'\r\n';
  }
  var previousUrl=null;
  function render(route) {
    var host=document.getElementById('pd-calendar'),link=document.getElementById('pd-calendar-link');
    if(!host || !link)return;
    host.hidden=true;link.removeAttribute('href');
    if(previousUrl){URL.revokeObjectURL(previousUrl);previousUrl=null;}
    try {
      var text=build(route,global.location.origin+'/');
      if(!text)return;
      previousUrl=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));
      link.href=previousUrl;link.download='goelorides-'+String(route.id).replace(/[^a-z0-9_-]/gi,'_')+'.ics';
      host.hidden=false;
    } catch(_){ /* La fiche et la participation restent disponibles si l’export ne l’est pas. */ }
  }
  global.GoeloCalendar={build:build,render:render};
})(window);
