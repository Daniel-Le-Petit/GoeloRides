/** Base isolée uniquement : aucune connexion de production admise. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
if(process.env.PGDATABASE!=='goelo_account_test'||!['localhost','127.0.0.1'].includes(process.env.PGHOST)) throw Error('Base locale goelo_account_test requise.');
const root=path.resolve(__dirname,'../../..');
function sql(s){return execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-At','-c',s],{encoding:'utf8',env:process.env,stdio:['pipe','pipe','pipe']}).trim();}
function fn(file,name){const text=fs.readFileSync(path.join(root,file),'utf8'),start=text.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert(start>=0);return text.slice(start,text.indexOf('$$;',start)+3);}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function asUser(uid,expr){return JSON.parse(sql(`SET goelo.test_uid='${uid}'; SET ROLE authenticated; SELECT ${expr};`).split('\n').at(-1));}
sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('goelo.test_uid',true),'')::uuid $$;
CREATE TABLE public.routes(id text PRIMARY KEY,track_name text,is_active boolean DEFAULT true,front_config jsonb DEFAULT '{}');
CREATE TABLE public.signups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id text,user_id uuid,status text,created_at timestamptz DEFAULT now(),canceled_at timestamptz);`);
const previous='supabase/migrations/20250722160000_signup_latest_action.sql';
sql(fn(previous,'_signup_route_capacity')+'\n'+fn(previous,'_signup_latest_row')+'\n'+fn(previous,'_signup_promote_waitlist'));
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261031120000_account_bookings.sql'),'utf8');sql(migration);sql(migration);
sql(`INSERT INTO routes(id,track_name,front_config) VALUES ('future','Boucle','{"rideDateIso":"2099-06-10","rideTime":"08:30","sortieStatus":"open","maxParticipants":1}'),('past','Passée','{"rideDateIso":"2001-01-01","sortieStatus":"open"}'),('closed','Fermée','{"sortieStatus":"closed"}');
INSERT INTO signups(route_id,user_id,status,created_at) VALUES
('future','${A}','joined','2026-01-01'),('future','${B}','waiting','2026-01-02'),
('past','${A}','joined','2026-01-01'),('closed','${A}','joined','2026-01-01'),
('cancelled','${A}','joined','2026-01-01'),('cancelled','${A}','cancelled','2026-02-01');`);
let mine=asUser(A,'account_my_bookings()');assert.equal(mine.length,3);assert(mine.every(r=>r.user_id===A));assert(!mine.some(r=>r.route_id==='cancelled'));assert(mine.find(r=>r.route_id==='future').route.track_name==='Boucle');assert.equal(asUser(B,'account_my_bookings()').length,1);
assert.equal(sql("SELECT has_function_privilege('anon','account_my_bookings()','execute')"),'f');assert.equal(sql("SELECT has_function_privilege('anon','account_cancel_booking(text)','execute')"),'f');
assert.equal(asUser('',"account_cancel_booking('future')").error,'not_authenticated');assert.equal(asUser(A,"account_cancel_booking('past')").error,'sortie_past');assert.equal(asUser(A,"account_cancel_booking('closed')").error,'sortie_closed');
assert.equal(asUser(A,"account_cancel_booking('future')").action,'removed');assert.equal(asUser(A,"account_cancel_booking('future')").action,'removed');assert.equal(sql(`SELECT count(*) FROM signups WHERE user_id='${A}' AND route_id='future' AND status='joined' AND canceled_at IS NULL`),'0');assert.equal(sql(`SELECT status FROM signups WHERE user_id='${B}' AND route_id='future'`),'joined');assert.equal(asUser(B,'account_my_bookings()')[0].status,'joined');assert(!asUser(A,'account_my_bookings()').some(r=>r.route_id==='future'));
console.log('PASS PostgreSQL : migration répétable, isolation des comptes, droits, dernière action, dates, annulation idempotente, promotion de la file.');
