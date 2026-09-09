const {JSDOM}=require(process.env.WHEEL_TEST_JSDOM||'jsdom');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(config,page='index.html',saved=null){
 const dom=new JSDOM(fs.readFileSync(root+'/'+page,'utf8'),{url:'https://wheel.test/'+page,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,errors=[];
 w.addEventListener('error',e=>errors.push(e.error||e.message));w.fetch=()=>Promise.reject(Error('Test network disabled'));w.confirm=()=>true;w.matchMedia=()=>({matches:true,addEventListener(){}});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve(),cancel(){}}};w.Math.random=()=>.99;
 const deck=Object.fromEntries(['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive'].map(id=>[id,id==='rarest'?5:0]));
 w.localStorage.setItem('fortune-engine-config-v1',JSON.stringify({...config,settings:{soundEnabled:false,fateDeck:deck,...config.settings}}));
 if(saved)Object.entries(saved).forEach(([k,v])=>w.localStorage.setItem(k,v));
 for(const script of w.document.querySelectorAll('script')){if(script.src)w.eval(fs.readFileSync(root+'/'+script.getAttribute('src').split('?')[0],'utf8'));else w.eval(script.textContent);}
 await wait(150);return{w,errors,session:()=>w.FortuneModel.loadSession(w.FortuneModel.loadConfig()),close:async()=>{await wait(150);w.close();}};
}
(async()=>{
 const config={levels:[{id:'a',activeAtStart:true,completionUnlockLevels:['b']},{id:'b',activeAtStart:false}],forfeits:[{id:'repeat',name:'Three selections',levelId:'a',lifetime:{type:'spins',spins:3}},{id:'next',levelId:'b'}],rules:[]};
 for(const direct of [false,true]){
  const f=await setup(config);const {w}=f;
  try{for(let n=1;n<=3;n++){
   if(direct){w.FortuneFateDeck.drawFromWheel();w.document.getElementById('fateV4Continue').click();await wait(100);w.document.querySelector('.batch-dialog>.btn').click();}
   else{w.document.getElementById('spinBtn').click();await wait(750);assert.equal(f.session().runtime.repeat.remainingSpins,4-n,'Showing a result must not consume it');w.document.getElementById('resultCloseBtn').click();}
   assert.equal(f.session().runtime.repeat.remainingSpins,3-n);assert.equal(Boolean(f.session().completedLevels.a),n===3);assert.equal(Boolean(f.session().activeLevels.b),n===3);
  }assert.deepEqual(f.errors,[]);}finally{await f.close();}
 }
 const replacement={levels:[{id:'a',activeAtStart:true},{id:'b',activeAtStart:false}],forfeits:[{id:'rare',name:'Rare',weight:1,levelId:'a',lifetime:{type:'once'}},{id:'original',name:'Unlock original',weight:10,levelId:'a',unlockLevels:['b'],lifetime:{type:'once'}},{id:'locked',name:'Locked',weight:.1,levelId:'b'}],rules:[{id:'r',conditionForfeitIds:['original'],unlockLevels:['b'],mode:'all'}]};
 {const f=await setup(replacement),{w}=f;try{
  w.document.getElementById('spinBtn').click();await wait(750);assert.equal(f.session().pendingForfeit.item.id,'original');assert.equal(f.session().activeLevels.b,false);assert.equal(f.session().history.length,0);
  w.document.getElementById('temptFateBtn').click();w.document.getElementById('fateV4Continue').click();await wait(100);
  assert.equal(w.document.querySelectorAll('.batch-forfeit').length,1);assert.deepEqual(Array.from(f.session().history,x=>x.id),['rare']);assert.equal(f.session().runtime.rare.removed,true);assert.equal(f.session().runtime.original.removed,false);assert.equal(f.session().activeLevels.b,false);assert.equal(f.session().pendingForfeit,undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}}
 {const f=await setup(replacement),{w}=f;let stored;try{
  w.document.getElementById('spinBtn').click();await wait(750);w.FortunePlay.markCardUsed();stored=Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)];}));
 }finally{await f.close();}
 const g=await setup(replacement,'index.html',stored);try{assert.equal(g.w.document.getElementById('resultOverlay').hidden,false);assert.equal(g.w.FortunePlay.canTakeCard(),false);assert.equal(g.session().activeLevels.b,false);g.w.document.getElementById('resultCloseBtn').click();assert.equal(g.session().activeLevels.b,true);assert.equal(g.session().history.length,1);}finally{await g.close();}}
 {const f=await setup(config,'edit.html'),{w}=f;try{const input=w.document.getElementById('spinMode');input.value='manual';input.dispatchEvent(new w.Event('change',{bubbles:true}));w.document.getElementById('applyBtn').click();await wait(100);const M=w.FortuneModel,c=M.loadConfig();assert.equal(c.settings.spinMode,'manual');assert.equal(M.xmlToConfig(M.configToXml(c)).settings.spinMode,'manual');}finally{await f.close();}}
 {const counts=Object.fromEntries(['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive'].map(id=>[id,id==='devilFive'?1:0]));
 const f=await setup({settings:{fateDeck:counts},levels:[{id:'a',activeAtStart:true},{id:'b',activeAtStart:true}],forfeits:Array.from({length:6},(_,i)=>({id:'d'+i,name:'Devil '+i,levelId:i<3?'a':'b',lifetime:{type:'once'}}))}),{w}=f;
 try{assert.equal(w.document.getElementById('devilGroup'),null);w.FortuneFateDeck.drawFromWheel();w.document.getElementById('fateV4Continue').click();await wait(100);const ids=f.session().history.map(x=>x.id);assert.equal(ids.length,3);assert.ok(ids.every(id=>['d3','d4','d5'].includes(id)));assert.equal(f.session().completedLevels.b,true);assert.equal(f.session().completedLevels.a,undefined);}finally{await f.close();}}
 {const f=await setup(replacement),{w}=f;try{w.matchMedia=()=>({matches:false});w.FortuneFateDeck.drawFromWheel();assert.equal(w.document.getElementById('fateV4Status').hidden,true);assert.equal(w.document.getElementById('fateV4Continue').disabled,true);await wait(3350);assert.equal(w.document.getElementById('fateV4Status').hidden,false);assert.equal(w.document.getElementById('fateV4Continue').disabled,false);}finally{await f.close();}}
 console.log('PASS: ordinary/card selection limits, exhaustion unlocks, provisional effects, rarest replacement only, no cancelled unlocks, pending reload/card-use persistence and saved spin mode/XML.');
})().catch(e=>{console.error(e);process.exitCode=1});
