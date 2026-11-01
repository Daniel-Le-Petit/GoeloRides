// Base isolée : réutilise les schémas et rôles existants, jamais la production.
require('./admin-home-alerts-postgres.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
function sql(s){return execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-At','-c',s],{encoding:'utf8',env:process.env,stdio:['pipe','pipe','pipe']}).trim();}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
sql(`CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO anon,authenticated;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
const migration=fs.readFileSync(path.resolve(__dirname,'../../../supabase/migrations/20261101190000_ride_albums.sql'),'utf8');sql(migration);sql(migration);
function run(q,uid=A,role='authenticated'){return sql(`SET goelo.test_uid='${uid}';SET ROLE ${role};${q}`);}
const album='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
run(`INSERT INTO ride_albums(id,title,ride_date) VALUES('${album}','Les falaises','2026-07-14');`);
assert.equal(run('SELECT count(*) FROM ride_albums;', '', 'anon'),'0');assert.equal(run('SELECT count(*) FROM ride_albums;',B),'0');assert.equal(run('SELECT count(*) FROM ride_albums;'),'1');
for(const uid of [B,C,''])assert.throws(()=>run("INSERT INTO ride_albums(title,ride_date) VALUES('Interdit','2026-07-14');",uid),/row-level security/);
run(`UPDATE ride_albums SET published=true WHERE id='${album}';`);assert.equal(run('SELECT count(*) FROM ride_albums;','','anon'),'1');
assert.equal(run(`WITH changed AS(UPDATE ride_albums SET title='Fraude' WHERE id='${album}' RETURNING id) SELECT count(*) FROM changed;`,B),'0');
assert.throws(()=>run("INSERT INTO ride_albums(title,ride_date) VALUES('','2026-07-14');"),/check constraint/);
assert.throws(()=>run("INSERT INTO ride_albums(title,ride_date,photos) VALUES('Trop','2026-07-14','{}');"),/check constraint|array length/);
assert.throws(()=>run("INSERT INTO ride_albums(title,ride_date,facebook_url) VALUES('Lien','2026-07-14','javascript:alert(1)');"),/check constraint/);
run("INSERT INTO storage.objects(bucket_id,name) VALUES('ride-photos','album/image.jpg');");
assert.throws(()=>run("INSERT INTO storage.objects(bucket_id,name) VALUES('ride-photos','image.jpg');",B),/row-level security/);
assert.throws(()=>run("INSERT INTO storage.objects(bucket_id,name) VALUES('other','image.jpg');"),/row-level security/);
run(`UPDATE ride_albums SET published=false WHERE id='${album}';`);assert.equal(run('SELECT count(*) FROM ride_albums;','','anon'),'0');
assert.equal(sql("SELECT public::text||':'||file_size_limit FROM storage.buckets WHERE id='ride-photos';"),'true:5242880');
console.log('PASS albums : brouillons privés, publication/retrait, rôles, validations et stockage admin.');
