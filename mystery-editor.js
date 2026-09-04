(() => {
  'use strict';
  const list = document.getElementById('forfeitEditorList');
  if (!list) return;

  function isGeneric(card) {
    const name = String(card.querySelector('.js-name')?.value || '').trim().toLowerCase();
    const desc = String(card.querySelector('.js-description')?.value || '').trim().toLowerCase();
    return (name === 'mystery' || name === 'mystery challenge' || name === 'mystery forfeit') &&
      (!desc || desc.includes('hidden challenge is revealed'));
  }

  function update(card) {
    const checkbox = card.querySelector('.js-mystery');
    const helper = card.querySelector('.mystery-editor-helper');
    if (!checkbox || !helper) return;
    helper.hidden = !checkbox.checked;
    if (!checkbox.checked) return;
    const icon = card.querySelector('.js-icon')?.value || '🎯';
    const name = card.querySelector('.js-name')?.value || 'Unnamed hidden result';
    const desc = card.querySelector('.js-description')?.value || 'No description yet';
    helper.classList.toggle('warning', isGeneric(card));
    helper.querySelector('.mystery-editor-preview').textContent = `${icon} ${name}`;
    helper.querySelector('.mystery-editor-description').textContent = desc;
    helper.querySelector('.mystery-editor-message').textContent = isGeneric(card)
      ? 'This is still only a placeholder. Put the REAL hidden outcome in Name and Description; the wheel will hide both until it lands.'
      : 'This is what will be revealed after the mystery animation. The wheel itself will show only ❓ Mystery.';
  }

  function enhance(card) {
    if (card.dataset.mysteryHelper === '1') return;
    const checkbox = card.querySelector('.js-mystery');
    const desc = card.querySelector('.js-description');
    if (!checkbox || !desc) return;
    card.dataset.mysteryHelper = '1';

    const helper = document.createElement('div');
    helper.className = 'mystery-editor-helper';
    helper.innerHTML = `
      <div class="mystery-helper-head"><span>❓</span><strong>Mystery reveal content</strong></div>
      <div class="mystery-editor-preview"></div>
      <div class="mystery-editor-description"></div>
      <div class="mystery-editor-message"></div>`;
    const bottom = card.querySelector('.editor-bottom-grid');
    bottom?.insertAdjacentElement('afterend', helper);

    ['.js-mystery','.js-name','.js-icon','.js-description'].forEach(selector => {
      const node = card.querySelector(selector);
      node?.addEventListener('input', () => update(card));
      node?.addEventListener('change', () => update(card));
    });
    update(card);
  }

  const scan = () => list.querySelectorAll('.forfeit-editor-card').forEach(enhance);
  new MutationObserver(scan).observe(list, { childList: true, subtree: true });
  scan();
})();
