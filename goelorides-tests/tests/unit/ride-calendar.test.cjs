const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(root,'js/goelo-calendar.js'),'utf8');
function setup(){
 const host={hidden:true},link={removeAttribute(name){delete this[name]}},created=[],revoked=[];
 class TestURL extends URL {}
 TestURL.createObjectURL=blob=>{created.push(blob);return 'blob:calendar-'+created.length};
 TestURL.revokeObjectURL=url=>revoked.push(url);
 const c={window:{location:{origin:'https://goelorides.onrender.com'}},document:{getElementById:id=>id==='pd-calendar'?host:link},Intl,Date,TextEncoder,URL:TestURL,Blob};vm.createContext(c);vm.runInContext(source,c);
 return {api:c.window.GoeloCalendar,host,link,created,revoked};
}
const now=new Date('2026-11-03T00:00:00Z'),route={id:'r1',date:'2027-04-13',meetTime:'08:30',startTime:'09:00',title:'Tour du Goëlo',place:'Esplanade du casino',city:'Saint-Quay-Portrieux'};
test('heure de Paris : rendez-vous en été et en hiver, sans utiliser le fuseau de l’appareil',()=>{
 const {api}=setup();
 const summer=api.build(route,'https://goelorides.onrender.com/',now);
 assert.match(summer,/DTSTART:20270413T063000Z/);assert.match(summer,/Départ à vélo : 09:00/);
 assert.match(api.build({...route,date:'2027-01-13'},'https://example.test/',now),/DTSTART:20270113T073000Z/);
 assert.match(summer,/LOCATION:Esplanade du casino\\, Saint-Quay-Portrieux/);
 assert.match(summer,/URL:https:\/\/goelorides.onrender.com\/parcours.html\?id=r1/);
});
test('pas de date inventée : invalide, passée, annulée ou heure inexistante au changement d’heure',()=>{
 const {api}=setup();
 for(const changes of [{date:''},{date:'2027-02-30'},{date:'2027-13-01'},{meetTime:'25:00'},{meetTime:'',startTime:'',rideTime:''},{date:'2025-04-13'},{status:'cancelled'},{date:'2027-03-28',meetTime:'02:30'}])
   assert.equal(api.build({...route,...changes},'https://example.test/',now),null,JSON.stringify(changes));
 assert.match(api.build({...route,meetTime:''},'https://example.test/',now),/DTSTART:20270413T070000Z/);
});
test('format ICS : accents, limites de 75 octets et aucune propriété injectée par le titre',()=>{
 const {api}=setup();
 const text=api.build({...route,id:'r1&x=1',title:'É'.repeat(100)+'\r\nBEGIN:EVIL,;\\'},'https://example.test/',now);
 assert(text.startsWith('BEGIN:VCALENDAR\r\n'));assert(text.endsWith('END:VCALENDAR\r\n'));
 for(const line of text.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 const unfolded=text.replace(/\r\n /g,'');
 assert.match(unfolded,/\\nBEGIN:EVIL\\,\\;\\\\/);
 assert.equal(text.split('\r\n').filter(l=>l==='BEGIN:EVIL').length,0);
 assert.match(unfolded,/id=r1%26x%3D1/);
 assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,1);
});
test('lien de téléchargement public, nettoyage du fichier précédent, repli si date absente',async()=>{
 const a=setup();a.api.render(route);assert.equal(a.host.hidden,false);assert.equal(a.link.download,'goelorides-r1.ics');assert.equal(a.created[0].type,'text/calendar;charset=utf-8');
 assert.match(await a.created[0].text(),/DTSTART:20270413T063000Z/);
 a.api.render({...route,date:''});assert.equal(a.host.hidden,true);assert.equal(a.link.href,undefined);assert.deepEqual(a.revoked,['blob:calendar-1']);
});
test('action secondaire près de la participation et script chargé avant le rendu de sortie',()=>{
 const html=fs.readFileSync(path.join(root,'parcours.html'),'utf8');
 assert(html.indexOf('id="pd-calendar"')>html.indexOf('id="pd-metrics"'));
 assert(html.indexOf('js/goelo-calendar.js')<html.indexOf('js/parcours.js'));
 assert.match(html,/Agenda non synchronisé/);
});
