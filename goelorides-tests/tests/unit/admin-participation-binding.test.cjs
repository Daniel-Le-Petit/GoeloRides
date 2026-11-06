const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
function setup(){
 const listeners={},requests=[],storage=new Map();let state={pending:false,user:{id:'user-1'}};let fail=false,optouts=0;
 const sub={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',optedIn:true,addEventListener(name,fn){this.changed=fn;},async optOut(){optouts++;}};
 const window={GOELO_ONESIGNAL_APP_ID:'',GOELO_CONFIG:{},GoeloAuthState:{getState:()=>state},addEventListener:(name,fn)=>{listeners[name]=fn;},goeloGetSb:()=>({rpc:async(name,args)=>{requests.push({name,args});if(fail)throw Error('offline');return {data:{ok:true}};}})};
 const source=fs.readFileSync(path.join(root,'goelo-onesignal.js'),'utf8');
 const injected=source.replace('  void goeloOneSignalInitPromise();','  oneSignalInstance = window.testSdk;');
 window.testSdk={User:{PushSubscription:sub}};
 vm.runInNewContext(injected,{window,document:{},navigator:{},location:{hostname:'test'},localStorage:{setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout,console});
 return {window,sub,requests,listeners,storage,setState:v=>state=v,fail:()=>fail=true,optouts:()=>optouts};
}
test('liaison au compte authentifié sans rôle fourni par le navigateur ni demande de permission',async()=>{
 const a=setup();assert.equal(await a.window.goeloSyncParticipationPush(),true);
 assert.equal(a.requests[0].name,'participation_device_set');
 assert.equal(a.storage.get('goelo-participation-push-subscription'),a.sub.id);
 assert.deepEqual(Object.keys(a.requests[0].args).sort(),['p_enabled','p_subscription_id']);
 a.sub.optedIn=false;await a.window.goeloSyncParticipationPush();assert.equal(a.requests[1].args.p_enabled,false);
});
test('aucune liaison compte pour un visiteur ou une session en cours de résolution',async()=>{
 const a=setup();a.setState({pending:false,user:null});await a.window.goeloSyncParticipationPush();
 a.setState({pending:true,user:{id:'u'}});await a.window.goeloSyncParticipationPush();assert.equal(a.requests.length,0);
});
test('preuve invitée et consentement push restent nécessaires',async()=>{
 const a=setup();a.sub.optedIn=false;assert.equal(await a.window.goeloBindGuestParticipationPush('r','a'.repeat(64)),false);
 assert.equal(a.requests.length,0);a.sub.optedIn=true;
 assert.equal(await a.window.goeloBindGuestParticipationPush('r','a'.repeat(64)),true);
 assert.equal(a.requests[0].name,'participation_guest_device_set');assert.equal(a.requests[0].args.p_token,'a'.repeat(64));
});
test('déconnexion révoque la livraison et empêche une resynchronisation tardive',async()=>{
 const a=setup();await a.window.goeloDisableParticipationPush();await a.window.goeloSyncParticipationPush();
 assert.equal(a.requests.length,1);assert.equal(a.requests[0].args.p_enabled,false);
 const b=setup();b.fail();await b.window.goeloDisableParticipationPush();assert.equal(b.optouts(),1);
});
test('la révocation précède la déconnexion Supabase',()=>{
 const source=fs.readFileSync(path.join(root,'js/auth.js'),'utf8');
 const logout=source.slice(source.indexOf('window.goeloSignOut ='));
 assert(logout.indexOf('goeloDisableParticipationPush()')<logout.indexOf('await sb.auth.signOut()'));
});
