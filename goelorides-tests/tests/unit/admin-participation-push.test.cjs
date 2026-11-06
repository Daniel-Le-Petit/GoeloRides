const test=require('node:test'),assert=require('node:assert/strict');
const {payload,dispatch}=require('../../../scripts/admin-participation-push.cjs');
const item={delivery_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',subscription_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',attempts:1,notification:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',route_id:'r /x',route_title:'Boucle du Goëlo',participant_name:'Camille',participant_count:3,action:'joined'}};
function mock(options={}){const queries=[],requests=[];let batches=0;return {queries,requests,sql:s=>{queries.push(s);if(s.includes('push_claim'))return JSON.stringify(++batches===1?[item]:[]);if(s.startsWith('SELECT EXISTS'))return options.inactive?'f':'t';return ''},fetchImpl:async(url,args)=>{requests.push({url,args});if(options.network)throw Error('timeout');return {ok:!options.status,status:options.status||200,json:async()=>({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',...options.body})}}};}
test('message privé, destination fiable et clé d’idempotence persistante',()=>{const body=payload(item);assert.deepEqual(body.include_subscription_ids,[item.subscription_id]);assert(!body.included_segments);assert(!body.filters);assert.equal(body.idempotency_key,item.delivery_id);assert.match(body.contents.fr,/Camille participe.*3 participants/);assert.equal(body.url,'https://goelorides.onrender.com/parcours.html?id=r%20%2Fx');assert.match(payload({...item,notification:{...item.notification,action:'left'}}).contents.fr,/désinscrit/);});
test('aucun appel de push ni réservation sans clé configurée',async()=>{const m=mock();assert.equal((await dispatch(m)).configured,false);assert.equal(m.requests.length,0);assert(!m.queries.some(s=>s.includes('push_claim')));assert(m.queries.some(s=>s.includes('missing_key')));});
test('seule une réponse fournisseur positive confirme l’envoi',async()=>{const m=mock();const result=await dispatch({...m,apiKey:'private-test-key'});assert.equal(result.sent,1);assert(m.queries.some(s=>s.includes("status='sent'")));assert(!m.queries.join('').includes('private-test-key'));assert.equal(JSON.parse(m.requests[0].args.body).idempotency_key,item.delivery_id);});
test('une panne ou un quota prépare une reprise sans annoncer envoyé',async()=>{for(const options of [{network:true},{status:429}]){const m=mock(options),result=await dispatch({...m,apiKey:'key'});assert.equal(result.sent,0);assert(m.queries.some(s=>s.includes("status='pending'")));assert(!m.queries.some(s=>s.includes("status='sent'")));}});
test('révocation, abonnement désactivé ou notification lue empêchent l’envoi',async()=>{const m=mock({inactive:true});const result=await dispatch({...m,apiKey:'key'});assert.equal(result.sent,0);assert.equal(m.requests.length,0);assert(m.queries.some(s=>s.includes("status='skipped'")));});
test('clé refusée et absence de destinataire ne produisent pas de faux succès',async()=>{const m=mock({status:401});assert.equal((await dispatch({...m,apiKey:'key'})).configured,false);assert(m.queries.some(s=>s.includes('provider_authorization')));const n=mock({body:{id:null,recipients:0}});assert.equal((await dispatch({...n,apiKey:'key'})).sent,0);assert(n.queries.some(s=>s.includes('no_recipient')));});

test('un refus de clé restitue les messages du lot non tentés sans consommer leurs essais',async()=>{
 const m=mock({status:401}),other={...item,delivery_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};let batches=0;const sql=s=>{m.queries.push(s);if(s.includes('push_claim'))return JSON.stringify(++batches===1?[item,other]:[]);if(s.startsWith('SELECT EXISTS'))return 't';return '';};
 await dispatch({...m,sql,apiKey:'key'});assert.equal(m.requests.length,1);assert(m.queries.some(s=>s.includes('attempts=greatest(attempts-1,0)')&&s.includes(other.delivery_id)));
});

test('participant et invité reçoivent une confirmation, les organisateurs une nouvelle participation',()=>{
 for(const recipient_kind of ['participant','guest']){
  const body=payload({...item,recipient_kind});
  assert.equal(body.headings.fr,'Inscription confirmée');
  assert.match(body.contents.fr,/Ton inscription.*est confirmée/);
  assert.equal(body.data.type,'participation_confirmed');
  assert.equal(body.idempotency_key,item.delivery_id);
 }
 for(const recipient_kind of ['admin','leader'])assert.match(payload({...item,recipient_kind}).contents.fr,/Camille participe/);
 assert.equal(payload({...item,recipient_kind:'participant',notification:{...item.notification,action:'left'}}).headings.fr,'Désinscription');
});
test('aucun message de publication de sortie ne peut entrer dans cet envoi',()=>{
 assert.throws(()=>payload({...item,notification:{...item.notification,action:'published'}}),/invalid_notification/);
});
test('le contrôle avant envoi utilise la même autorisation serveur que la réservation',async()=>{
 const m=mock();await dispatch({...m,apiKey:'key'});
 assert(m.queries.some(s=>s.startsWith('SELECT EXISTS')&&s.includes('_participation_delivery_allowed(d.id)')));
});


test('création de compte : alerte réservée aux administrateurs sans envoi de bienvenue',()=>{
 const account={...item,recipient_kind:'admin',notification:{...item.notification,action:'account_created'}};
 const body=payload(account);
 assert.equal(body.headings.fr,'Nouveau compte cycliste');assert.match(body.contents.fr,/Camille vient de créer son compte/);
 assert.equal(body.url,'https://goelorides.onrender.com/admin-cyclistes.html');
 assert.equal(body.data.type,'cyclist_account_created');
 for(const recipient_kind of ['participant','guest','leader'])assert.throws(()=>payload({...account,recipient_kind}),/invalid_recipient/);
});


test('la CI exige une configuration serveur valide',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const workflow=fs.readFileSync(path.resolve(__dirname,'../../../.github/workflows/admin-participation-notifications.yml'),'utf8');
 assert(workflow.includes('node scripts/admin-participation-push.cjs --require-configured'));
});
