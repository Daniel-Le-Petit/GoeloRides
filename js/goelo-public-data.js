/** Lecture publique sans session : un renouvellement de connexion ne bloque pas les sorties. */
(function(global){
  'use strict';
  async function rpc(name,payload){
    var config=global.GOELO_CONFIG||{};
    if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY)throw Error('public_config_missing');
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000);
    try{
      var response=await fetch(config.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/rpc/'+encodeURIComponent(name),{
        method:'POST',headers:{'Content-Type':'application/json',apikey:config.SUPABASE_ANON_KEY,Authorization:'Bearer '+config.SUPABASE_ANON_KEY},
        body:JSON.stringify(payload||{}),signal:controller.signal,credentials:'omit'
      });
      var data=await response.json();
      if(!response.ok){var error=Error('public_data_unavailable');error.code=data&&data.code;throw error;}
      return data;
    }finally{clearTimeout(timer);}
  }
  function deadline(work){var timer;return Promise.race([Promise.resolve(work),new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('data_timeout'));},12000);})]).finally(function(){clearTimeout(timer);});}
  global.GoeloPublicData={rpc:rpc,deadline:deadline};
})(window);
