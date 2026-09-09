(() => {
  let running = false;
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  window.FortuneBatchReveal = { async open({ count, title, groupId = '', lowest = false, keepCurrent = false, replaceCurrent = false, excludeCurrent = false, randomGroup = false }) {
    if (running) return;
    const P = window.FortunePlay;
    const exclude = excludeCurrent && P.pendingItem() ? [P.pendingItem().id] : [];
    if (replaceCurrent && !P.candidates(exclude,groupId).length) {
      const notice = document.getElementById('resultUnlockNotice') || document.getElementById('resultDescription');
      if (notice) { notice.hidden=false;notice.textContent='No eligible replacement is available. Your original result is still pending.'; }
      return;
    }
    const start = P.beginDirect(keepCurrent,replaceCurrent);
    if (!start) return;
    running = true;
    if (randomGroup) { const ids=[...new Set(P.candidates(start.original ? [start.original.id] : []).map(item=>item.levelId))];groupId=ids[Math.floor(Math.random()*ids.length)] || '__none__'; }
    const overlay = document.createElement('div'); overlay.className = 'batch-overlay';
    const dialog = document.createElement('section'); dialog.className = 'batch-dialog'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','batchTitle');
    const heading = document.createElement('h2'); heading.id = 'batchTitle'; heading.textContent = groupId ? `${title} · ${P.candidates([],groupId)[0]?.groupName || 'Group'}` : title;
    const status = document.createElement('p'); status.setAttribute('role','status');
    const list = document.createElement('div'); list.className = 'batch-results';
    const close = document.createElement('button'); close.className = 'btn primary large'; close.textContent = 'Revealing…'; close.disabled = true;
    dialog.append(heading,status,list,close); overlay.append(dialog); document.body.append(overlay);
    heading.tabIndex = -1; heading.focus();
    const timers = new Set();
    const shown = [];
    function add(item, original = false) {
      const card = document.createElement('article'); card.className = 'batch-forfeit'; card.style.setProperty('--batch-color',item.color);
      const number = document.createElement('small'); number.textContent = original ? 'CURRENT FORFEIT' : `REVEAL ${shown.length}`;
      const name = document.createElement('h3'); name.textContent = `${item.icon || '✦'} ${item.name}`;
      const description = document.createElement('p'); description.textContent = item.description || 'Selected from the active wheel.';
      card.append(number,name,description);
      if (!original) { const remaining=document.createElement('small');remaining.textContent=item.removedFromWheel ? 'Removed from the wheel' : item.remainingSelections != null ? `${item.remainingSelections} selection(s) remaining` : 'Repeatable forfeit: stays on the wheel';card.append(remaining); }
      if (item.timerSeconds > 0) {
        let remaining = item.timerSeconds, deadline = 0, interval = null;
        const button = document.createElement('button'); button.className = 'btn ghost';
        const label = () => { const time = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`; button.textContent = remaining ? `${interval ? 'Pause' : 'Start'} · ${time}` : 'Timer finished'; };
        button.onclick = () => {
          if (interval) { clearInterval(interval); timers.delete(interval); interval = null; label(); return; }
          deadline = Date.now()+remaining*1000;
          interval = setInterval(() => { remaining = Math.max(0,Math.ceil((deadline-Date.now())/1000)); if (!remaining) {clearInterval(interval);timers.delete(interval);interval=null;button.disabled=true;} label(); },200); timers.add(interval); label();
        }; label(); card.append(button);
      }
      list.append(card); card.scrollIntoView?.({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
    if (start.original) { shown.push(start.original.id); add(start.original,true); }
    const keys = event => {
      if (document.querySelector('.modifier-overlay')) return;
      if (event.key === 'Escape') { event.stopImmediatePropagation(); if (!close.disabled) close.click(); }
      if (event.key === 'Tab') {
        const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
        if (!buttons.length) {event.preventDefault();return;}
        if (event.shiftKey && (document.activeElement===buttons[0] || document.activeElement===heading)) {event.preventDefault();buttons.at(-1).focus();}
        else if (!event.shiftKey && document.activeElement===buttons.at(-1)) {event.preventDefault();buttons[0].focus();}
      }
    };
    document.addEventListener('keydown',keys,true);
    close.onclick = () => { timers.forEach(clearInterval);document.removeEventListener('keydown',keys,true);overlay.remove();running=false;P.endDirect();document.getElementById('spinBtn').focus(); };
    let revealed = 0;
    try {
      for (let i=0;i<count;i++) {
        status.textContent = `Revealing ${i+1} of ${count}…`;
        const sealed=document.createElement('div');sealed.className='batch-sealed';sealed.textContent=`✦  Fate ${i+1} is sealed…`;list.append(sealed);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { await pause(title.includes('Devil') ? 2300 : 1600);sealed.textContent='Revealing…';await pause(650); }
        sealed.remove();
        const result = await P.drawDirect([...shown,...exclude],groupId,lowest,title);
        if (!result) break;
        shown.push(result.item.id); revealed++; add(result.item);
      }
      status.textContent = revealed < count ? `Revealed ${revealed} of ${count} requested: no more different eligible forfeits are available.` : `${shown.length} forfeits revealed. No extra wheel spins.`;
    } catch(error) { console.error(error);status.textContent='The reveal stopped. Results already shown have been saved.'; }
    finally {close.disabled=false;close.textContent='Done';close.focus();}
  } };
})();
