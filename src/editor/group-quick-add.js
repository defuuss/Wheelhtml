(() => {
  'use strict';
  const list = document.getElementById('forfeitEditorList');
  if (!list) return;
  function enhance() {
    list.querySelectorAll(':scope > .forfeit-group').forEach(group => {
      if (group.querySelector(':scope > .group-actions') || group.dataset.levelId === '__unassigned__') return;
      const actions = document.createElement('div'); actions.className = 'group-actions';
      const add = document.createElement('button'); add.type = 'button'; add.className = 'btn primary'; add.textContent = '+ Add forfeit';
      add.onclick = () => window.FortuneEditor.addForfeit(group.dataset.levelId);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn danger-soft'; remove.textContent = 'Delete group…';
      remove.onclick = () => window.FortuneEditor.deleteGroup(group.dataset.levelId);
      actions.append(add, remove); group.append(actions);
    });
  }
  new MutationObserver(enhance).observe(list, { childList:true });
  enhance();
})();
