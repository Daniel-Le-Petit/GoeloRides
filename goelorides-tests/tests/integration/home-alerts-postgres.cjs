const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
if(process.env.PGDATABASE!=='goelo_alerts_test'||!['localhost','127.0.0.1'].includes(process.env.PGHOST))throw Error('Base locale goelo_alerts_test requise.');
function sql(s){return execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-At','-c',s],{encoding:'utf8',env:process.env,stdio:['pipe','pipe','pipe']}).trim();}
function alerts(){return JSON.parse(sql('SET ROLE anon; SELECT home_priority_alerts();'));}
sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE routes(id text PRIMARY KEY,track_name text,group_label text,is_active boolean DEFAULT true,front_config jsonb DEFAULT '{}');`);
const migration=fs.readFileSync(path.resolve(__dirname,'../../../supabase/migrations/20261031150000_home_priority_alerts.sql'),'utf8');sql(migration);sql(migration);
const tomorrow=sql("SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date+1,'YYYY-MM-DD')"),past='2001-01-01';
function route(id,date=tomorrow,visibility='public'){sql(`INSERT INTO routes VALUES('${id}','Boucle','Groupe vert',true,'${JSON.stringify({visibility,sortieStatus:'publiee',rideDateIso:date,rideTime:'09:00',meetTime:'08:45'})}')`);}
function patch(id,p){sql(`UPDATE routes SET front_config=front_config||'${JSON.stringify(p)}'::jsonb WHERE id='${id}'`);}
route('tomorrow');assert.equal(alerts().length,0);patch('tomorrow',{rideTime:'10:00',meetTime:'09:45'});assert.equal(alerts()[0].kind,'schedule');assert.equal(alerts()[0].previous.departure,'09:00');assert.equal(alerts()[0].departure,'10:00');
patch('tomorrow',{sortieStatus:'cancelled'});assert.equal(alerts()[0].kind,'cancelled');patch('tomorrow',{sortieStatus:'publiee'});assert.equal(alerts().length,0);
route('private',tomorrow,'private');patch('private',{sortieStatus:'cancelled'});assert.equal(alerts().length,0);
route('past',past);patch('past',{sortieStatus:'cancelled'});assert.equal(alerts().length,0);
route('draft',tomorrow,'draft');patch('draft',{rideTime:'10:00'});assert.equal(alerts().length,0);
route('cancel-draft');patch('cancel-draft',{sortieStatus:'annulee',visibility:'draft'});assert.equal(alerts().length,1);patch('cancel-draft',{description:'Autre description'});assert.equal(alerts().length,1);patch('cancel-draft',{visibility:'private'});assert.equal(alerts().length,0);
route('inactive');patch('inactive',{sortieStatus:'annulee'});assert.equal(alerts().length,1);sql("UPDATE routes SET is_active=false WHERE id='inactive'");assert.equal(alerts().length,0);
route('postponed');patch('postponed',{rideDateIso:'2099-01-01'});assert.equal(alerts().length,1);assert.equal(alerts()[0].previous.date,tomorrow);sql("DELETE FROM routes WHERE id='postponed'");assert.equal(alerts().length,0);
assert.equal(sql("SELECT has_table_privilege('anon','ride_priority_alerts','select')"),'f');
assert.equal(sql("SELECT has_function_privilege('anon','home_priority_alerts()','execute')"),'t');
console.log('PASS PostgreSQL : changements partagés, annulation, réouverture, première visite, privés/brouillons exclus, expiration, report, suppression et permissions.');
