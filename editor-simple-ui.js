(() => {
  'use strict';

  if (window.__fortuneSimpleEditorUi) return;
  window.__fortuneSimpleEditorUi = true;

  const MODE_KEY = 'fortune-editor-ui-mode-v1';
  const body = document.body;
  const forfeitList = document.getElementById('forfeitEditorList');
  const levelList = document.getElementById('levelEditorList');
  const tabs = document.querySelector('.editor-tabs');
  const topActions = document.querySelector('.top-actions');
  if (!body || body.dataset.page !== 'edit' || !forfeitList || !tabs || !topActions) return;

  let scheduled = false;
  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };

  function safeStore(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function safeRead(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
  }

  function setMode(mode) {
    const advanced = mode === 'advanced';
    body.classList.toggle('editor-advanced-mode', advanced);
    body.classList.toggle('editor-simple-mode', !advanced);
    safeStore(MODE_KEY, advanced ? 'advanced' : 'simple');
    document.querySelectorAll('#editorModeToggle button').forEach(button => {
      const active = button.dataset.mode === (advanced ? 'advanced' : 'simple');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function ensureModeToggle() {
    if (document.getElementById('editorModeToggle')) return;
    const wrap = document.createElement('div');
    wrap.id = 'editorModeToggle';
    wrap.className = 'editor-mode-toggle';
    wrap.innerHTML = '<span>VIEW</span><button type="button" data-mode="simple">Simple</button><button type="button" data-mode="advanced">Advanced</button>';
    tabs.appendChild(wrap);
    wrap.addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]');
      if (button) setMode(button.dataset.mode);
    });
    setMode(safeRead(MODE_KEY, 'simple') === 'advanced' ? 'advanced' : 'simple');
  }

  function ensureSaveStatus() {
    let status = document.getElementById('editorSaveStatus');
    if (status) return status;
    status = document.createElement('span');
    status.id = 'editorSaveStatus';
    status.className = 'editor-save-status';
    const apply = document.getElementById('applyBtn');
    if (apply) topActions.insertBefore(status, apply);
    return status;
  }

  function syncSaveStatus() {
    const status = ensureSaveStatus();
    const dirty = body.classList.contains('dirty');
    status.classList.toggle('dirty', dirty);
    status.textContent = dirty ? '● Unsaved' : '✓ Saved';
  }

  function ensureMoreMenu() {
    if (document.getElementById('editorMoreMenu')) return;
    const load = document.getElementById('editorLoadBtn');
    const save = document.getElementById('editorSaveBtn');
    if (!load || !save) return;

    const wrap = document.createElement('div');
    wrap.id = 'editorMoreMenu';
    wrap.className = 'editor-more-menu';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost editor-more-trigger';
    button.textContent = 'More ▾';
    button.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'editor-more-popover';
    menu.hidden = true;

    topActions.insertBefore(wrap, load);
    wrap.append(button, menu);
    menu.append(load, save);
    load.textContent = '↥ Import XML';
    save.textContent = '↧ Export XML';

    const close = () => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', event => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    menu.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', close);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }

  function simplifyHeader() {
    const ai = document.getElementById('editorAiOpen');
    const apply = document.getElementById('applyBtn');
    const back = topActions.querySelector('a[href="index.html"]');
    setText(ai, '✦ AI helper');
    setText(apply, 'Save game');
    setText(back, '▶ Play');
    ensureMoreMenu();
    ensureSaveStatus();
  }

  function simplifyIntro() {
    const intro = document.querySelector('.editor-intro');
    if (!intro || intro.dataset.simpleCopy === '1') return;
    intro.dataset.simpleCopy = '1';
    const kicker = intro.querySelector('.section-kicker');
    const title = intro.querySelector('h1');
    const text = intro.querySelector('p');
    setText(kicker, 'GAME BUILDER');
    setText(title, 'Build your wheel in 3 simple steps.');
    setText(text, 'Add wheel entries, decide when levels unlock, then tune the game. Advanced controls stay available when you need them.');

    const summaryLabels = intro.querySelectorAll('.editor-summary span');
    setText(summaryLabels[0], 'Entries');
    setText(summaryLabels[1], 'Levels');
    setText(summaryLabels[2], 'Weight');
  }

  function simplifyTabsAndToolbars() {
    const labels = {
      forfeits: ['1', 'Wheel entries'],
      levels: ['2', 'Levels'],
      settings: ['3', 'Settings']
    };
    document.querySelectorAll('.editor-tab[data-tab]').forEach(tab => {
      const copy = labels[tab.dataset.tab];
      if (!copy) return;
      const desired = `<b>${copy[0]}</b><span>${copy[1]}</span>`;
      if (tab.innerHTML !== desired) tab.innerHTML = desired;
    });

    const forfeitPane = document.getElementById('tab-forfeits');
    const forfeitToolbar = forfeitPane?.querySelector('.editor-toolbar');
    if (forfeitToolbar) {
      const kicker = forfeitToolbar.querySelector('.section-kicker');
      const h2 = forfeitToolbar.querySelector('h2');
      const p = forfeitToolbar.querySelector('p');
      setText(kicker, 'STEP 1');
      setText(h2, 'What can the wheel choose?');
      setText(p, 'Entries are grouped by level. Open an entry only when you want to edit it.');
    }
    const addForfeit = document.getElementById('addForfeitBtn');
    setText(addForfeit, '+ New entry');

    const levelPane = document.getElementById('tab-levels');
    const levelToolbar = levelPane?.querySelector('.editor-toolbar');
    if (levelToolbar) {
      const kicker = levelToolbar.querySelector('.section-kicker');
      const h2 = levelToolbar.querySelector('h2');
      const p = levelToolbar.querySelector('p');
      setText(kicker, 'STEP 2');
      setText(h2, 'How does the game progress?');
      setText(p, 'A level can start immediately, unlock from a result, or begin when another level is completed.');
    }
    const addLevel = document.getElementById('addLevelBtn');
    setText(addLevel, '+ New level');

    const settingsPane = document.getElementById('tab-settings');
    if (settingsPane && !settingsPane.querySelector('.simple-settings-heading')) {
      const heading = document.createElement('div');
      heading.className = 'editor-toolbar simple-settings-heading';
      heading.innerHTML = '<div><div class="section-kicker">STEP 3</div><h2>How should the game feel?</h2><p class="muted">Choose a quick spin style, then adjust display and sound. Advanced timing controls are still available.</p></div>';
      settingsPane.prepend(heading);
    }
  }

  function tagAdvancedField(card, selector) {
    const node = card.querySelector(selector);
    const label = node?.closest('label.field');
    if (label) label.classList.add('simple-advanced-field');
  }

  function simplifyForfeitCard(card) {
    if (!card?.dataset?.id) return;

    const toggle = card.querySelector('.detail-toggle');
    if (toggle) {
      setText(toggle, card.classList.contains('is-expanded') ? 'Close' : 'Edit');
      toggle.title = 'Edit this wheel entry';
    }

    const available = card.querySelector('.dep-edit-action');
    if (available) {
      setText(available, '🔒 When available');
      available.title = 'Choose when this entry appears on the wheel';
    }
    const after = card.querySelector('.dep-after-action');
    if (after && !/\d/.test(after.textContent || '')) setText(after, '→ Unlocks');

    const fields = card.querySelector('.editor-fields-grid');
    if (fields && !fields.querySelector('.simple-basic-label')) {
      const label = document.createElement('div');
      label.className = 'simple-basic-label';
      label.textContent = 'MAIN SETTINGS';
      fields.prepend(label);
    }

    tagAdvancedField(card, '.js-icon');
    tagAdvancedField(card, '.js-color');
    tagAdvancedField(card, '.js-category');
    tagAdvancedField(card, '.js-animation');
    tagAdvancedField(card, '.js-cooldown');

    const weight = card.querySelector('.js-weight')?.closest('label.field');
    if (weight && !weight.dataset.simpleLabel) {
      weight.dataset.simpleLabel = '1';
      weight.childNodes[0].nodeValue = 'Chance weight';
    }
    const level = card.querySelector('.js-level')?.closest('label.field');
    if (level && !level.dataset.simpleLabel) {
      level.dataset.simpleLabel = '1';
      level.childNodes[0].nodeValue = 'Level';
    }
    const lifetime = card.querySelector('.js-lifetime-type')?.closest('label.field');
    if (lifetime && !lifetime.dataset.simpleLabel) {
      lifetime.dataset.simpleLabel = '1';
      lifetime.childNodes[0].nodeValue = 'After it is selected';
    }
    const event = card.querySelector('.js-event-type')?.closest('label.field');
    if (event && !event.dataset.simpleLabel) {
      event.dataset.simpleLabel = '1';
      event.childNodes[0].nodeValue = 'Entry type';
    }
    const timer = card.querySelector('.js-timer-seconds')?.closest('label.field');
    if (timer && !timer.dataset.simpleLabel) {
      timer.dataset.simpleLabel = '1';
      timer.childNodes[0].nodeValue = 'Timer (seconds)';
    }

    const description = card.querySelector('.js-description')?.closest('label.field');
    if (description && !description.dataset.simpleLabel) {
      description.dataset.simpleLabel = '1';
      description.childNodes[0].nodeValue = 'What should happen?';
    }

    const unlock = card.querySelector('.unlock-box');
    if (unlock && !unlock.dataset.simpleCopy) {
      unlock.dataset.simpleCopy = '1';
      const strong = unlock.querySelector('strong');
      const span = unlock.querySelector('span');
      if (strong) strong.textContent = 'Unlock another level after this result';
      if (span) span.textContent = 'Use this for a major phase change. For simple ordering, use “When available” above.';
    }

    const displayHeading = card.querySelector('.display-mode-options')?.previousElementSibling;
    if (displayHeading?.classList.contains('mini-heading')) setText(displayHeading, 'Wheel display');

    const enabled = card.querySelector('.js-enabled')?.closest('label.check-line')?.querySelector('span');
    setText(enabled, 'Entry enabled');

    card.dataset.simpleUi = '1';
  }

  function simplifyLevelCard(card) {
    if (!card) return;
    const name = card.querySelector('.js-level-name')?.closest('label.field');
    const icon = card.querySelector('.js-level-icon')?.closest('label.field');
    const color = card.querySelector('.js-level-color')?.closest('label.field');
    const start = card.querySelector('.js-level-start')?.closest('label.check-line')?.querySelector('span');
    if (name && !name.dataset.simpleLabel) { name.dataset.simpleLabel = '1'; name.childNodes[0].nodeValue = 'Level name'; }
    if (icon && !icon.dataset.simpleLabel) { icon.dataset.simpleLabel = '1'; icon.childNodes[0].nodeValue = 'Icon'; }
    if (color) color.classList.add('level-color-advanced');
    setText(start, 'Available when the game starts');
    card.dataset.simpleUi = '1';
  }

  function simplifyRuleArea() {
    const details = document.querySelector('.advanced-progression-rules');
    if (details) details.classList.add('global-advanced-feature');
    const head = document.querySelector('#tab-levels .rule-section-head');
    if (head && !details) head.classList.add('global-advanced-feature');
    const list = document.getElementById('ruleEditorList');
    if (list && !details) list.classList.add('global-advanced-feature');
  }

  function setInput(id, value, type = 'input') {
    const input = document.getElementById(id);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = String(value);
    input.dispatchEvent(new Event(type, { bubbles:true }));
  }

  function applyPreset(name) {
    const presets = {
      quick: { minSpin:4, maxSpin:5.5, minTurns:4, spinUpMinSeconds:.4, spinUpMaxSeconds:.7, spinDownMinSeconds:1.8, spinDownMaxSeconds:2.7, dramaChance:15, dramaCreepMinDegrees:20, dramaCreepMaxDegrees:50 },
      balanced: { minSpin:6, maxSpin:8, minTurns:6, spinUpMinSeconds:.6, spinUpMaxSeconds:1, spinDownMinSeconds:2.5, spinDownMaxSeconds:4, dramaChance:30, dramaCreepMinDegrees:30, dramaCreepMaxDegrees:70 },
      show: { minSpin:7, maxSpin:10, minTurns:7, spinUpMinSeconds:.8, spinUpMaxSeconds:1.4, spinDownMinSeconds:3.5, spinDownMaxSeconds:5.5, dramaChance:45, dramaCreepMinDegrees:30, dramaCreepMaxDegrees:80 }
    };
    const p = presets[name];
    if (!p) return;
    Object.entries(p).forEach(([id, value]) => setInput(id, value));
    setInput('dramaEnabled', true, 'change');
    body.classList.add('dirty');
    document.querySelectorAll('.simple-spin-preset').forEach(button => button.classList.toggle('active', button.dataset.preset === name));
    syncSaveStatus();
  }

  function ensureSimpleSettings() {
    const pane = document.getElementById('tab-settings');
    const grid = pane?.querySelector('.settings-grid');
    if (!pane || !grid || document.getElementById('simpleSpinStyle')) return;

    const panel = document.createElement('section');
    panel.id = 'simpleSpinStyle';
    panel.className = 'editor-card simple-spin-style';
    panel.innerHTML = `
      <div><div class="section-kicker">QUICK SETUP</div><h3>Spin style</h3><p class="muted">Pick a feel. You can still fine-tune every value in Advanced view.</p></div>
      <div class="simple-spin-presets">
        <button class="simple-spin-preset" type="button" data-preset="quick"><strong>Quick</strong><span>Short & snappy</span></button>
        <button class="simple-spin-preset active" type="button" data-preset="balanced"><strong>Balanced</strong><span>Good default</span></button>
        <button class="simple-spin-preset" type="button" data-preset="show"><strong>Game show</strong><span>Longer suspense</span></button>
      </div>
      <label class="check-line simple-drama-toggle"><input id="simpleDramaEnabled" type="checkbox"><span>Drama mode — occasional fake stop</span></label>`;
    grid.insertAdjacentElement('beforebegin', panel);

    panel.addEventListener('click', event => {
      const button = event.target.closest('.simple-spin-preset[data-preset]');
      if (button) applyPreset(button.dataset.preset);
    });

    const proxy = document.getElementById('simpleDramaEnabled');
    const syncProxy = () => {
      const source = document.getElementById('dramaEnabled');
      if (source && proxy) proxy.checked = source.checked;
    };
    proxy?.addEventListener('change', () => setInput('dramaEnabled', proxy.checked, 'change'));
    setTimeout(syncProxy, 80);
    new MutationObserver(syncProxy).observe(grid, { childList:true, subtree:true });
  }

  function simplifySettingsCards() {
    const minSpin = document.getElementById('minSpin')?.closest('label.field');
    const maxSpin = document.getElementById('maxSpin')?.closest('label.field');
    const minTurns = document.getElementById('minTurns')?.closest('label.field');
    [minSpin, maxSpin, minTurns].forEach(label => label?.classList.add('simple-advanced-field'));
    document.getElementById('spinMotionCard')?.classList.add('settings-advanced-card');
    document.getElementById('spinDramaCard')?.classList.add('settings-advanced-card');
  }

  function scan() {
    scheduled = false;
    simplifyHeader();
    simplifyIntro();
    simplifyTabsAndToolbars();
    ensureModeToggle();
    ensureSimpleSettings();
    simplifySettingsCards();
    simplifyRuleArea();
    forfeitList.querySelectorAll('.forfeit-editor-card[data-id]').forEach(simplifyForfeitCard);
    levelList?.querySelectorAll('.level-editor-card').forEach(simplifyLevelCard);
    const search = document.getElementById('forfeitSearchInput');
    if (search && !search.dataset.simplePlaceholder) {
      search.dataset.simplePlaceholder = '1';
      search.placeholder = 'Search entries…';
    }
    syncSaveStatus();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  simplifyHeader();
  simplifyIntro();
  simplifyTabsAndToolbars();
  ensureModeToggle();
  ensureSimpleSettings();
  scan();

  new MutationObserver(schedule).observe(forfeitList, { childList:true, subtree:true });
  if (levelList) new MutationObserver(schedule).observe(levelList, { childList:true, subtree:true });
  const settingsGrid = document.querySelector('#tab-settings .settings-grid');
  if (settingsGrid) new MutationObserver(schedule).observe(settingsGrid, { childList:true, subtree:true });
  new MutationObserver(syncSaveStatus).observe(body, { attributes:true, attributeFilter:['class'] });
  window.addEventListener('fortune-editor-refreshed', () => setTimeout(schedule, 0));
  window.addEventListener('fortune-ai-applied', () => setTimeout(schedule, 0));
})();
