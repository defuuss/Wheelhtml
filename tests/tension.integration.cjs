const assert=require('node:assert/strict');
const {setup,deck,next,wait}=require('./helpers.cjs');

const base={levels:[{id:'start',name:'Start',activeAtStart:true}],
 forfeits:Array.from({length:4},(_,i)=>({id:'test-'+i,name:'Challenge '+i,levelId:'start',weight:1,timerSeconds:0,lifetime:{type:'forever'}}))};

(async()=>{
  // A surprise draw occurs once, after the ordinary challenge has been committed.
  // Giving up/losing the mini-game adds exactly one additional challenge.
  const f=await setup({...base,settings:{fateSurprise:'rare',fateDeck:deck('miniGame',1)}});
  let saved;
  try{
    // jsdom does not provide native HTMLDialogElement.showModal/close.
    f.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    f.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new f.w.Event('close'));};
    f.w.Math.random=()=>0;
    assert.match(f.w.document.getElementById('fateOmenDetail').textContent,/4% chance/);
    f.w.document.getElementById('spinBtn').click();await wait(750);
    assert.equal(f.session().history.length,1);
    f.w.document.getElementById('resultCloseBtn').click();await wait(380);
    assert.equal(f.session().cardState.fateCooldown,2);
    assert.equal(f.w.document.getElementById('fateV4Card').dataset.kind,'minigame');
    f.w.document.getElementById('fateV4Continue').click();
    assert.equal(f.w.document.querySelector('.arcade-dialog').open,true);
    [...f.w.document.querySelectorAll('.arcade-actions button')].find(node=>node.textContent.includes('Lower')).click();
    assert.match(f.w.document.querySelector('.arcade-body').textContent,/additional wheel challenge/);
    [...f.w.document.querySelectorAll('.arcade-actions button')].find(node=>node.textContent==='Continue').click();
    await wait(220);
    assert.equal(f.session().history.length,1,'the penalty must not count until revealed');
    assert.equal(f.session().revealBatch.entries.length,1);
    await next(f);
    assert.equal(f.session().history.length,2);
    f.w.document.getElementById('batchDone').click();
    assert.equal(JSON.parse(f.w.localStorage.getItem('fortune-fate-deck-v4')).pendingExtraSpins,0);
    saved=f.saved();assert.deepEqual(f.errors,[]);
  }finally{f.close();}
  const restored=await setup({...base,settings:{fateSurprise:'rare',fateDeck:deck('miniGame',1)}},{saved});
  try{
    await wait(140);
    assert.equal(restored.session().history.length,2,'reload must not replay the mini-game penalty');
    assert.equal(restored.session().revealBatch,undefined);
    assert.deepEqual(restored.errors,[]);
  }finally{restored.close();}

  // The wager presents explicit odds and persists the result before Continue.
  for(const [roll,expected] of [[.99,'wagerLose'],[0,'wagerWin']]){
    const g=await setup({...base,settings:{fateSurprise:'off',fateDeck:deck('pickYourPoison',1)}});
    try{
      g.w.Math.random=()=>roll;
      g.w.FortuneFateDeck.drawFromWheel();
      g.w.document.getElementById('fateV4ChoiceWager').click();
      assert.equal(JSON.parse(g.w.localStorage.getItem('fortune-fate-deck-v4')).draw.action,expected);
      g.w.document.getElementById('fateV4Continue').click();
      await wait(150);
      if(expected==='wagerLose')assert.equal(g.session().revealBatch.entries.length,1);
      else {assert.equal(g.session().cardState.miniLuck,1);assert.equal(g.session().revealBatch,undefined);}
      assert.deepEqual(g.errors,[]);
    }finally{g.close();}
  }

  const editor=await setup({...base,settings:{fateSurprise:'frequent'}},{page:'edit.html'});
  try{
    assert.equal(editor.w.document.getElementById('fateSurprise').value,'frequent');
    const M=editor.w.FortuneModel,cfg=M.loadConfig();
    assert.equal(M.xmlToConfig(M.configToXml(cfg)).settings.fateSurprise,'frequent');
    assert.deepEqual(editor.errors,[]);
  }finally{editor.close();}
  console.log('PASS: rare Fate surprises, mini-game penalties, saved wagers, no reload repeats and editor/XML frequency settings.');
})().catch(error=>{console.error(error);process.exitCode=1});
