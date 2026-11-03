/** Aperçu léger des albums publics, sans attendre le chargement des sorties. */
(function(global){
 'use strict';
 function safePhoto(raw,base){
  try{var url=new URL(raw),origin=new URL(base);if(url.protocol!=='https:'||url.origin!==origin.origin||url.username||url.password||!url.pathname.startsWith('/storage/v1/object/public/ride-photos/'))return null;url.search='';url.hash='';return url.href;}catch(_){return null;}
 }
 function selectPhotos(albums,base){
  var used=new Set(),photos=[],remaining=[];
  (Array.isArray(albums)?albums:[]).forEach(function(album){
   if(!album||album.published!==true||!album.id||!Array.isArray(album.photos))return;
   var items=album.photos.map(function(raw){return safePhoto(raw,base);}).filter(Boolean);
   var first=true;
   items.forEach(function(url){if(used.has(url))return;used.add(url);var photo={url:url,albumId:String(album.id),title:String(album.title||'Une sortie GoëloRides')};if(first){photos.push(photo);first=false;}else remaining.push(photo);});
  });
  return photos.concat(remaining).slice(0,3);
 }
 async function load(){
  var section=document.getElementById('gr-home-album'),grid=document.getElementById('gr-home-album-photos'),c=global.GOELO_CONFIG;
  if(!section||!grid||!c)return;
  section.hidden=true;
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
  try{
   var response=await global.fetch(c.SUPABASE_URL+'/rest/v1/ride_albums?select=id,title,ride_date,photos,published&published=eq.true&order=ride_date.desc,id.desc&limit=6',{headers:{apikey:c.SUPABASE_ANON_KEY,Authorization:'Bearer '+c.SUPABASE_ANON_KEY},signal:controller.signal});
   if(!response.ok)throw Error('unavailable');var data=await response.json();if(!Array.isArray(data))throw Error('format');
   var photos=selectPhotos(data,c.SUPABASE_URL);grid.replaceChildren();
   function update(){grid.dataset.photoCount=String(grid.childElementCount);section.hidden=grid.childElementCount===0;}
   photos.forEach(function(photo){
    var link=document.createElement('a'),image=document.createElement('img'),caption=document.createElement('span');
    link.className='gr-home-album__photo';link.href='dans-la-roue.html#album-'+encodeURIComponent(photo.albumId);link.setAttribute('data-home-album-photo','');link.setAttribute('aria-label','Voir l’album : '+photo.title);
    image.src=photo.url;image.alt='';image.loading='lazy';image.decoding='async';image.width=480;image.height=320;
    caption.className='gr-home-album__caption';caption.textContent=photo.title;
    image.addEventListener('error',function(){link.remove();update();});link.append(image,caption);grid.append(link);
   });update();
  }catch(_){section.hidden=true;}finally{clearTimeout(timer);}
 }
 global.GoeloHomeAlbum={selectPhotos:selectPhotos,load:load};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})(window);
