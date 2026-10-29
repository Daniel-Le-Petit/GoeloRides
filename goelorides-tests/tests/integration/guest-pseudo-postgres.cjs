/** Exécuter uniquement contre une base PostgreSQL locale nommée goelo_guest_test. */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
if (process.env.PGDATABASE !== 'goelo_guest_test' || !['localhost','127.0.0.1'].includes(process.env.PGHOST)) throw new Error('Ce test exige la base locale goelo_guest_test.');
function sql(text) { return execFileSync('psql', ['-X','-v','ON_ERROR_STOP=1','-At','-c',text], { encoding: 'utf8', env: process.env }).trim(); }
function asyncSql(text) { return new Promise((resolve,reject)=>execFile('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',text],{env:process.env},(err,out)=>err?reject(err):resolve(out.trim()))); }
function fn(file,name) { const text=fs.readFileSync(path.join(root,file),'utf8');const start=text.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert(start>=0);return text.slice(start,text.indexOf('$$;',start)+3); }
function call(action,route,token,pseudo='Camille',role='anon') { return JSON.parse(sql(`SET ROLE ${role}; SELECT public.guest_pseudo_participation('${action}','${route}','${token}','${pseudo}','test-browser'); RESET ROLE;`).split('\n').find(line=>line.startsWith('{'))); }
function route(id,cap=2,extra={}) { sql(`INSERT INTO public.routes(id,track_name,front_config) VALUES('${id}','Boucle','${JSON.stringify({visibility:'public',sortieStatus:'publiee',maxParticipants:cap,rideDateIso:'2099-04-13',...extra})}'::jsonb)`); }
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64),USER='11111111-1111-4111-8111-111111111111';
(async()=>{
sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('goelo.test_uid',true),'')::uuid $$;
CREATE TABLE public.routes(id text PRIMARY KEY,track_name text,is_active boolean DEFAULT true,front_config jsonb DEFAULT '{}');
CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
CREATE TABLE public.signups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id text REFERENCES public.routes(id),user_id uuid,status text,created_at timestamptz DEFAULT now(),canceled_at timestamptz);
CREATE TABLE public.guest_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id text REFERENCES public.routes(id),first_name text,last_name text,phone text,created_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.test_events(event_type text,metadata jsonb);
CREATE FUNCTION public._goelo_caller_can_manage_guests() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('goelo.test_admin',true),'')='true'$$;
CREATE FUNCTION public.activity_event_log(p_event_type text,p_metadata jsonb DEFAULT '{}',p_actor_id uuid DEFAULT NULL,p_entity_type text DEFAULT NULL,p_entity_id text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.test_events VALUES(p_event_type,p_metadata); RETURN gen_random_uuid(); END$$;`);
const latest='supabase/migrations/20250722160000_signup_latest_action.sql';
sql(fn(latest,'_signup_route_capacity')+'\n'+fn(latest,'_signup_latest_row')+'\n'+fn(latest,'_signup_promote_waitlist')+'\n'+fn('supabase/migrations/20250722170000_profiles_rls_signup_list_toggle.sql','toggle_signup')+'\n'+fn('supabase/migrations/20250716190000_guest_participants.sql','guest_participant_add'));
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261029100000_guest_pseudo_participation.sql'),'utf8');sql(migration);sql(migration); // Idempotence du déploiement.
route('r1');assert.equal(call('join','r1',A).joined,true);assert.equal(call('join','r1',A).action,'existing');assert.equal(sql("SELECT count(*) FROM guest_participants WHERE route_id='r1'"),'1');assert.equal(sql('SELECT count(*) FROM profiles'),'0');assert.equal(sql("SELECT count(*) FROM test_events WHERE event_type='RIDE_JOINED'"),'1');
assert.equal(call('status','r1',A).pseudo,'Camille');assert.equal(call('cancel','r1',B).joined,false);assert.equal(call('status','r1',A).joined,true);assert.equal(call('join','r1',B).error,'pseudo_taken');assert.equal(call('cancel','r1',A).joined,false);assert.equal(sql("SELECT count(*) FROM guest_participants WHERE route_id='r1'"),'0');
for(const [id,extra] of [['closed',{sortieStatus:'closed'}],['draft',{visibility:'draft'}],['private',{visibility:'private'}],['past',{rideDateIso:'2001-01-01'}]]) { route(id,2,extra);assert.equal(call('join',id,A).ok,false); }
route('full',1);assert.equal(call('join','full',A).joined,true);assert.equal(call('join','full',B,'Autre').error,'full');
let member=JSON.parse(sql(`SET goelo.test_uid='${USER}'; SELECT toggle_signup('full');`).split('\n').find(s=>s.startsWith('{')));assert.equal(member.waitlist,true);call('cancel','full',A);assert.equal(sql(`SELECT status FROM signups WHERE route_id='full' AND user_id='${USER}' ORDER BY created_at DESC LIMIT 1`),'joined');
assert.throws(()=>sql('SET ROLE anon; SELECT * FROM guest_pseudo_registrations;'),/permission denied/);assert.throws(()=>sql('SET ROLE anon; SELECT * FROM guest_pseudo_attempts;'),/permission denied/);
assert.equal(sql("SELECT has_function_privilege('anon','public._goelo_member_before_guest_pseudo(text)','EXECUTE')"),'f');
assert(!sql("SELECT to_jsonb(g) FROM guest_participants g LIMIT 1").includes('token_hash'));
route('concurrent',1);
const results=await Promise.all([A,B,C].map((token,i)=>asyncSql(`SET ROLE anon; SELECT guest_pseudo_participation('join','concurrent','${token}','Concurrent ${i}',NULL);`).then(text=>JSON.parse(text.split('\n').find(s=>s.startsWith('{'))))));assert.equal(results.filter(r=>r.joined).length,1);assert.equal(sql("SELECT count(*) FROM guest_participants WHERE route_id='concurrent'"),'1');
route('mixed',1);
await Promise.all([asyncSql(`SET ROLE anon; SELECT guest_pseudo_participation('join','mixed','${B}','Invite',NULL);`),asyncSql(`SET goelo.test_uid='${USER}'; SELECT toggle_signup('mixed');`)]);
assert.equal(sql("SELECT main_count FROM _signup_route_capacity('mixed')"),'1');
console.log('PASS PostgreSQL : migration répétable, ajout sans compte, doublons, jetons distincts, annulation, capacité, liste d’attente, RLS et confirmations concurrentes invité/membre.');
})().catch(err=>{console.error(err.message);process.exit(1)});
