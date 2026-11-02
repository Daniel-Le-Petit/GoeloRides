/** Serveur uniquement : aucun secret ni contenu des notifications dans les journaux. */
const { execFileSync } = require('node:child_process');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
const APP_ID = '254cc8a4-2d9d-4bc9-9e82-2f91b3bd437a';
function payload(item, appId = APP_ID) {
  if (!UUID.test(item.delivery_id) || !UUID.test(item.subscription_id) || !UUID.test(appId)) throw Error('invalid_delivery');
  const n = item.notification;
  if (!n || !['joined','left'].includes(n.action) || !n.route_id) throw Error('invalid_notification');
  const verb = n.action === 'joined' ? 'participe à' : 's’est désinscrit·e de';
  const count = Number.isInteger(n.participant_count) && n.participant_count >= 0 ? n.participant_count : 0;
  const message = String(n.participant_name || 'Un cycliste').slice(0,100) + ' ' + verb + ' « ' + String(n.route_title || 'la sortie').slice(0,150) + ' » — ' + count + ' participant' + (count===1?'':'s') + '.';
  return { app_id:appId, include_subscription_ids:[item.subscription_id], target_channel:'push',
    headings:{fr:n.action==='joined'?'Nouvelle participation':'Désinscription',en:n.action==='joined'?'Nouvelle participation':'Désinscription'},
    contents:{fr:message,en:message}, url:'https://goelorides.onrender.com/parcours.html?id='+encodeURIComponent(n.route_id),
    idempotency_key:item.delivery_id, data:{type:'admin_participation',notification_id:n.id} };
}
async function dispatch({ sql, fetchImpl = fetch, apiKey, appId = APP_ID }) {
  if (!apiKey) {
    sql("UPDATE public.admin_participation_push_status SET configured=false,checked_at=now(),problem='missing_key' WHERE singleton;");
    return {configured:false,sent:0,failed:0};
  }
  if (!UUID.test(appId)) throw Error('invalid_app_id');
  sql("UPDATE public.admin_participation_push_status SET configured=true,checked_at=now(),problem=NULL WHERE singleton;");
  let sent=0,failed=0;
  for(let batch=0;batch<5;batch++) {
    const items=JSON.parse(sql('SELECT public.admin_participation_push_claim(10);') || '[]');
    if(!items.length)break;
    for(const item of items) {
      let body;
      try { body=payload(item,appId); } catch(_) { throw Error('invalid_queued_message'); }
      // Recontrôle juste avant l'envoi : compte toujours admin, abonnement actif, notification non lue.
      const permitted=sql(`SELECT EXISTS(SELECT 1 FROM public.admin_participation_deliveries d JOIN public.admin_participation_devices v ON v.subscription_id=d.subscription_id AND v.user_id=d.user_id JOIN public.profiles p ON p.id=d.user_id WHERE d.id=${quote(item.delivery_id)}::uuid AND d.status='processing' AND v.enabled AND p.role='admin' AND NOT EXISTS(SELECT 1 FROM public.admin_participation_reads r WHERE r.user_id=d.user_id AND r.notification_id=d.notification_id));`);
      if(permitted!=='t') { sql(`UPDATE public.admin_participation_deliveries SET status='skipped',last_error='recipient_inactive_or_read' WHERE id=${quote(item.delivery_id)}::uuid AND status='processing';`);continue; }
      let error='',permanent=false;
      try {
        const response=await fetchImpl('https://api.onesignal.com/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Key '+apiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
        if(!response.ok) { error='http_'+response.status; permanent=response.status>=400&&response.status<500&&![401,403,408,429].includes(response.status); }
        else { const result=await response.json(); if(!result || !UUID.test(result.id || '') || result.recipients===0) { error='no_recipient';permanent=true; } }
      } catch(_) { error='network_or_invalid_response'; }
      if(!error) {
        sql(`UPDATE public.admin_participation_deliveries SET status='sent',sent_at=now(),lease_until=NULL,last_error=NULL WHERE id=${quote(item.delivery_id)}::uuid AND status='processing'; UPDATE public.admin_participation_push_status SET last_sent_at=now(),checked_at=now(),configured=true,problem=NULL WHERE singleton;`);sent++;
      } else {
        const retry=!permanent&&item.attempts<5;
        const delay=[1,5,15,30,60][Math.min(Math.max(Number(item.attempts)-1,0),4)];
        sql(`UPDATE public.admin_participation_deliveries SET status=${quote(retry?'pending':'failed')},lease_until=NULL,last_error=${quote(error)},next_attempt_at=now()+make_interval(mins=>${delay}) WHERE id=${quote(item.delivery_id)}::uuid AND status='processing';`);failed++;
        if(['http_401','http_403'].includes(error)) {
          sql(`UPDATE public.admin_participation_deliveries SET status='pending',attempts=greatest(attempts-1,0),next_attempt_at=now()+interval '15 minutes' WHERE id=${quote(item.delivery_id)}::uuid;`);
          const remaining=items.filter(other=>other.delivery_id!==item.delivery_id&&UUID.test(other.delivery_id)).map(other=>quote(other.delivery_id)+'::uuid');
          if(remaining.length)sql(`UPDATE public.admin_participation_deliveries SET status='pending',attempts=greatest(attempts-1,0),lease_until=NULL,next_attempt_at=now()+interval '15 minutes' WHERE status='processing' AND id IN (${remaining.join(',')});`);
          sql(`UPDATE public.admin_participation_push_status SET configured=false,checked_at=now(),problem='provider_authorization' WHERE singleton;`);
          return {configured:false,sent,failed};
        }
      }
    }
  }
  return {configured:true,sent,failed};
}
function databaseSql(statement) {
  if (!process.env.SUPABASE_DATABASE_URL) throw Error('database_not_configured');
  try {
    return execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','--dbname',process.env.SUPABASE_DATABASE_URL],{input:statement,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe'],env:{...process.env,PGCONNECT_TIMEOUT:'15'}}).trim();
  } catch(error) { throw Error(error.code==='ENOENT'?'postgres_client_missing':error.status===2?'database_connection_failed':'database_operation_failed'); }
}
if(require.main===module)dispatch({sql:databaseSql,apiKey:process.env.ONESIGNAL_REST_API_KEY,appId:process.env.ONESIGNAL_APP_ID||APP_ID})
 .then(result=>console.log(result.configured?'Push administrateur : '+result.sent+' envoi(s) accepté(s), '+result.failed+' échec(s).':'Push administrateur non configuré : vérifier ONESIGNAL_REST_API_KEY dans les secrets GitHub. Les alertes du Dashboard restent disponibles.'))
 .catch(error=>{const known=['database_not_configured','postgres_client_missing','database_connection_failed','database_operation_failed','invalid_app_id','invalid_queued_message'];console.error('Traitement des alertes interrompu ('+(known.includes(error.message)?error.message:'unconfirmed')+'). Vérifier la configuration serveur ; aucun secret n’est affiché.');process.exitCode=1;});
module.exports={payload,dispatch};
