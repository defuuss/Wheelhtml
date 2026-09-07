(() => {
  'use strict';

  if (window.__fortuneEditorVisualImprovementsV2) return;
  window.__fortuneEditorVisualImprovementsV2 = true;

  const D = window.FortuneDependencyState;
  const list = document.getElementById('forfeitEditorList');
  const body = document.body;
  if (!list) return;

  let scheduled = false;
  let activeCard = null;
  let rebuilding = false;

  const cards = () => [...list.querySelectorAll('.forfeit-editor-card[data-id]')];
  const clean = value => String(value ?? '').trim();
  const nameOf = card => clean(card?.querySelector('.js-name')?.value) || card?.dataset?.id || 'Forfeit';
  const iconOf = card => clean(card?.querySelector('.js-icon')?.value) || '🎯';
  const pathInspectionEnabled = () => !!body?.classList.contains('editor-advanced-mode');

  function cardMap() { return new Map(cards().map(card => [card.dataset.id, card])); }
  function depState(id) {
    try {
      const raw = D?.getForfeit?.(id) || {};
      return { mode: raw.requiresMode === 'any' ? 'any' : 'all', requires: [...new Set((raw.requiresForfeitIds || []).filter(Boolean))] };
    } catch (_) { return { mode:'all', requires:[] }; }
  }
  function reverseMap(byId) {
    const reverse = new Map([...byId.keys()].map(id => [id, []]));
    byId.forEach((_, id) => depState(id).requires.forEach(ref => { if (reverse.has(ref)) reverse.get(ref).push(id); }));
    return reverse;
  }
  function collectUpstream(id, byId, found = new Set()) {
    depState(id).requires.forEach(ref => { if (byId.has(ref) && !found.has(ref)) { found.add(ref); collectUpstream(ref, byId, found); } });
    return found;
  }
  function collectDownstream(id, reverse, found = new Set()) {
    (reverse.get(id) || []).forEach(ref => { if (!found.has(ref)) { found.add(ref); collectDownstream(ref, reverse, found); } });
    return found;
  }

  function clearPathHighlight() {
    list.querySelectorAll('.dep-visual-focus,.dep-visual-prereq,.dep-visual-dependent,.dep-visual-dim')
      .forEach(card => card.classList.remove('dep-visual-focus','dep-visual-prereq','dep-visual-dependent','dep-visual-dim'));
    list.querySelectorAll('.forfeit-group.dep-path-active').forEach(group => group.classList.remove('dep-path-active'));
    activeCard = null;
  }

  function highlightPath(card) {
    if (!pathInspectionEnabled() || !card?.dataset?.id) { clearPathHighlight(); return; }
    const byId = cardMap();
    const reverse = reverseMap(byId);
    const id = card.dataset.id;
    const upstream = collectUpstream(id, byId);
    const downstream = collectDownstream(id, reverse);
    const group = card.closest('.forfeit-group');
    clearPathHighlight();
    activeCard = card;
    card.classList.add('dep-visual-focus');
    group?.classList.add('dep-path-active');
    upstream.forEach(ref => byId.get(ref)?.classList.add('dep-visual-prereq'));
    downstream.forEach(ref => byId.get(ref)?.classList.add('dep-visual-dependent'));
    if (group) {
      const related = new Set([id, ...upstream, ...downstream]);
      group.querySelectorAll('.forfeit-editor-card[data-id]').forEach(other => {
        if (!related.has(other.dataset.id)) other.classList.add('dep-visual-dim');
      });
    }
  }

  function checkedUnlockNames(card) {
    return [...card.querySelectorAll('.js-unlock-checks label')]
      .filter(label => label.querySelector('input')?.checked)
      .map(label => clean(label.querySelector('span')?.textContent)).filter(Boolean);
  }
  function eventLabel(value) {
    return ({ spinAgain:'↻ Spin again', unlock:'🔓 Unlock event', doubleSpin:'×2 Double spin', immunity:'🛡 Immunity', randomize:'🎲 Randomize', goodCard:'🟢 Fate draw', badCard:'🔴 Fate draw', doubleOrNothing:'🟡 Fate draw' })[value] || '';
  }
  function formatTimer(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    if (!value) return '';
    const min = Math.floor(value / 60), sec = value % 60;
    return min ? `${min}m${sec ? ` ${sec}s` : ''}` : `${sec}s`;
  }

  function statusData(card, byId, reverse) {
    const id = card.dataset.id;
    const state = depState(id);
    const dependentIds = reverse.get(id) || [];
    const reqNames = state.requires.map(ref => {
      const source = byId.get(ref);
      return source ? `${iconOf(source)} ${nameOf(source)}` : ref;
    });
    return {
      weight: Number(card.querySelector('.js-weight')?.value || 0),
      mode: state.mode,
      reqNames,
      dependentNames: dependentIds.map(ref => nameOf(byId.get(ref))).filter(Boolean),
      lifetime: card.querySelector('.js-lifetime-type')?.value || 'forever',
      lifetimeSpins: Number(card.querySelector('.js-lifetime-count')?.value || 0),
      cooldown: Number(card.querySelector('.js-cooldown')?.value || 0),
      timerSeconds: Number(card.querySelector('.js-timer-seconds')?.value || 0),
      mystery: !!card.querySelector('.js-mystery')?.checked,
      enabled: !!card.querySelector('.js-enabled')?.checked,
      eventType: card.querySelector('.js-event-type')?.value || 'normal',
      unlocks: checkedUnlockNames(card)
    };
  }

  function buildChips(data) {
    const chips = [];
    chips.push({ type:'weight', text:`⚖ ${Number.isFinite(data.weight) ? data.weight : 0}`, title:'Relative wheel weight' });
    if (data.reqNames.length) {
      const sep = data.mode === 'any' ? ' / ' : ' + ';
      const short = data.reqNames.slice(0,2).join(sep) + (data.reqNames.length > 2 ? ` +${data.reqNames.length - 2}` : '');
      chips.push({ type:'requires', text:data.mode === 'any' ? `🔗 After ANY: ${short}` : `🔗 After: ${short}`, title:`${data.mode === 'any' ? 'Available after ANY of' : 'Available after ALL of'}: ${data.reqNames.join(sep)}` });
    } else chips.push({ type:'ready', text:'● With group', title:'Available whenever this group is active' });
    if (data.dependentNames.length) chips.push({ type:'enables', text:`→ Enables ${data.dependentNames.length}`, title:data.dependentNames.join('\n') });
    if (data.lifetime === 'once') chips.push({ type:'once', text:'1× Once', title:'Removed after it is selected' });
    else if (data.lifetime === 'spins') chips.push({ type:'timed', text:`⏳ ${Math.max(1,data.lifetimeSpins || 1)} spins`, title:'Limited lifetime after activation' });
    if (data.timerSeconds > 0) chips.push({ type:'timed', text:`⏱ ${formatTimer(data.timerSeconds)}`, title:'Timed result' });
    if (data.cooldown > 0) chips.push({ type:'cooldown', text:`↻ Cooldown ${data.cooldown}`, title:'' });
    if (data.mystery) chips.push({ type:'mystery', text:'? Mystery', title:'' });
    const special = eventLabel(data.eventType); if (special) chips.push({ type:'event', text:special, title:'' });
    if (data.unlocks.length) chips.push({ type:'unlock', text:data.unlocks.length === 1 ? `🔓 ${data.unlocks[0]}` : `🔓 ${data.unlocks.length} groups`, title:`Unlocks: ${data.unlocks.join(', ')}` });
    if (!data.enabled) chips.push({ type:'disabled', text:'⛔ Disabled', title:'' });
    return chips;
  }

  function updateStatusRow(card, byId, reverse) {
    const title = card.querySelector('.editor-title-block');
    if (!title) return;
    const data = statusData(card, byId, reverse);
    const chips = buildChips(data);
    const signature = JSON.stringify(chips);
    let row = title.querySelector('.visual-status-row');
    if (row?.dataset.signature === signature) {
      card.classList.toggle('visual-disabled', !data.enabled);
      return;
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'visual-status-row';
      title.appendChild(row);
    }
    row.dataset.signature = signature;
    row.replaceChildren(...chips.map(info => {
      const chip = document.createElement('span');
      chip.className = `visual-status-chip ${info.type || 'neutral'}`;
      chip.textContent = info.text;
      if (info.title) chip.title = info.title;
      return chip;
    }));
    card.classList.toggle('visual-disabled', !data.enabled);
  }

  function enhanceCard(card) {
    if (card.dataset.visualPathBound === '2') return;
    card.dataset.visualPathBound = '2';
    card.addEventListener('mouseenter', () => { if (pathInspectionEnabled()) highlightPath(card); });
    card.addEventListener('mouseleave', event => { if (event.relatedTarget && card.contains(event.relatedTarget)) return; if (activeCard === card) clearPathHighlight(); });
    card.addEventListener('focusin', () => { if (pathInspectionEnabled()) highlightPath(card); });
    card.addEventListener('focusout', event => { if (event.relatedTarget && card.contains(event.relatedTarget)) return; if (activeCard === card) clearPathHighlight(); });
  }

  function refresh() {
    scheduled = false;
    rebuilding = true;
    const byId = cardMap();
    const reverse = reverseMap(byId);
    byId.forEach(card => { enhanceCard(card); updateStatusRow(card, byId, reverse); });
    rebuilding = false;
    if (!pathInspectionEnabled()) clearPathHighlight();
    else if (activeCard?.isConnected) highlightPath(activeCard);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } }

  const observer = new MutationObserver(mutations => {
    if (rebuilding) return;
    const relevant = mutations.some(m => {
      if (m.type === 'attributes') return m.attributeName === 'data-id';
      if (m.type !== 'childList') return false;
      if (m.target.closest?.('.visual-status-row')) return false;
      return [...m.addedNodes, ...m.removedNodes].some(node => {
        if (node.nodeType !== 1) return false;
        const el = node;
        if (el.classList?.contains('visual-status-chip') || el.classList?.contains('tree-order-badge')) return false;
        return el.matches?.('.forfeit-editor-card,.forfeit-group') || el.querySelector?.('.forfeit-editor-card,.forfeit-group');
      });
    });
    if (relevant) schedule();
  });
  observer.observe(list, { childList:true, subtree:true, attributes:true, attributeFilter:['data-id'] });

  document.addEventListener('input', event => { if (event.target.closest('.forfeit-editor-card')) schedule(); });
  document.addEventListener('change', event => { if (event.target.closest('.forfeit-editor-card')) schedule(); });
  if (body) new MutationObserver(() => { if (!pathInspectionEnabled()) clearPathHighlight(); }).observe(body, { attributes:true, attributeFilter:['class'] });
  window.addEventListener('fortune-editor-refreshed', schedule);
  window.addEventListener('fortune-ai-applied', schedule);
  schedule();
})();
