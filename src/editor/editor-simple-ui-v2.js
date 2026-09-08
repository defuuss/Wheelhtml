(() => {
  'use strict';

  if (window.__fortuneSimpleEditorUiV2) return;
  window.__fortuneSimpleEditorUiV2 = true;

  const body = document.body;
  if (!body || body.dataset.page !== 'edit') return;

  const MODE_KEY = 'fortune-editor-ui-mode-v2';
  const tabs = document.querySelector('.editor-tabs');
  const topActions = document.querySelector('.top-actions');
  const forfeitList = document.getElementById('forfeitEditorList');
  const levelList = document.getElementById('levelEditorList');
  let scheduled = false;

  const safeRead = (key, fallback = '') => {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
  };
  const safeWrite = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  function setMode(mode) {
    const advanced = mode === 'advanced';
    body.classList.toggle('editor-simple-mode', !advanced);
    body.classList.toggle('editor-advanced-mode', advanced);
    safeWrite(MODE_KEY, advanced ? 'advanced' : 'simple');
    document.querySelectorAll('#editorModeToggleV2 button').forEach(button => {
      const active = button.dataset.mode === (advanced ? 'advanced' : 'simple');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function ensureModeToggle() {
    if (!tabs || document.getElementById('editorModeToggleV2')) return;
    const wrap = document.createElement('div');
    wrap.id = 'editorModeToggleV2';
    wrap.className = 'editor-mode-toggle-v2';
    wrap.innerHTML = '<span>VIEW</span><button type="button" data-mode="simple">Simple</button><button type="button" data-mode="advanced">Advanced</button>';
    tabs.appendChild(wrap);
    wrap.addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]');
      if (button) setMode(button.dataset.mode);
    });
    setMode(safeRead(MODE_KEY, 'simple') === 'advanced' ? 'advanced' : 'simple');
  }

  function ensureMoreMenu() {
    if (!topActions || document.getElementById('editorMoreMenuV2')) return;
    const load = document.getElementById('editorLoadBtn');
    const save = document.getElementById('editorSaveBtn');
    if (!load || !save) return;

    const wrap = document.createElement('div');
    wrap.id = 'editorMoreMenuV2';
    wrap.className = 'editor-more-menu-v2';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn ghost';
    trigger.textContent = 'More ▾';
    trigger.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'editor-more-popover-v2';
    menu.hidden = true;

    topActions.insertBefore(wrap, load);
    wrap.append(trigger, menu);
    menu.append(load, save);
    setText(load, '↥ Import XML');
    setText(save, '↧ Export XML');

    const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      trigger.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    menu.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', close);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }

  function ensureSaveStatus() { return document.getElementById('saveStatus'); }

  function syncSaveStatus() {
    const status = ensureSaveStatus();
    if (!status) return;
    const dirty = body.classList.contains('dirty');
    status.classList.toggle('dirty', dirty);
    setText(status, dirty ? 'Unapplied changes' : 'All changes applied');
  }

  function simplifyStaticCopy() {
    const intro = document.querySelector('.editor-intro');
    if (intro && intro.dataset.simpleV2 !== '1') {
      intro.dataset.simpleV2 = '1';
      setText(intro.querySelector('.section-kicker'), 'GAME BUILDER');
      setText(intro.querySelector('h1'), 'Build your wheel.');
      setText(intro.querySelector('p'), 'Open a forfeit to edit it. Add or delete a whole group below. Use Advanced only for detailed rules.');
      const labels = intro.querySelectorAll('.editor-summary span');
      setText(labels[0], 'Entries'); setText(labels[1], 'Groups'); setText(labels[2], 'Weight');
    }

    const forfeitToolbar = document.querySelector('#tab-forfeits .editor-toolbar');
    if (forfeitToolbar && forfeitToolbar.dataset.simpleV2 !== '1') {
      forfeitToolbar.dataset.simpleV2 = '1';
      setText(forfeitToolbar.querySelector('.section-kicker'), 'WHEEL ENTRIES');
      setText(forfeitToolbar.querySelector('h2'), 'What can the wheel choose?');
      setText(forfeitToolbar.querySelector('p'), 'Choose a group, add a forfeit, then open Edit. Optional modifiers live inside each forfeit.');
    }
    setText(document.getElementById('addForfeitBtn'), '+ Add forfeit');

    const settingsPane = document.getElementById('tab-settings');
    if (settingsPane && !settingsPane.querySelector('.simple-settings-heading-v2')) {
      const heading = document.createElement('div');
      heading.className = 'editor-toolbar simple-settings-heading-v2';
      heading.innerHTML = '<div><div class="section-kicker">GAME SETTINGS</div><h2>How should the wheel feel?</h2><p class="muted">Sound, display and spin behaviour. Detailed timing stays in Advanced view.</p></div>';
      settingsPane.prepend(heading);
    }

    const apply = document.getElementById('applyBtn');
    const ai = document.getElementById('editorAiOpen');
    const play = topActions?.querySelector('a[href="index.html"]');
    setText(apply, 'Apply changes');
    setText(ai, '✦ AI helper');
    setText(play, '▶ Play');
  }

  function tagCard(card) {
    if (!card?.dataset?.id) return;
    const advancedSelectors = ['.js-icon', '.js-color', '.js-category', '.js-animation', '.js-cooldown', '.js-event-type'];
    advancedSelectors.forEach(selector => card.querySelector(selector)?.closest('label.field')?.classList.add('simple-v2-advanced-field'));

    const primarySelectors = ['.js-level', '.js-weight', '.js-lifetime-type', '.js-lifetime-count', '.js-event-type', '.js-timer-seconds'];
    primarySelectors.forEach(selector => card.querySelector(selector)?.closest('label.field')?.classList.add('simple-v2-primary-field'));
    card.querySelector('.js-description')?.closest('label.field')?.classList.add('simple-v2-description-field');
  }

  function tagLevelCard(card) {
    if (!card) return;
    card.querySelector('.js-level-color')?.closest('label.field')?.classList.add('simple-v2-advanced-field');
  }

  function scanDynamic() {
    scheduled = false;
    forfeitList?.querySelectorAll('.forfeit-editor-card[data-id]').forEach(tagCard);
    levelList?.querySelectorAll('.level-editor-card').forEach(tagLevelCard);
    const search = document.getElementById('forfeitSearchInput');
    if (search) search.placeholder = 'Search entries…';
    syncSaveStatus();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scanDynamic);
  }

  simplifyStaticCopy();
  ensureModeToggle();
  ensureMoreMenu();
  ensureSaveStatus();
  setMode(safeRead(MODE_KEY, 'simple') === 'advanced' ? 'advanced' : 'simple');
  scanDynamic();

  /* Observe only top-level list rebuilds. We deliberately do not watch every text mutation:
     progression/dependency scripts own their labels, which prevents the old UI ping-pong. */
  if (forfeitList) new MutationObserver(schedule).observe(forfeitList, { childList:true });
  if (levelList) new MutationObserver(schedule).observe(levelList, { childList:true });
  new MutationObserver(syncSaveStatus).observe(body, { attributes:true, attributeFilter:['class'] });
  window.addEventListener('fortune-editor-refreshed', () => setTimeout(schedule, 0));
  window.addEventListener('fortune-ai-applied', () => setTimeout(schedule, 0));
})();