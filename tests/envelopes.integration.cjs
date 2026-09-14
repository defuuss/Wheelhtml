const assert=require('node:assert/strict');
const {setup,deck,wait}=require('./helpers.cjs');
const config={settings:{fateDeck:deck('sealedEnvelopes'),reveals:{envelopeCount:3,envelopeHint:'none',envelopeGroups:['a']}},
levels:[{id:'a',activeAtStart:true},{id:'b',activeAtStart:false}],
forfeits:Array.from({length:4},(_,i)=>({id:'e'+i,name:'Secret title '+i,description:'Secret description '+i,levelId:i<3?'a':'b',unlockLevels:['b'],lifetime:{type:'once'}}))};
(async()=>{
 const f=await setup(config);let saved,ids;try{
  f.w.FortuneFateDeck.drawFromWheel();f.w.document.getElementById('fateV4Continue').click();
  const buttons=f.w.document.querySelectorAll('.fate-envelope');assert.equal(buttons.length,3);
  assert.ok(!f.w.document.querySelector('.envelope-table').textContent.includes('Secret'));
  ids=Array.from(f.session().revealBatch.entries,x=>x.item.id);assert.equal(new Set(ids).size,3);
  buttons[1].click();buttons[2].click();await wait(40);
  assert.equal(f.session().revealBatch.chosen,1);
  assert.equal(f.session().history.length,0);assert.equal(f.session().activeLevels.b,false);
  saved=f.saved();
 }finally{f.close();}
 const g=await setup(config,{saved});try{
  assert.equal(g.session().revealBatch.chosen,1);
  assert.equal(g.w.document.querySelectorAll('.fate-envelope').length,0);
  assert.equal(g.w.document.querySelector('.batch-forfeit h3').textContent,'Secret title '+ids[1].slice(1));
  g.w.document.getElementById('batchAccept').click();
  assert.deepEqual(Array.from(g.session().history,x=>x.id),[ids[1]]);
  assert.equal(g.session().activeLevels.b,true);
  ids.filter(id=>id!==ids[1]).forEach(id=>assert.equal(g.session().runtime[id].removed,false));
  assert.deepEqual(g.errors,[]);
 }finally{g.close();}
 {const empty=await setup({...config,settings:{...config.settings,reveals:{envelopeGroups:['b']}}});try{
  empty.w.FortuneFateDeck.drawFromWheel();empty.w.document.getElementById('fateV4Continue').click();
  assert.equal(empty.session().revealBatch,undefined);assert.equal(empty.session().history.length,0);
 }finally{empty.close();}}
 console.log('PASS: envelopes conceal titles, reserve unique eligible outcomes, lock one choice, restore that choice, and commit only the accepted envelope.');
})().catch(error=>{console.error(error);process.exitCode=1});
