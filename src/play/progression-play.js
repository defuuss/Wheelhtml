(() => {
  'use strict';
  const M=window.FortuneModel, root=document.getElementById('levelLights');
  if(!root)return;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function render(){
    const config=M.loadConfig(),session=M.loadSession(config);
    root.replaceChildren();
    config.levels.forEach(level=>{
      const members=config.forfeits.filter(item=>item.enabled && item.levelId===level.id);
      const remaining=members.filter(item=>!session.runtime[item.id]?.removed || session.runtime[item.id]?.dependencyLocked);
      const completed=Boolean(session.completedLevels?.[level.id]),active=Boolean(session.activeLevels[level.id]);
      const card=el('div','level-light '+(completed?'completed':active?'active':'locked'));
      card.style.setProperty('--level-color',level.color);
      const row=el('div','chapter-row');row.append(el('span','level-dot',level.icon),el('strong','',level.name),el('b','',completed?'DONE':active?'ACTIVE':'LOCKED'));
      const meter=el('div','chapter-progress'),fill=el('span','');
      const gone=members.length-remaining.length,percent=completed?100:members.length?gone/members.length*100:0;
      fill.style.width=percent+'%';meter.append(fill);
      meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',level.name+' entries exhausted');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(Math.max(1,members.length)));meter.setAttribute('aria-valuenow',String(gone));
      let uses=0,repeatable=0;
      remaining.forEach(item=>{if(item.lifetime.type==='forever')repeatable++;else uses+=item.lifetime.type==='spins'?Math.max(0,session.runtime[item.id]?.remainingSpins ?? item.lifetime.spins):1;});
      const detail=completed?'Chapter complete':remaining.length+' entries · '+uses+' finite selections left'+(repeatable?' · '+repeatable+' repeatable':'')+(level.completionMode==='required'?' · milestone completion':'');
      card.append(row,meter,el('small','chapter-detail',detail));root.append(card);
    });
    const effects=document.getElementById('sessionEffects');effects.replaceChildren();
    const changed=Object.values(session.runtime).filter(r=>r.weightMultiplier!==1).length;
    const cooling=Object.values(session.runtime).filter(r=>r.cooldown>0 && !r.removed).length;
    if(changed)effects.append(el('span','effect-pill','Weights altered · '+changed+' entries'));
    if(cooling)effects.append(el('span','effect-pill','Cooling down · '+cooling));
    if(session.revealBatch)effects.append(el('span','effect-pill','Reveal in progress'));
    effects.hidden=!effects.children.length;
    const accept=document.getElementById('resultCloseBtn');accept.textContent=session.pendingForfeit?'Accept':'Done';
    accept.hidden=false;
  }
  window.addEventListener('fortune-state-change',render);
  window.addEventListener('fortune-result-committed',({detail})=>{
    const names=detail.outcome.unlocked || [];
    if(names.length){document.getElementById('stateTitle').textContent='New chapter unlocked';document.getElementById('stateText').textContent=names.join(' · ');}
  });
  render();
})();
