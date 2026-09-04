(() => {
  'use strict';
  const list = document.getElementById('forfeitEditorList');
  if (!list) return;

  const style = document.createElement('style');
  style.textContent = '.display-mode-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.display-mode-option{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.025);cursor:pointer}.display-mode-option:has(input:checked){border-color:rgba(101,216,255,.36);background:rgba(101,216,255,.08)}.display-mode-option strong,.display-mode-option small{display:block}.display-mode-option small{margin-top:3px;color:var(--muted);font-size:.66rem}@media(max-width:620px){.display-mode-options{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  function enhance(card) {
    const checkbox = card.querySelector('.js-mystery');
    if (!checkbox || checkbox.dataset.displayModeEnhanced) return;
    checkbox.dataset.displayModeEnhanced = '1';
    const oldLabel = checkbox.closest('label.check-line');
    if (!oldLabel) return;
    const groupName = 'display-' + (card.dataset.id || Math.random().toString(36).slice(2));
    const wrap = document.createElement('div');
    wrap.innerHTML = '<span class="mini-heading">Wheel display</span><div class="display-mode-options"><label class="display-mode-option"><input type="radio" name="'+groupName+'" value="normal"><span><strong>Normal</strong><small>Show its pictogram and name.</small></span></label><label class="display-mode-option"><input type="radio" name="'+groupName+'" value="hidden"><span><strong>❓ Mystery</strong><small>Show only a mystery marker until selected.</small></span></label></div>';
    const normal = wrap.querySelector('input[value="normal"]');
    const hidden = wrap.querySelector('input[value="hidden"]');
    const sync = () => { normal.checked = !checkbox.checked; hidden.checked = checkbox.checked; };
    normal.addEventListener('change', () => { if (normal.checked) { checkbox.checked = false; checkbox.dispatchEvent(new Event('change',{bubbles:true})); sync(); } });
    hidden.addEventListener('change', () => { if (hidden.checked) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change',{bubbles:true})); sync(); } });
    checkbox.addEventListener('change', sync);
    oldLabel.hidden = true;
    oldLabel.insertAdjacentElement('beforebegin', wrap);
    sync();
  }

  const scan = () => list.querySelectorAll('.forfeit-editor-card').forEach(enhance);
  new MutationObserver(scan).observe(list,{childList:true,subtree:true});
  scan();

  // Load the per-group quick-add controls and clearer left-aligned tree headers.
  if (!document.querySelector('link[data-group-quick-add]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'group-quick-add.css';
    link.dataset.groupQuickAdd = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-group-quick-add]')) {
    const script = document.createElement('script');
    script.src = 'group-quick-add.js';
    script.dataset.groupQuickAdd = '1';
    document.body.appendChild(script);
  }
})();
