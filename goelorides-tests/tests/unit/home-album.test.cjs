const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(root,'js/home-album.js'),'utf8');
const BASE='https://iqxyiwnjwcepfgngkzsm.supabase.co',photo=n=>BASE+'/storage/v1/object/public/ride-photos/test/'+n+'.jpg';
class Element{
 constructor(){this.children=[];this.hidden=true;this.dataset={};this.attributes={};this.events={};this.parentNode=null;}
 append(...items){for(const item of items){this.children.push(item);item.parentNode=this;}}
 replaceChildren(){this.children.forEach(item=>item.parentNode=null);this.children=[];}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.events[k]=fn;}
 remove(){if(this.parentNode){const parent=this.parentNode;parent.children=parent.children.filter(x=>x!==this);this.parentNode=null;}}
 get childElementCount(){return this.children.length;}
}
function app(rows,options={}){
 const section=new Element(),grid=new Element(),requests=[];
 const c={URL,AbortController,setTimeout,clearTimeout,GOELO_CONFIG:{SUPABASE_URL:BASE,SUPABASE_ANON_KEY:'public-test'},document:{readyState:'loading',addEventListener(){},getElementById:id=>id==='gr-home-album'?section:grid,createElement:()=>new Element()},fetch:async(url,args)=>{requests.push({url,args});if(options.network)throw Error('offline');return {ok:!options.error,json:async()=>rows}}};c.window=c;vm.createContext(c);vm.runInContext(source,c);return {c,section,grid,requests};
}
test('trois photos maximum, albums différents privilégiés et doublons normalisés écartés',()=>{
 const a=app([]),result=a.c.GoeloHomeAlbum.selectPhotos([{id:'one',title:'Une',published:true,photos:[photo(1),photo(2)]},{id:'two',title:'Deux',published:true,photos:[photo(1)+'?token=ignored',photo(3)]},{id:'three',published:true,photos:[photo(4)]}],BASE);
 assert.equal(result.length,3);assert.deepEqual(Array.from(result,x=>x.url),[photo(1),photo(3),photo(4)]);
});
test('les brouillons, URL externes et autres espaces de stockage ne sont jamais utilisés',()=>{
 const a=app([]),result=a.c.GoeloHomeAlbum.selectPhotos([{id:'draft',published:false,photos:[photo(1)]},{id:'invalid',published:true,photos:['javascript:alert(1)','https://evil.test/photo.jpg',BASE+'/storage/v1/object/public/private/image.jpg',BASE.replace('https://','https://name:password@')+'/storage/v1/object/public/ride-photos/p.jpg']},{id:'valid',published:true,photos:[photo(2)]}],BASE);
 assert.equal(result.length,1);assert.equal(result[0].albumId,'valid');
});
test('rendu limité aux albums publiés avec liens vers leur album et titres en texte',async()=>{
 const a=app([{id:'one',title:'<img src=x onerror=alert(1)>',published:true,photos:[photo(1),photo(2)]}]);await a.c.GoeloHomeAlbum.load();assert.equal(a.section.hidden,false);assert.equal(a.grid.childElementCount,2);assert.equal(a.grid.children[0].href,'dans-la-roue.html#album-one');assert.equal(a.grid.children[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(a.grid.children[0].children.length,2);assert.equal(a.grid.children[0].children[0].loading,'lazy');assert(a.requests[0].url.includes('published=eq.true'));assert(a.requests[0].url.includes('limit=6'));
});
test('section masquée sans photos, en cas de panne et si toutes les images sont indisponibles',async()=>{
 for(const [rows,options] of [[[],{}],[{unexpected:true},{}],[[],{error:true}],[[],{network:true}]]){const a=app(rows,options);await a.c.GoeloHomeAlbum.load();assert.equal(a.section.hidden,true);}
 const a=app([{id:'one',published:true,photos:[photo(1)]}]);await a.c.GoeloHomeAlbum.load();a.grid.children[0].children[0].events.error();assert.equal(a.grid.childElementCount,0);assert.equal(a.section.hidden,true);
});
test('le bloc vient après les sorties et propose un accès direct à celles-ci',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.indexOf('id="gr-upcoming-rides"')<html.indexOf('id="gr-home-album"'));assert(html.indexOf('id="gr-home-album"')<html.indexOf('<aside class="gr-hero-poll"'));assert.match(html,/<a href="sorties.html" data-home-album-rides>Les sorties/);
});
