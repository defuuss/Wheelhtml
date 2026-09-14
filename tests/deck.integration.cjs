const assert=require('node:assert/strict');
const {setup,deck,next,finish,wait}=require('./helpers.cjs');
const base={levels:[{id:'a',name:'Group A',activeAtStart:true},{id:'b',name:'Group B',activeAtStart:true},{id:'locked',activeAtStart:false}],
forfeits:Array.from({length:13},(_,i)=>({id:'f'+i,name:'Entry '+i,levelId:i<6?'a':i<12?'b':'locked',weight:i+1,timerSeconds:120,lifetime:{type:'once'}}))};
(async()=>{
 for(const [type,count] of [['doubleForfeit',2],['tripleTrouble',3],['devilFive',5],['rarest',1]]){
  const f=await setup({...base,settings:{fateDeck:deck(type)}});try{
   let spins=0;f.w.addEventListener('fortune-spin-start',()=>spins++);
   f.w.FortuneFateDeck.drawFromWheel();f.w.document.getElementById('fateV4Continue').click();
   assert.equal(f.session().history.length,0);assert.equal(f.session().revealBatch.entries.length,count);
   const reserved=Array.from(f.session().revealBatch.entries,x=>x.item.id);
   assert.equal(new Set(reserved).size,count);assert.ok(!reserved.includes('f12'));
   if(type==='rarest')assert.deepEqual(reserved,['f0']);
   if(type==='devilFive')assert.ok(reserved.every(id=>Number(id.slice(1))>=6));
   await finish(f);
   assert.equal(spins,0);assert.equal(f.session().history.length,count);
   f.w.document.getElementById('batchDone').click();
   assert.equal(f.w.document.querySelector('.batch-overlay'),null);
   f.w.document.getElementById('undoBtn').click();assert.equal(f.session().history.length,0,'Undo restores the whole draw');
   assert.deepEqual(f.errors,[]);
  }finally{f.close();}
 }
 {const f=await setup({...base,settings:{fateDeck:deck('devilFive')}});let saved,reserved;
  try{
   f.w.FortuneFateDeck.drawFromWheel();f.w.document.getElementById('fateV4Continue').click();
   reserved=Array.from(f.session().revealBatch.entries,x=>x.item.id);
   await next(f);await next(f);
   f.w.document.querySelector('[data-timer-key]').click();await wait(20);
   f.w.document.querySelector('.reveal-pause').click();
   assert.equal(f.session().revealBatch.paused,true);
   assert.equal(f.session().revealBatch.entries[1].timer.deadline,0);
   saved=f.saved();
  }finally{f.close();}
  const g=await setup(base,{saved});try{
   assert.deepEqual(Array.from(g.session().revealBatch.entries,x=>x.item.id),reserved);
   assert.equal(g.session().history.length,2);
   g.w.document.querySelector('.reveal-paused button').click();await finish(g);
   assert.equal(g.session().history.length,5);assert.equal(new Set(g.session().history.map(x=>x.id)).size,5);
   assert.deepEqual(g.errors,[]);
  }finally{g.close();}
 }
 {const f=await setup({...base,settings:{fateDeck:deck('doubleForfeit')}});
 try{f.w.document.getElementById('spinBtn').click();await wait(750);const id=f.session().pendingForfeit.item.id;
  f.w.document.getElementById('temptFateBtn').click();f.w.document.getElementById('fateV4Continue').click();
  assert.equal(f.session().history.length,0,'Retained original waits for acceptance too');
  await finish(f);assert.equal(f.session().history[0].id,id);assert.equal(f.session().history.length,2);
 }finally{f.close();}}
 {const f=await setup({...base,settings:{fateDeck:deck('devilFive')}},{page:'edit.html'});try{
  const input=f.w.document.querySelector('[data-card=sealedEnvelopes]');input.value=3;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  const hint=f.w.document.getElementById('envelopeHint');hint.value='group';hint.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  f.w.document.getElementById('applyBtn').click();await wait(80);
  const M=f.w.FortuneModel,cfg=M.loadConfig(),round=M.xmlToConfig(M.configToXml(cfg));
  assert.equal(round.settings.fateDeck.sealedEnvelopes,3);assert.equal(round.settings.reveals.envelopeHint,'group');
 }finally{f.close();}}
 console.log('PASS: direct draws, fixed random group, unique selection, reload/resume, paused timers, retained original and editor/XML options.');
})().catch(error=>{console.error(error);process.exitCode=1});
