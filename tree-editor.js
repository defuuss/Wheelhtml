(() => {
  'use strict';

  const forfeitList = document.getElementById('forfeitEditorList');
  const levelList = document.getElementById('levelEditorList');
  const forfeitPane = document.getElementById('tab-forfeits');
  if (!forfeitList || !levelList || !forfeitPane) return;

  let scheduled = false;

  const text = value => String(value || '').trim();
  const compareNames = (a, b) => text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });

  function sameOrder(parent, wanted) {
    const current = [...parent.children].filter(node => wanted.includes(node));
    return current.length === wanted.length && current.every((node, index) => node === wanted[index]);
  }

  function sortLevelCards() {
    const cards = [...levelList.children].filter(node => node.classList?.contains('level-editor-card'));
    if (!cards.length) return;

    const ordered = cards.slice().sort((a, b) => {
      const aStart = !!a.querySelector('.js-level-start')?.checked;
      const bStart = !!b.querySelector('.js-level-start')?.checked;
      if (aStart !== bStart) return aStart ? -1 : 1;
      return compareNames(a.querySelector('.js-level-name')?.value, b.querySelector('.js-level-name')?.value);
    });

    if (!sameOrder(levelList, ordered)) ordered.forEach(card => levelList.appendChild(card));
    levelList.classList.add('tree-sorted-levels');
    ordered.forEach((card, index) => card.dataset.treeOrder = String(index + 1));
  }

  function groupName(group) {
    return group.querySelector('.forfeit-group-title strong')?.textContent || '';
  }

  function groupStartsActive(group) {
    return !!group.querySelector('.group-badge.start');
  }

  function sortForfeitCards(group) {
    const body = group.querySelector('.forfeit-group-body');
    if (!body) return;
    const cards = [...body.children].filter(node => node.classList?.contains('forfeit-editor-card'));
    const ordered = cards.slice().sort((a, b) => {
      const nameA = a.querySelector('.js-name')?.value || '';
      const nameB = b.querySelector('.js-name')?.value || '';
      const byName = compareNames(nameA, nameB);
      if (byName) return byName;
      return compareNames(a.dataset.id, b.dataset.id);
    });

    if (!sameOrder(body, ordered)) ordered.forEach(card => body.appendChild(card));

    ordered.forEach((card, index) => {
      let badge = card.querySelector(':scope > .editor-card-head > .tree-order-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tree-order-badge';
        badge.setAttribute('aria-hidden', 'true');
        const head = card.querySelector(':scope > .editor-card-head');
        head?.insertBefore(badge, head.firstChild);
      }
      badge.textContent = String(index + 1).padStart(2, '0');
    });
  }

  function sortForfeitGroups() {
    const groups = [...forfeitList.children].filter(node => node.classList?.contains('forfeit-group'));
    if (!groups.length) return;

    groups.forEach(sortForfeitCards);

    const ordered = groups.slice().sort((a, b) => {
      const aStart = groupStartsActive(a);
      const bStart = groupStartsActive(b);
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
    help.innerHTML = '<span class="tree-symbol">├─</span><span>Tree view · start groups first · groups and child forfeits sorted automatically by name</span>';
    (tools || forfeitPane.querySelector('.editor-toolbar'))?.insertAdjacentElement('afterend', help);
  }

  function run() {
    scheduled = false;
    addHelp();
    sortLevelCards();
    sortForfeitGroups();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(forfeitList, { childList: true, subtree: true });
  observer.observe(levelList, { childList: true, subtree: true });

  document.addEventListener('input', event => {
    if (event.target.matches('.js-name, .js-level-name')) schedule();
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.js-level-start, .js-level, .js-name, .js-level-name')) schedule();
  });

  schedule();
})();
