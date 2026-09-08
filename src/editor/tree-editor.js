(() => {
  'use strict';

  const forfeitList = document.getElementById('forfeitEditorList');
  const levelList = document.getElementById('levelEditorList');
  const forfeitPane = document.getElementById('tab-forfeits');
  if (!forfeitList || !levelList || !forfeitPane) return;

  let scheduled = false;
  let arranging = false;
  const text = value => String(value || '').trim();
  const compareNames = (a,b) => text(a).localeCompare(text(b), undefined, { numeric:true, sensitivity:'base' });

  function sameOrder(parent, wanted) {
    const current = [...parent.children].filter(node => wanted.includes(node));
    return current.length === wanted.length && current.every((node,index) => node === wanted[index]);
  }

  function sortLevelCards() {
    const cards = [...levelList.children].filter(node => node.classList?.contains('level-editor-card'));
    if (!cards.length) return;
    const ordered = cards.slice().sort((a,b) => {
      const aStart = !!a.querySelector('.js-level-start')?.checked;
      const bStart = !!b.querySelector('.js-level-start')?.checked;
      if (aStart !== bStart) return aStart ? -1 : 1;
      return compareNames(a.querySelector('.js-level-name')?.value, b.querySelector('.js-level-name')?.value);
    });
    if (!sameOrder(levelList, ordered)) ordered.forEach(card => levelList.appendChild(card));
    levelList.classList.add('tree-sorted-levels');
    ordered.forEach((card,index) => card.dataset.treeOrder = String(index + 1));
  }

  function groupName(group) { return group.querySelector('.forfeit-group-title strong')?.textContent || ''; }
  function groupStartsActive(group) { return !!group.querySelector('.group-badge.start'); }
  function visibleOrderFor(card, fallbackIndex) {
    const dependencyOrder = Number(card.style.order);
    return Number.isFinite(dependencyOrder) && dependencyOrder > 0 ? Math.round(dependencyOrder) : fallbackIndex + 1;
  }

  function sortForfeitCards(group) {
    const body = group.querySelector('.forfeit-group-body');
    if (!body) return;
    const cards = [...body.children].filter(node => node.classList?.contains('forfeit-editor-card'));
    const ordered = cards.slice().sort((a,b) => {
      const byName = compareNames(a.querySelector('.js-name')?.value || '', b.querySelector('.js-name')?.value || '');
      return byName || compareNames(a.dataset.id, b.dataset.id);
    });
    if (!sameOrder(body, ordered)) ordered.forEach(card => body.appendChild(card));
    ordered.forEach((card,index) => {
      let badge = card.querySelector(':scope > .editor-card-head > .tree-order-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tree-order-badge';
        badge.setAttribute('aria-hidden','true');
        const head = card.querySelector(':scope > .editor-card-head');
        head?.insertBefore(badge, head.firstChild);
      }
      const wanted = String(visibleOrderFor(card,index)).padStart(2,'0');
      if (badge.textContent !== wanted) badge.textContent = wanted;
    });
  }

  function sortForfeitGroups() {
    const groups = [...forfeitList.children].filter(node => node.classList?.contains('forfeit-group'));
    if (!groups.length) return;
    groups.forEach(sortForfeitCards);
    const ordered = groups.slice().sort((a,b) => {
      const aStart = groupStartsActive(a), bStart = groupStartsActive(b);
      if (aStart !== bStart) return aStart ? -1 : 1;
      return compareNames(groupName(a), groupName(b));
    });
    if (!sameOrder(forfeitList, ordered)) ordered.forEach(group => forfeitList.appendChild(group));
  }

  function addHelp() {
    if (document.getElementById('forfeitTreeHelp')) return;
    const tools = document.getElementById('forfeitEnhancementTools');
    const help = document.createElement('div');
    help.id = 'forfeitTreeHelp';
    help.className = 'forfeit-tree-help';
    help.innerHTML = '<span class="tree-symbol">├─</span><span>Tree view · start groups first · dependency order controls the visible sequence</span>';
    (tools || forfeitPane.querySelector('.editor-toolbar'))?.insertAdjacentElement('afterend', help);
  }

  function run() {
    scheduled = false;
    arranging = true;
    addHelp();
    sortLevelCards();
    sortForfeitGroups();
    arranging = false;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(run); } }

  function structuralMutation(m) {
    if (m.type !== 'childList') return false;
    if (m.target.closest?.('.visual-status-row,.forfeit-compact-meta,.dep-compact-row,.dep-picker-panel')) return false;
    return [...m.addedNodes, ...m.removedNodes].some(node => {
      if (node.nodeType !== 1) return false;
      const el = node;
      if (el.classList?.contains('tree-order-badge') || el.classList?.contains('visual-status-chip')) return false;
      return el.matches?.('.forfeit-group,.forfeit-editor-card,.level-editor-card') || el.querySelector?.('.forfeit-group,.forfeit-editor-card,.level-editor-card');
    });
  }

  const observer = new MutationObserver(mutations => {
    if (arranging) return;
    if (mutations.some(structuralMutation)) schedule();
  });
  observer.observe(forfeitList, { childList:true, subtree:true });
  observer.observe(levelList, { childList:true, subtree:true });

  document.addEventListener('input', event => { if (event.target.matches('.js-name,.js-level-name')) schedule(); });
  document.addEventListener('change', event => { if (event.target.matches('.js-level-start,.js-level,.js-name,.js-level-name')) schedule(); });
  window.addEventListener('fortune-editor-refreshed', schedule);
  window.addEventListener('fortune-ai-applied', schedule);
  schedule();
})();
