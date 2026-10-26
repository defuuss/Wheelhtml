const assert=require('node:assert/strict');
const {setup,wait}=require('./helpers.cjs');
(async()=>{
 for(const direct of [false,true]){
  const config={levels:[{id:'a',activeAtStart:true,completionUnlockLevels:['b']},{id:'b'}],forfeits:[{id:'repeat',name:'Three times',levelId:'a',lifetime:{type:'spins',spins:3}},{id:'next',levelId:'b'}]};
  const f=await setup(config);try{
   for(let n=1;n<=3;n++){
    if(direct){f.w.FortuneFateDeck.drawFromWheel();f.w.document.getElementById('fateV4Continue').click();f.w.document.getElementById('batchNext').click();await wait(30);}
    else{f.w.document.getElementById('spinBtn').click();await wait(750);}
    assert.equal(f.session().runtime.repeat.remainingSpins,3-n,'Reveal commits exactly one use');
    assert.equal(f.session().history.length,n);
    assert.equal(f.w.document.getElementById('batchAccept'),null);
    f.w.document.getElementById(direct?'batchDone':'resultCloseBtn').click();
    assert.equal(f.session().history.length,n,'Closing does not commit again');
    assert.equal(Boolean(f.session().completedLevels.a),n===3);
    assert.equal(Boolean(f.session().activeLevels.b),n===3);
   }assert.deepEqual(f.errors,[]);
  }finally{f.close();}
 }
 const config={levels:[{id:'a',activeAtStart:true}],forfeits:[{id:'timed',name:'Timed',levelId:'a',timerSeconds:60,lifetime:{type:'spins',spins:3}}]};
 let saved;
 const f=await setup(config);try{
  f.w.document.getElementById('spinBtn').click();await wait(750);
  assert.equal(f.session().history.length,1);assert.equal(f.session().pendingForfeit,undefined);
  assert.equal(f.w.document.getElementById('timerStartPause').disabled,false);
  assert.equal(f.w.document.getElementById('resultCloseBtn').textContent,'Continue');
  f.w.document.getElementById('timerStartPause').click();saved=f.saved();
 }finally{f.close();}
 const g=await setup(config,{saved});try{
  assert.equal(g.session().history.length,1,'Reload does not duplicate the automatic result');
  assert.equal(g.w.document.getElementById('resultOverlay').hidden,false);
  assert.equal(g.w.document.getElementById('timerStartPause').textContent,'Pause');
  g.w.document.getElementById('resultCloseBtn').click();
  g.w.document.getElementById('undoBtn').click();
  assert.equal(g.session().history.length,0);assert.equal(g.session().runtime.timed.remainingSpins,3);
  assert.deepEqual(g.errors,[]);
 }finally{g.close();}
 console.log('PASS: automatic wheel and batch results, finite uses, unchanged unlock rules, timer recovery, reload idempotence and undo.');
})().catch(error=>{console.error(error);process.exitCode=1});
