const assert=require('node:assert/strict');
const {setup,deck,next,finish,wait}=require('./helpers.cjs');
const replacement={levels:[{id:'a',activeAtStart:true},{id:'b',activeAtStart:false}],forfeits:[
 {id:'rare',name:'Rare',weight:1,levelId:'a',lifetime:{type:'once'}},
 {id:'original',name:'Original',weight:10,levelId:'a',unlockLevels:['b'],lifetime:{type:'once'}},
 {id:'locked',name:'Locked',weight:.1,levelId:'b'}],rules:[]};
(async()=>{
 for(const direct of [false,true]){
  const config={levels:[{id:'a',activeAtStart:true,completionUnlockLevels:['b']},{id:'b'}],forfeits:[{id:'repeat',name:'Three times',levelId:'a',lifetime:{type:'spins',spins:3}},{id:'next',levelId:'b'}]};
  const f=await setup(config);try{
   for(let n=1;n<=3;n++){
    if(direct){f.w.FortuneFateDeck.drawFromWheel();f.w.document.getElementById('fateV4Continue').click();f.w.document.getElementById('batchNext').click();await wait(20);}
    else{f.w.document.getElementById('spinBtn').click();await wait(750);}
    assert.equal(f.session().runtime.repeat.remainingSpins,4-n,'Revealing never consumes a selection');
    f.w.document.getElementById(direct?'batchAccept':'resultCloseBtn').click();
    if(direct)f.w.document.getElementById('batchDone').click();
    assert.equal(f.session().runtime.repeat.remainingSpins,3-n);
    assert.equal(Boolean(f.session().completedLevels.a),n===3);
    assert.equal(Boolean(f.session().activeLevels.b),n===3);
   }
   assert.deepEqual(f.errors,[]);
  }finally{f.close();}
 }
 for(const accept of [true]){
  const f=await setup(replacement);try{
   f.w.document.getElementById('spinBtn').click();await wait(750);
   assert.equal(f.session().pendingForfeit.item.id,'original');
   f.w.document.getElementById('temptFateBtn').click();f.w.document.getElementById('fateV4Continue').click();
   assert.equal(f.session().history.length,0);
   f.w.document.getElementById('batchNext').click();await wait(20);
   assert.equal(f.session().history.length,0);
   const saved=f.saved();f.close();
   const g=await setup(replacement,{saved});try{
    assert.equal(g.w.document.getElementById('batchAccept').textContent,'Accept result');
    const button=g.w.document.getElementById(accept?'batchAccept':'batchDecline');button.click();button.click();
    assert.equal(g.session().history.length,accept?1:0,'Double click and reload cannot duplicate a commit');
    assert.equal(g.session().runtime.rare.removed,accept);
    assert.equal(g.session().runtime.original.removed,false);
    assert.equal(g.session().activeLevels.b,false,'Discarded original never unlocks a group');
    assert.deepEqual(g.errors,[]);
   }finally{g.close();}
  }finally{f.close();}
 }
 {const f=await setup(replacement);try{
  f.w.document.getElementById('spinBtn').click();await wait(750);
  assert.equal(f.w.document.getElementById('resultDeclineBtn'),null);
  assert.equal(f.session().history.length,0);
  f.w.document.getElementById('temptFateBtn').click();f.w.document.getElementById('fateV4Continue').click();
  assert.equal(f.w.document.getElementById('batchDecline'),null);
  assert.equal(f.w.document.querySelector('.reveal-end'),null);
  assert.equal(f.session().history.length,0);
 }finally{f.close();}}
 {const f=await setup(replacement);let saved;try{
  f.w.document.getElementById('spinBtn').click();await wait(750);
  f.w.document.getElementById('temptFateBtn').click();saved=f.saved();
 }finally{f.close();}
 const g=await setup(replacement,{saved});try{
  assert.equal(g.w.document.getElementById('fateDeckOverlayV4').hidden,false,'An unfinished Fate card restores on reload');
  assert.equal(g.w.FortunePlay.canTakeCard(),false);
  g.w.document.getElementById('fateV4Continue').click();await next(g);
  assert.deepEqual(Array.from(g.session().history,x=>x.id),['rare']);
 }finally{g.close();}}
 console.log('PASS: shared acceptance, no decline controls, replacement isolation, three-use exhaustion, pending card recovery and duplicate-commit guards.');
})().catch(error=>{console.error(error);process.exitCode=1});
