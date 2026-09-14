(() => {
  'use strict';
  const P=window.FortunePlay, R=window.FortuneRevealState;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let overlay=null, busy=false, token=0, ticker=null, previousFocus=null;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,cls,fn)=>{const node=el('button',cls,text);node.type='button';node.onclick=fn;return node;};
  const save=()=>P.saveReveal();
  const current=()=>P.batch();
  const format=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  function pauseTimers(batch) {
    batch.entries.forEach(entry=>{if(entry.timer){entry.timer.remaining=R.remaining(entry.timer);entry.timer.deadline=0;}});
  }
  function pause() {
    const batch=current();if(!batch)return;
    batch.paused=true;token++;busy=false;pauseTimers(batch);save();render();
  }
  function resume() {
    const batch=current();if(!batch)return;
    batch.paused=false;save();render();
    const entry=R.next(batch);
    if(entry?.status==='revealing') reveal(entry);
  }
  function keys(event) {
    if(!overlay || document.querySelector('.modifier-overlay'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();pause();return;}
    if(event.key==='Tab'){
      const nodes=[...overlay.querySelectorAll('button:not(:disabled)')].filter(node=>!node.hidden);
      if(!nodes.length){event.preventDefault();return;}
      if(event.shiftKey && (document.activeElement===nodes[0] || !nodes.includes(document.activeElement))){event.preventDefault();nodes.at(-1).focus();}
      else if(!event.shiftKey && (document.activeElement===nodes.at(-1) || !nodes.includes(document.activeElement))){event.preventDefault();nodes[0].focus();}
    }
  }
  function mount() {
    if(overlay)return;
    previousFocus=document.activeElement;
    overlay=el('div','batch-overlay');
    document.body.append(overlay);
    document.addEventListener('keydown',keys,true);
    document.querySelector('main').inert=true;
    document.querySelector('header').inert=true;
    ticker=setInterval(()=>{
      if(!overlay)return;
      overlay.querySelectorAll('[data-timer-key]').forEach(node=>{
        const entry=current()?.entries.find(x=>x.key===node.dataset.timerKey);if(!entry?.timer)return;
        const seconds=R.remaining(entry.timer);
        node.textContent=(seconds===0?'Finished':entry.timer.deadline?'Pause timer':'Start timer')+' · '+format(seconds);
        if(!seconds && entry.timer.deadline){entry.timer.remaining=0;entry.timer.deadline=0;save();}
      });
    },250);
  }
  function close() {
    if(!current() || R.next(current()))return;
    pauseTimers(current());save();
    if(!P.endDirect())return;
    token++;clearInterval(ticker);document.removeEventListener('keydown',keys,true);
    overlay?.remove();overlay=null;busy=false;
    document.querySelector('main').inert=false;document.querySelector('header').inert=false;
    (previousFocus?.isConnected ? previousFocus : document.getElementById('spinBtn')).focus();
    window.dispatchEvent(new Event('fortune-reveal-complete'));
  }
  function hint(item,batch) {
    if(batch.hint==='group')return item.groupName;
    if(batch.hint==='duration')return !item.timerSeconds?'Untimed':item.timerSeconds<=60?'Up to 1 minute':item.timerSeconds<=300?'1–5 minutes':'Over 5 minutes';
    return 'A sealed possibility';
  }
  function resolve(accept) {
    const batch=current(), entry=batch && R.next(batch);
    if(busy || batch?.paused || entry?.status!=='revealed')return;
    P.resolveEntry(entry,accept);render();
    const next=R.next(batch);
    if(batch.autoplay && next?.status==='sealed')reveal(next);
  }
  async function choose(index) {
    const batch=current();if(busy || batch?.paused || !R.chooseEnvelope(batch,index))return;
    batch.entries[index].status='revealing';save();
    overlay.querySelectorAll('.fate-envelope').forEach((node,i)=>node.classList.add(i===index?'chosen':'unchosen'));
    overlay.querySelectorAll('.fate-envelope').forEach(node=>node.disabled=true);
    const mine=++token;busy=true;
    await wait(reduced()?0:1800);
    if(mine!==token)return;
    busy=false;render();await reveal(batch.entries[index]);
  }
  async function reveal(entry) {
    const batch=current();if(!batch || busy || batch.paused || !['sealed','revealing'].includes(entry?.status))return;
    busy=true;entry.status='revealing';batch.view=batch.entries.indexOf(entry);save();
    const mine=++token;render();
    await wait(reduced()?0:batch.envelopes?400:batch.groupId?1500:1000);
    if(mine!==token)return;
    try{await P.revealEntry(entry);}
    catch(error){entry.status='sealed';save();console.error('Reveal could not finish',error);}
    if(mine!==token)return;
    busy=false;render();
  }
  function render() {
    const batch=current();if(!batch || !overlay)return;
    const focusKey=document.activeElement?.dataset?.focus;
    overlay.replaceChildren();
    const dialog=el('section','batch-dialog midnight-reveal');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','batchTitle');
    const top=el('div','reveal-topline');
    top.append(el('span','section-kicker',batch.envelopes?'THE SEALED COLLECTION':'A CHAPTER OF FATE'),button(batch.paused?'Resume':'Pause','btn ghost reveal-pause',batch.paused?resume:pause));
    const title=el('h2','',batch.title);title.id='batchTitle';
    const summary=el('p','reveal-summary');summary.setAttribute('role','status');
    const resolved=batch.entries.filter(x=>['accepted','declined','unavailable'].includes(x.status)).length;
    const total=batch.envelopes?1:batch.entries.length;
    summary.textContent=batch.paused?'Paused. Your results and timers are saved.':batch.envelopes && batch.chosen===null?'Choose a seal. Only your chosen result can be accepted.':resolved+' of '+total+' resolved'+(batch.groupId?' · '+(batch.entries.find(x=>x.key!=='original')?.item.groupName || 'Selected group'):'');
    dialog.append(top,title,summary);
    if(batch.paused){
      const paused=el('div','reveal-paused');paused.append(el('span','seal-emblem','Ⅱ'),el('h3','','Take your time'),el('p','','Nothing progresses while paused.'),button('Resume reveal','btn primary large',resume));
      dialog.append(paused);
    } else if(batch.envelopes && batch.chosen===null){
      const row=el('div','envelope-table');
      batch.entries.forEach((entry,index)=>{
        const envelope=button('','fate-envelope',()=>choose(index));envelope.dataset.focus='envelope-'+index;envelope.style.setProperty('--deal-index',index);
        envelope.setAttribute('aria-label','Choose envelope '+(index+1)+'. '+hint(entry.item,batch));
        const paper=el('span','envelope-paper');paper.setAttribute('aria-hidden','true');paper.append(el('span','','✦'));
        const flap=el('span','envelope-flap');flap.setAttribute('aria-hidden','true');
        const seal=el('span','envelope-seal',String(index+1));seal.setAttribute('aria-hidden','true');
        const label=el('span','envelope-caption');label.append(el('strong','','Envelope '+(index+1)),el('small','',hint(entry.item,batch)));
        envelope.append(paper,el('span','envelope-pocket'),flap,seal,label);row.append(envelope);
      });
      dialog.append(row);
      if(batch.entries.length<2)dialog.append(el('p','muted','Only one eligible result is available for this envelope draw.'));
    } else {
      const entry=batch.entries[batch.view] || R.next(batch) || batch.entries.at(-1);
      const stage=el('div','reveal-stage batch-results');
      if(entry && ['sealed','revealing'].includes(entry.status)){
        const sealed=el('div','batch-sealed reveal-sealed'+(busy?' opening':''));
        sealed.append(el('span','seal-emblem','✦'),el('span','',busy?'The seal is opening…':'Your next fate is sealed'));
        stage.append(sealed);
      } else if(entry){
        const card=el('article','batch-forfeit reveal-face');card.style.setProperty('--batch-color',entry.item.color);
        card.append(el('small','',entry.status==='revealed'?'AWAITING YOUR ACCEPTANCE':entry.status.toUpperCase()),el('div','reveal-sigil',entry.item.icon || '✦'),el('h3','',entry.item.name),el('p','',entry.item.description || 'Your selected fate.'));
        if(entry.status==='revealed')card.append(el('p','reveal-pending-note','No uses, unlocks or completion changes until you accept.'));
        if(entry.status==='accepted'){
          const type=entry.item.lifetime?.type;
          card.append(el('small','',type==='forever'?'Repeatable entry':type==='spins'?'One selection used':'Removed from the wheel'));
        }
        if(entry.timer){
          const timer=button((entry.timer.deadline?'Pause timer':'Start timer')+' · '+format(R.remaining(entry.timer)),'btn ghost',()=>{
            const seconds=R.remaining(entry.timer);entry.timer.remaining=seconds;entry.timer.deadline=entry.timer.deadline?0:seconds?Date.now()+seconds*1000:0;save();render();
          });timer.dataset.timerKey=entry.key;timer.dataset.focus='timer';card.append(timer);
        }
        stage.append(card);
      }
      dialog.append(stage);
      const slots=el('div','reveal-slots');
      batch.entries.filter(x=>x.status!=='discarded').forEach((entry,index)=>{
        const hidden=['sealed','revealing'].includes(entry.status);
        const slot=button('','reveal-slot '+entry.status,()=>{batch.view=batch.entries.indexOf(entry);save();render();});
        slot.disabled=hidden || busy;slot.setAttribute('aria-label',hidden?'Sealed result '+(index+1):entry.item.name+', '+entry.status);
        slot.append(el('span','',hidden?'✦':entry.status==='accepted'?'✓':entry.status==='declined'?'−':'◇'),el('small','',hidden?String(index+1):entry.item.name));
        slots.append(slot);
      });dialog.append(slots);
      const controls=el('div','reveal-controls'), next=R.next(batch);
      if(next?.status==='revealed'){
        if(entry!==next)controls.append(button('Return to pending result','btn primary',()=>{batch.view=batch.entries.indexOf(next);save();render();}));
        else {
          const accept=button('Accept result','btn primary large',()=>resolve(true));accept.id='batchAccept';accept.dataset.focus='accept';
          const decline=button('Decline','btn ghost large',()=>resolve(false));decline.id='batchDecline';
          controls.append(accept,decline);
        }
      } else if(next){
        const nextButton=button(busy?'Revealing…':'Reveal next','btn primary large',()=>reveal(next));
        nextButton.id='batchNext';nextButton.disabled=busy;nextButton.dataset.focus='next';controls.append(nextButton);
      } else {
        const done=button('Done','btn primary large',close);done.id='batchDone';done.dataset.focus='done';controls.append(done);
        if(!batch.envelopes && batch.entries.length<batch.requested)dialog.append(el('p','muted','Only '+batch.entries.length+' of '+batch.requested+' eligible, different results were available.'));
        if(batch.entries.some(x=>x.timer))dialog.append(el('p','muted','Done pauses the timers and closes these results.'));
      }
      dialog.append(controls);
    }
    const end=button('End remaining reveals','btn ghost reveal-end',()=>{
      token++;busy=false;pauseTimers(batch);
      batch.entries.forEach(entry=>{if(!['accepted','declined','discarded','unavailable'].includes(entry.status))entry.status='declined';});
      if(batch.envelopes && batch.chosen===null)batch.chosen=0;
      batch.paused=false;save();render();
    });end.disabled=busy;dialog.append(end);
    overlay.append(dialog);
    const focus=focusKey && [...dialog.querySelectorAll('[data-focus]')].find(node=>node.dataset.focus===focusKey && !node.disabled);
    (focus || dialog.querySelector('#batchAccept,#batchNext,#batchDone') || dialog.querySelector('.fate-envelope,.reveal-paused button') || dialog.querySelector('.reveal-pause'))?.focus();
  }
  window.FortuneBatchReveal={
    open(options){if(current())return;const batch=P.startBatch(options);if(!batch)return;mount();render();if(batch.autoplay && !batch.envelopes && R.next(batch)?.status==='sealed')reveal(R.next(batch));},
    resume(){if(!current())return;mount();render();if(!current().paused && R.next(current())?.status==='revealing')reveal(R.next(current()));}
  };
  if(current())window.FortuneBatchReveal.resume();
})();
