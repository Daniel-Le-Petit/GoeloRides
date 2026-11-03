const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
if(process.env.PGDATABASE!=='goelo_network_test'||!['127.0.0.1','localhost'].includes(process.env.PGHOST))throw Error('Local goelo_network_test required');
const root=path.resolve(__dirname,'../../..');
function sql(text){return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',text],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function fails(text){assert.throws(()=>sql(text))}
sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$; CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text); CREATE TABLE public.activity_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),metadata jsonb DEFAULT '{}'); INSERT INTO profiles VALUES('11111111-1111-4111-8111-111111111111','admin'),('22222222-2222-4222-8222-222222222222','user');");
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261103140000_activity_network_links.sql'),'utf8');
sql(migration);sql(migration);
function log(headers={},source='rpc:activity_event_log'){
 const h=JSON.stringify(headers).replace(/'/g,"''");
 return sql("SET request.headers='"+h+"'; INSERT INTO activity_events(metadata) VALUES(jsonb_build_object('source','"+source+"')) RETURNING id;").split('\n').find(l=>/^[a-f0-9-]{36}$/.test(l));
}
const a=log({'cf-connecting-ip':'192.0.2.1'}),b=log({'cf-connecting-ip':'192.0.2.1'}),c=log({'cf-connecting-ip':'192.0.2.2'});
assert.equal(sql("SELECT count(DISTINCT network_key) FROM activity_network_links WHERE event_id IN('"+a+"','"+b+"')"),'1');
assert.equal(sql('SELECT count(DISTINCT network_key) FROM activity_network_links'),'2');
log({'x-forwarded-for':'2001:db8::1, 192.0.2.9'});log({'x-forwarded-for':'2001:0db8:0000::1, 192.0.2.9'});
assert.equal(sql('SELECT count(DISTINCT network_key) FROM activity_network_links'),'3');
const before=sql('SELECT count(*) FROM activity_network_links');
log({});log({'cf-connecting-ip':'not-an-ip'});log({'cf-connecting-ip':'192.0.2.1/24'});log({'cf-connecting-ip':'192.0.2.1'},'trigger:signups');
assert.equal(sql('SELECT count(*) FROM activity_network_links'),before);
fails('SET ROLE anon; SELECT * FROM activity_network_links');
fails('SET ROLE authenticated; SELECT * FROM activity_network_secret');
fails("SET ROLE authenticated; SELECT admin_activity_network_links(ARRAY['"+a+"']::uuid[])");
fails("SET test.uid='22222222-2222-4222-8222-222222222222'; SET ROLE authenticated; SELECT admin_activity_network_links(ARRAY['"+a+"']::uuid[])");
const result=sql("SET test.uid='11111111-1111-4111-8111-111111111111'; SET ROLE authenticated; SELECT admin_activity_network_links(ARRAY['"+a+"','"+b+"']::uuid[])").split('\n').find(l=>l.startsWith('['));
const rows=JSON.parse(result);assert.equal(rows.length,2);assert.equal(rows[0].network_key,rows[1].network_key);assert(!result.includes('192.0.2'));
sql("UPDATE activity_network_links SET captured_at=now()-interval '31 days' WHERE event_id='"+a+"'; UPDATE activity_network_secret SET purged_on=current_date-1;");
log({'cf-connecting-ip':'192.0.2.3'});
assert.equal(sql("SELECT count(*) FROM activity_network_links WHERE event_id='"+a+"'"),'0');
sql("DELETE FROM activity_events WHERE id='"+b+"'");
assert.equal(sql("SELECT count(*) FROM activity_network_links WHERE event_id='"+b+"'"),'0');
console.log('PASS : serveur, regroupement IPv4/IPv6, échecs sans blocage, zéro IP brute, accès admin, expiration, suppression liée et migration idempotente.');
