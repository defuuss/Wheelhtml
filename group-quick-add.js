(() => {
  'use strict';

  const list = document.getElementById('forfeitEditorList');
  const globalAdd = document.getElementById('addForfeitBtn');
  if (!list || !globalAdd) return;

  let scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceGroups();
    });
  }

  function enhanceGroups() {
    list.querySelectorAll(':scope > .forfeit-group').forEach(group => {
      if (group.dataset.quickAddEnhanced === '1') return;
      group.dataset.quickAddEnhanced = '1';

      const groupId = group.dataset.levelId;
      if (!groupId || groupId === '__unassigned__') return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'group-quick-add';
      button.innerHTML = '<span>＋</span><strong>Add forfeit</strong>';
      button.title = 'Add a new forfeit directly to this group';
      button.setAttribute('aria-label', 'Add forfeit to this group');

      button.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        addToGroup(group, groupId, button);
      });

      group.appendChild(button);
    });
  }

  function addToGroup(group, groupId, button) {
    const existingIds = new Set(
      [...list.querySelectorAll('.forfeit-editor-card')]
        .map(card => card.dataset.id)
        .filter(Boolean)
    );

    group.classList.remove('collapsed');
    button.disabled = true;
    globalAdd.click();

    let attempts = 0;
    const findNewCard = () => {
      attempts++;
      const cards = [...list.querySelectorAll('.forfeit-editor-card')];
      const newCard = cards.find(card => card.dataset.id && !existingIds.has(card.dataset.id));

      if (!newCard && attempts < 40) {
        requestAnimationFrame(findNewCard);
        return;
      }

      button.disabled = false;
      if (!newCard) return;

      const id = newCard.dataset.id;
      const select = newCard.querySelector('.js-level');
      if (select && [...select.options].some(option => option.value === groupId)) {
        select.value = groupId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }

      let focusAttempts = 0;
      const focusMovedCard = () => {
        focusAttempts++;
        const moved = [...list.querySelectorAll('.forfeit-editor-card')]
          .find(card => card.dataset.id === id);

        if (!moved && focusAttempts < 30) {
          requestAnimationFrame(focusMovedCard);
          return;
        }
        if (!moved) return;

        moved.closest('.forfeit-group')?.classList.remove('collapsed');
        if (!moved.classList.contains('is-expanded')) {
          moved.querySelector('.detail-toggle')?.click();
        }
        const name = moved.querySelector('.js-name');
        name?.focus();
        name?.select();
        moved.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      requestAnimationFrame(focusMovedCard);
    };

    requestAnimationFrame(findNewCard);
  }

  new MutationObserver(schedule).observe(list, { childList: true, subtree: true });
  schedule();

  // The AI editor now lives directly inside edit.html as a drawer.
  if (!window.__fortuneEditorAiLoaderAdded) {
    window.__fortuneEditorAiLoaderAdded = true;
    const script = document.createElement('script');
    script.src = 'editor-ai-integrated.js?v=1';
    script.async = false;
    document.body.appendChild(script);
  }
})();