// Reprend le schéma et les tests de capture dans la même base locale isolée.
require('./home-alerts-postgres.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
function sql(s){return execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-At','-c',s],{encoding:'utf8',env:process.env,stdio:['pipe','pipe','pipe']}).trim();}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
sql(`CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('goelo.test_uid',true),'')::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('goelo.test_jwt',true),''),'{}')::jsonb$$;CREATE TABLE profiles(id uuid PRIMARY KEY,role text);INSERT INTO profiles VALUES('${A}','admin'),('${B}','team_rider'),('${C}','user');`);
const migration=fs.readFileSync(path.resolve(__dirname,'../../../supabase/migrations/20261031170000_admin_home_alerts.sql'),'utf8');sql(migration);sql(migration);
function admin(expr,uid=A){return JSON.parse(sql(`SET goelo.test_uid='${uid}'; SET ROLE authenticated; SELECT ${expr};`));}
function visible(){return JSON.parse(sql('SET ROLE anon; SELECT home_priority_alerts();'));}
const date=sql("SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date+1,'YYYY-MM-DD')");
sql(`INSERT INTO routes VALUES('manual','Sortie manuelle','Vert',true,'{"visibility":"public","sortieStatus":"publiee","rideDateIso":"${date}","rideTime":"09:00"}');`);
assert(admin('admin_home_alerts_list()').some(r=>r.route_id==='manual'&&!r.visible));
assert.equal(admin("admin_home_alert_set('manual',true,'Attention au rendez-vous')").visible,true);assert.equal(visible().find(r=>r.route_id==='manual').kind,'information');assert.equal(visible().find(r=>r.route_id==='manual').message,'Attention au rendez-vous');
assert.equal(admin("admin_home_alert_set('manual',false)").visible,false);assert(!visible().some(r=>r.route_id==='manual'));assert(admin('admin_home_alerts_list()').find(r=>r.route_id==='manual').suppressed);
sql("UPDATE routes SET front_config=front_config||'{\"description\":\"Autre texte\"}' WHERE id='manual'");assert(!visible().some(r=>r.route_id==='manual'));
sql("UPDATE routes SET front_config=front_config||'{\"rideTime\":\"10:00\"}' WHERE id='manual'");assert.equal(visible().find(r=>r.route_id==='manual').kind,'schedule');assert.equal(visible().find(r=>r.route_id==='manual').message,null);
assert.equal(admin("admin_home_alert_set('manual',false)").visible,false);assert.equal(admin("admin_home_alert_set('manual',true,'Nouvelle précision')").visible,true);assert.equal(visible().find(r=>r.route_id==='manual').kind,'schedule');
for(const uid of [B,C,''])assert.throws(()=>admin("admin_home_alert_set('manual',false)",uid),/Accès administrateur/);
assert.throws(()=>admin('admin_home_alerts_list()',B),/Accès administrateur/);
assert.throws(()=>admin("admin_home_alert_set('private',true)"),/ne peut pas/);
assert.throws(()=>admin("admin_home_alert_set('manual',true,repeat('x',401))"),/400/);
assert.equal(sql("SELECT has_function_privilege('anon','admin_home_alert_set(text,boolean,text)','execute')"),'f');
console.log('PASS admin : activation, message, retrait durable, réactivation automatique après nouvel événement, rôles, accès privés et validation.');
