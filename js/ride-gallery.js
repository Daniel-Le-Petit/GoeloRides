(function(){
 'use strict';
  function trackResult(feature, outcome) { try { if (window.GoeloFeatureTracking) window.GoeloFeatureTracking.record(feature, outcome); } catch (_) {} }

 var host=document.getElementById('gallery'),status=document.getElementById('gallery-status'),empty=document.getElementById('empty'),retry=document.getElementById('gallery-retry');
 var viewer=document.getElementById('photo-viewer'),photos=[],index=0,albumTitle='';
 function node(tag,cls,value){var n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n;}
 function safePhoto(url){try{var u=new URL(url,location.href),base=new URL(window.GOELO_CONFIG.SUPABASE_URL);return u.origin===base.origin&&u.pathname.startsWith('/storage/v1/object/public/ride-photos/');}catch(_){return false;}}
 function show(){var image=document.getElementById('photo-large');image.src=photos[index];image.alt=albumTitle+' — photo '+(index+1);document.getElementById('photo-caption').textContent=albumTitle+' · '+(index+1)+' / '+photos.length;document.getElementById('photo-prev').disabled=photos.length<2;document.getElementById('photo-next').disabled=photos.length<2;}
 function open(items,i,title){photos=items;index=i;albumTitle=title;show();viewer.showModal();}
 document.getElementById('photo-close').onclick=function(){viewer.close();};
 document.getElementById('photo-prev').onclick=function(){index=(index+photos.length-1)%photos.length;show();};
 document.getElementById('photo-next').onclick=function(){index=(index+1)%photos.length;show();};
 viewer.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')document.getElementById('photo-prev').click();if(e.key==='ArrowRight')document.getElementById('photo-next').click();});
 function draw(rows){host.replaceChildren();rows.forEach(function(a){
  var items=(Array.isArray(a.photos)?a.photos:[]).filter(safePhoto);if(!items.length)return;
  var card=node('article','card'),cover=node('button','cover');cover.type='button';cover.setAttribute('aria-label','Ouvrir les photos : '+a.title);
  var image=node('img');image.src=items[0];image.alt=a.title;image.loading='lazy';cover.append(image);cover.onclick=function(){open(items,0,a.title);};
  var body=node('div','card-body');body.append(node('div','meta',new Date(a.ride_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})+' · '+items.length+' photo'+(items.length>1?'s':'')),node('h3','',a.title));if(a.description)body.append(node('p','',a.description));
  var links=node('div','links');if(/^https:\/\/(www\.)?facebook\.com\//.test(a.facebook_url||'')){var link=node('a','','Publication Facebook →');link.href=a.facebook_url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}body.append(links);
  var thumbs=node('div','photos');items.slice(1,4).forEach(function(url,i){var b=node('button');b.type='button';b.setAttribute('aria-label','Voir la photo '+(i+2)+' : '+a.title);var im=node('img');im.src=url;im.alt='';im.loading='lazy';b.append(im);b.onclick=function(){open(items,i+1,a.title);};thumbs.append(b);});card.append(cover,body,thumbs);host.append(card);
 });empty.hidden=host.childElementCount>0;}
 async function load(){status.textContent='Chargement des albums…';retry.hidden=true;empty.hidden=true;var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000);try{var c=window.GOELO_CONFIG;var r=await fetch(c.SUPABASE_URL+'/rest/v1/ride_albums?select=id,title,ride_date,description,photos,facebook_url&published=eq.true&order=ride_date.desc',{headers:{apikey:c.SUPABASE_ANON_KEY,Authorization:'Bearer '+c.SUPABASE_ANON_KEY},signal:controller.signal});if(!r.ok)throw Error('unavailable');var data=await r.json();if(!Array.isArray(data))throw Error('format');draw(data);status.textContent='';}catch(_){trackResult('album','error');status.textContent='Les albums ne sont pas disponibles pour le moment.';retry.hidden=false;}finally{clearTimeout(timer);}}
 retry.onclick=load;load();
})();
