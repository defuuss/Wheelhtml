const {JSDOM}=require(process.env.WHEEL_TEST_JSDOM || 'jsdom');const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(card, page='index.html') {
 const dom=new JSDOM(fs.readFileSync(root+'/'+page,'utf8'),{url:'https://wheel.test/'+page,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,errors=[];
 w.addEventListener('error',e=>errors.push(e.error||e.message));w.fetch=()=>Promise.reject(Error('Test network disabled'));w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve(),cancel(){}}};
 const counts=Object.fromEntries(['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive'].map(id=>[id,id===card?1:0]));
 w.localStorage.setItem('fortune-engine-config-v1',JSON.stringify({settings:{soundEnabled:false,fateDeck:counts},levels:[{id:'a',name:'Group A',activeAtStart:true},{id:'b',name:'Locked B'}],forfeits:[...Array.from({length:6},(_,i)=>({id:'f'+i,name:'Forfeit '+i,levelId:'a',weight:i+1,lifetime:{type:'once'},timerSeconds:i===0?60:0})),{id:'locked',name:'Locked',levelId:'b',weight:.1}],rules:[]}));
 for(const script of w.document.querySelectorAll('script')){if(script.src)w.eval(fs.readFileSync(root+'/'+script.getAttribute('src').split('?')[0],'utf8'));else w.eval(script.textContent);}
 await pause(120);return {w,errors,close:()=>w.close()};
}
(async()=>{
 for(const [type,count] of [['doubleForfeit',2],['tripleTrouble',3],['devilFive',5],['rarest',1]]) {
  const {w,errors,close}=await setup(type);
  try {
   let spins=0;w.addEventListener('fortune-spin-start',()=>spins++);
   assert.equal(w.FortuneFateDeck.drawFromWheel(),true);w.document.getElementById('fateV4Continue').click();await pause(150);
   assert.equal(spins,0,'Direct cards must not spin');
   assert.equal(w.document.querySelectorAll('.batch-forfeit').length,count);
   const session=w.FortuneModel.loadSession(w.FortuneModel.loadConfig());assert.equal(session.history.length,count);assert.equal(new Set(session.history.map(x=>x.id)).size,count);assert.ok(session.history.every(x=>x.id!=='locked'));
   if(type==='rarest')assert.equal(session.history[0].id,'f0');
   assert.equal(w.document.getElementById('undoBtn').disabled,true,'Batch must block undo until done');
   w.document.querySelector('.batch-dialog>.btn').click();assert.equal(w.document.querySelector('.batch-overlay'),null);
   w.document.getElementById('undoBtn').click();assert.equal(w.FortuneModel.loadSession(w.FortuneModel.loadConfig()).history.length,0,'Undo restores the entire batch');assert.deepEqual(errors,[]);
  } finally {await pause(150);close();}
 }
 {const {w,errors,close}=await setup('doubleForfeit');try {
  w.document.getElementById('spinBtn').click();await pause(850);const original=w.FortuneModel.loadSession(w.FortuneModel.loadConfig()).pendingForfeit.item.id;
  w.document.getElementById('temptFateBtn').click();w.document.getElementById('fateV4Continue').click();await pause(100);
  assert.equal(w.document.querySelectorAll('.batch-forfeit').length,2);const history=w.FortuneModel.loadSession(w.FortuneModel.loadConfig()).history;assert.equal(history.length,2);assert.equal(history[0].id,original);assert.notEqual(history[1].id,original);assert.deepEqual(errors,[]);
 }finally{await pause(150);close();}}
 {const {w,close}=await setup('chaosWeights');try {w.FortuneFateDeck.drawFromWheel();w.document.getElementById('fateV4Continue').click();const s=w.FortuneModel.loadSession(w.FortuneModel.loadConfig());assert.ok(Object.entries(s.runtime).filter(([id])=>id!=='locked').some(([,r])=>r.weightMultiplier!==1));assert.equal(s.runtime.locked.weightMultiplier,1);}finally{await pause(150);close();}}
 {const {w,close}=await setup('doubleOrNothing');try {w.FortuneFateDeck.drawFromWheel();w.document.getElementById('fateV4Flip').click();await pause(20);assert.equal(w.document.getElementById('fateV4Coin').className,'risk-wheel');assert.equal(w.document.getElementById('fateV4Continue').hidden,false);}finally{await pause(150);close();}}
 {const {w,close}=await setup('devilFive','edit.html');try {
  const input=w.document.querySelector('[data-card=devilFive]');input.value=7;input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.getElementById('applyBtn').click();await pause(150);
  const M=w.FortuneModel,cfg=M.loadConfig();assert.equal(cfg.settings.fateDeck.devilFive,7);assert.equal(cfg.settings.fateDeck.doubleForfeit,0);assert.equal(M.xmlToConfig(M.configToXml(cfg)).settings.fateDeck.devilFive,7);
 }finally{await pause(150);close();}}
 console.log('PASS: direct double/triple/devil/lowest draws, no duplicates or locked entries, whole-batch undo, current result retained, weight changes, risk wheel and editor deck/XML settings.');
})().catch(e=>{console.error(e);process.exitCode=1});
