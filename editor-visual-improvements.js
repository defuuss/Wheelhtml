(() => {
  'use strict';

  if (window.__fortuneEditorVisualImprovements) return;
  window.__fortuneEditorVisualImprovements = true;

  const D = window.FortuneDependencyState;
  const list = document.getElementById('forfeitEditorList');
  if (!list) return;

  let scheduled = false;
  let activeCard = null;

  const cards = () => [...list.querySelectorAll('.forfeit-editor-card[data-id]')];
  const clean = value => String(value ?? '').trim();
  const nameOf = card => clean(card?.querySelector('.js-name')?.value) || card?.dataset?.id || 'Forfeit';
  const iconOf = card => clean(card?.querySelector('.js-icon')?.value) || '🎯';

  function cardMap() { return new Map(cards().map(card => [card.dataset.id, card])); }

  function depState(id) {
    try {
      const raw = D?.getForfeit?.(id) || {};
      return { mode: raw.requiresMode === 'any' ? 'any' : 'all', requires: [...new Set((raw.requiresForfeitIds || []).filter(Boolean))] };
    } catch (_) { return { mode: 'all', requires: [] }; }
  }

  function reverseMap(byId) {
    const reverse = new Map([...byId.keys()].map(id => [id, []]));
    byId.forEach((_, id) => depState(id).requires.forEach(ref => { if (reverse.has(ref)) reverse.get(ref).push(id); }));
    return reverse;
  }

  function collectUpstream(id, byId, found = new Set()) {
    depState(id).requires.forEach(ref => {
      if (!byId.has(ref) || found.has(ref)) return;
      found.add(ref); collectUpstream(ref, byId, found);
    });
    return found;
  }

  function collectDownstream(id, reverse, found = new Set()) {
    (reverse.get(id) || []).forEach(ref => {
      if (found.has(ref)) return;
      found.add(ref); collectDownstream(ref, reverse, found);
    });
    return found;
  }

  function clearPathHighlight() {
    list.querySelectorAll('.dep-visual-focus,.dep-visual-prereq,.dep-visual-dependent,.dep-visual-dim')
      .forEach(card => card.classList.remove('dep-visual-focus', 'dep-visual-prereq', 'dep-visual-dependent', 'dep-visual-dim'));
    list.querySelectorAll('.forfeit-group.dep-path-active').forEach(group => group.classList.remove('dep-path-active'));
    activeCard = null;
  }

  function highlightPath(card) {
    if (!card?.dataset?.id) return;
    const byId = cardMap(), reverse = reverseMap(byId), id = card.dataset.id;
    const upstream = collectUpstream(id, byId), downstream = collectDownstream(id, reverse), group = card.closest('.forfeit-group');
    clearPathHighlight();
    activeCard = card; card.classList.add('dep-visual-focus'); group?.classList.add('dep-path-active');
    upstream.forEach(ref => byId.get(ref)?.classList.add('dep-visual-prereq'));
    downstream.forEach(ref => byId.get(ref)?.classList.add('dep-visual-dependent'));
    if (group) {
      const related = new Set([id, ...upstream, ...downstream]);
      group.querySelectorAll('.forfeit-editor-card[data-id]').forEach(other => { if (!related.has(other.dataset.id)) other.classList.add('dep-visual-dim'); });
    }
  }

  function makeChip(text, type, title = '') {
    const chip = document.createElement('span');
    chip.className = `visual-status-chip ${type || 'neutral'}`;
    chip.textContent = text;
    if (title) chip.title = title;
    return chip;
  }

  function checkedUnlockNames(card) {
    return [...card.querySelectorAll('.js-unlock-checks label')]
      .filter(label => label.querySelector('input')?.checked)
      .map(label => clean(label.querySelector('span')?.textContent)).filter(Boolean);
  }

  function eventLabel(value) {
    return ({
      spinAgain: '↻ Spin again', unlock: '🔓 Unlock event', doubleSpin: '×2 Double spin', immunity: '🛡 Immunity', randomize: '🎲 Randomize',
      goodCard: '🟢 Good Card', badCard: '🔴 Bad Card', doubleOrNothing: '🟡 Double or Nothing'
    })[value] || '';
  }

  function formatTimer(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    if (!value) return '';
    const min = Math.floor(value / 60), sec = value % 60;
    return min ? `${min}m${sec ? ` ${sec}s` : ''}` : `${sec}s`;
  }

  function updateStatusRow(card, byId, reverse) {
    const title = card.querySelector('.editor-title-block');
    if (!title) return;
    let row = title.querySelector('.visual-status-row');
    if (!row) { row = document.createElement('div'); row.className = 'visual-status-row'; title.appendChild(row); }
    row.innerHTML = '';

    const id = card.dataset.id, state = depState(id), dependentIds = reverse.get(id) || [];
    const weight = Number(card.querySelector('.js-weight')?.value || 0);
    const lifetime = card.querySelector('.js-lifetime-type')?.value || 'forever';
    const lifetimeSpins = Number(card.querySelector('.js-lifetime-count')?.value || 0);
    const cooldown = Number(card.querySelector('.js-cooldown')?.value || 0);
    const timerSeconds = Number(card.querySelector('.js-timer-seconds')?.value || 0);
    const mystery = !!card.querySelector('.js-mystery')?.checked;
    const enabled = !!card.querySelector('.js-enabled')?.checked;
    const eventType = card.querySelector('.js-event-type')?.value || 'normal';
    const unlocks = checkedUnlockNames(card);

    row.appendChild(makeChip(`⚖ ${Number.isFinite(weight) ? weight : 0}`, 'weight', 'Relative wheel weight'));

    if (state.requires.length) {
      const reqNames = state.requires.map(ref => { const source = byId.get(ref); return source ? `${iconOf(source)} ${nameOf(source)}` : ref; });
      const separator = state.mode === 'any' ? ' / ' : ' + ';
      const shortNames = reqNames.slice(0, 2).join(separator) + (reqNames.length > 2 ? ` +${reqNames.length - 2}` : '');
      row.appendChild(makeChip(state.mode === 'any' ? `🔗 After ANY: ${shortNames}` : `🔗 After: ${shortNames}`, 'requires', `${state.mode === 'any' ? 'Available after ANY of' : 'Available after ALL of'}: ${reqNames.join(separator)}`));
    } else row.appendChild(makeChip('● With group', 'ready', 'Available whenever this group is active'));

    if (dependentIds.length) {
      const names = dependentIds.map(ref => nameOf(byId.get(ref))).filter(Boolean);
      row.appendChild(makeChip(`→ Enables ${dependentIds.length}`, 'enables', names.join('\n')));
    }
    if (lifetime === 'once') row.appendChild(makeChip('1× Once', 'once', 'Removed after it is selected'));
    else if (lifetime === 'spins') row.appendChild(makeChip(`⏳ ${Math.max(1, lifetimeSpins || 1)} spins`, 'timed', 'Limited lifetime after activation'));
    if (timerSeconds > 0) row.appendChild(makeChip(`⏱ ${formatTimer(timerSeconds)}`, 'timed', 'Timed result'));
    if (cooldown > 0) row.appendChild(makeChip(`↻ Cooldown ${cooldown}`, 'cooldown'));
    if (mystery) row.appendChild(makeChip('? Mystery', 'mystery'));
    const special = eventLabel(eventType);
    if (special) row.appendChild(makeChip(special, 'event'));
    if (unlocks.length) {
      const label = unlocks.length === 1 ? `🔓 ${unlocks[0]}` : `🔓 ${unlocks.length} groups`;
      row.appendChild(makeChip(label, 'unlock', `Unlocks: ${unlocks.join(', ')}`));
    }
    if (!enabled) row.appendChild(makeChip('⛔ Disabled', 'disabled'));
    card.classList.toggle('visual-disabled', !enabled);
  }

  function enhanceCard(card) {
    if (card.dataset.visualPathBound !== '1') {
      card.dataset.visualPathBound = '1';
      card.addEventListener('mouseenter', () => highlightPath(card));
      card.addEventListener('mouseleave', event => { if (event.relatedTarget && card.contains(event.relatedTarget)) return; if (activeCard === card) clearPathHighlight(); });
      card.addEventListener('focusin', () => highlightPath(card));
      card.addEventListener('focusout', event => { if (event.relatedTarget && card.contains(event.relatedTarget)) return; if (activeCard === card) clearPathHighlight(); });
    }
  }

  function refresh() {
    scheduled = false;
    const byId = cardMap(), reverse = reverseMap(byId);
    byId.forEach(card => { enhanceCard(card); updateStatusRow(card, byId, reverse); });
    if (activeCard?.isConnected) highlightPath(activeCard);
  }
  function schedule() { if (scheduled) return; scheduled = true; requestAnimationFrame(refresh); }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && m.attributeName !== 'class'))) schedule();
  });
  observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-id'] });
  document.addEventListener('input', event => { if (event.target.closest('.forfeit-editor-card')) schedule(); });
  document.addEventListener('change', event => { if (event.target.closest('.forfeit-editor-card')) schedule(); });
  window.addEventListener('fortune-editor-refreshed', schedule);
  window.addEventListener('fortune-ai-applied', schedule);
  schedule();
})();
