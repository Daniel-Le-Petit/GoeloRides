const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
function guide(reducedMotion=false){
 const source=fs.readFileSync(path.join(root,'js/parcours.js'),'utf8');
 const code=source.slice(source.indexOf('  function bindAccordions()'),source.indexOf('  function bindGpxDownload()'));
 const actions=[],attributes={'aria-expanded':'false'},classes=new Set(),listeners={},panel={style:{},scrollHeight:180};
 const head={getAttribute:k=>attributes[k],setAttribute:(k,v)=>attributes[k]=v,addEventListener:(event,fn)=>listeners[event]=fn,click(){listeners.click()},focus:args=>actions.push(['focus',args])};
 const item={querySelector:s=>s==='.pd-acc__head'?head:panel,getAttribute:()=> 'niveau_sortie',classList:{toggle(name){if(classes.has(name)){classes.delete(name);return false}classes.add(name);return true}},scrollIntoView:args=>actions.push(['scroll',args])};
 const shortcut={disabled:true,attributes:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(event,fn){this[event]=fn}};
 const accordion={dataset:{},querySelectorAll:()=>[item],querySelector:()=>item};
 const c={document:{getElementById:id=>id==='pd-accordions'?accordion:shortcut},_openedInfoSections:{},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:reducedMotion}),GoeloActivity:{EVENT_TYPES:{RIDE_INFO_OPENED:'info'},logEvent:()=>actions.push(['tracked'])}};c.window=c;vm.createContext(c);vm.runInContext(code+'\nbindAccordions();',c);
 return {shortcut,head,panel,attributes,actions,c};
}
test('le raccourci ouvre le guide, déplace le focus et conserve son ouverture lors d’un second clic',()=>{
 const a=guide();assert.equal(a.shortcut.disabled,false);a.shortcut.click();assert.equal(a.attributes['aria-expanded'],'true');assert.equal(a.shortcut.attributes['aria-expanded'],'true');assert.equal(a.panel.style.maxHeight,'180px');assert.equal(a.actions.find(x=>x[0]==='scroll')[1].behavior,'smooth');assert.equal(a.actions.find(x=>x[0]==='focus')[1].preventScroll,true);
 a.shortcut.click();assert.equal(a.attributes['aria-expanded'],'true');assert.equal(a.actions.filter(x=>x[0]==='tracked').length,1);
 a.head.click();assert.equal(a.shortcut.attributes['aria-expanded'],'false');assert.equal(a.panel.style.maxHeight,'0');a.shortcut.click();assert.equal(a.attributes['aria-expanded'],'true');
});
test('préférence de mouvement réduit et absence de double liaison',()=>{
 const a=guide(true);a.shortcut.click();assert.equal(a.actions.find(x=>x[0]==='scroll')[1].behavior,'auto');vm.runInContext('bindAccordions();',a.c);assert.equal(a.shortcut.disabled,false);
});
test('le bouton est proposé entre les caractéristiques et la participation, avec le bon panneau accessible',()=>{
 const html=fs.readFileSync(path.join(root,'parcours.html'),'utf8');assert(html.indexOf('id="pd-metrics"')<html.indexOf('id="pd-level-shortcut"'));assert(html.indexOf('id="pd-level-shortcut"')<html.indexOf('id="pd-join-btn"'));assert.match(html,/<button[^>]*id="pd-level-shortcut"[^>]*aria-controls="pd-level-panel"/);
});
