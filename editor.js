(() => {
  'use strict';

  const M = window.FortuneModel;
  let draft = M.deepClone(M.loadConfig());

  const $ = id => document.getElementById(id);
  const forfeitList = $('forfeitEditorList');
  const levelList = $('levelEditorList');
  const ruleList = $('ruleEditorList');
  const forfeitTemplate = $('forfeitTemplate');
  const levelTemplate = $('levelTemplate');
  const ruleTemplate = $('ruleTemplate');
  const fileInput = $('editorFileInput');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function renderAll() {
    renderForfeits();
    renderLevels();
    renderRules();
    renderSettings();
    renderSummary();
  }

  function renderSummary() {
    $('summaryForfeits').textContent = draft.forfeits.length;
    $('summaryLevels').textContent = draft.levels.length;
    $('summaryWeight').textContent = draft.forfeits.reduce((sum, item) => sum + Number(item.weight || 0), 0).toFixed(1);
  }

  function makeLevelOptions(selected) {
    return draft.levels.map(level => `<option value="${escapeHtml(level.id)}" ${level.id === selected ? 'selected' : ''}>${escapeHtml(level.icon)} ${escapeHtml(level.name)}</option>`).join('');
  }

  function renderUnlockChecks(container, item) {
    container.innerHTML = '';
    draft.levels.forEach(level => {
      const label = document.createElement('label');
      label.className = 'unlock-chip';
      label.style.setProperty('--chip-color', level.color);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = item.unlockLevels.includes(level.id);
      input.addEventListener('change', () => {
        if (input.checked && !item.unlockLevels.includes(level.id)) item.unlockLevels.push(level.id);
        if (!input.checked) item.unlockLevels = item.unlockLevels.filter(id => id !== level.id);
        markDirty();
      });
      const span = document.createElement('span');
      span.textContent = `${level.icon} ${level.name}`;
      label.append(input, span);
      container.appendChild(label);
    });
  }

  function renderForfeits() {
    forfeitList.innerHTML = '';
    draft.forfeits.forEach((item, index) => {
      const card = forfeitTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.id = item.id;
      const preview = card.querySelector('.editor-icon-preview');
      const name = card.querySelector('.js-name');
      const icon = card.querySelector('.js-icon');
      const color = card.querySelector('.js-color');
      const weight = card.querySelector('.js-weight');
      const level = card.querySelector('.js-level');
      const category = card.querySelector('.js-category');
      const animation = card.querySelector('.js-animation');
      const lifetimeType = card.querySelector('.js-lifetime-type');
      const lifetimeCount = card.querySelector('.js-lifetime-count');
      const lifetimeCountWrap = card.querySelector('.js-lifetime-count-wrap');
      const cooldown = card.querySelector('.js-cooldown');
      const eventType = card.querySelector('.js-event-type');
      const description = card.querySelector('.js-description');
      const mystery = card.querySelector('.js-mystery');
      const enabled = card.querySelector('.js-enabled');

      preview.textContent = item.mystery ? '❓' : item.icon;
      preview.style.setProperty('--preview-color', item.color);
      name.value = item.name;
      icon.value = item.icon;
      color.value = item.color;
      weight.value = item.weight;
      level.innerHTML = makeLevelOptions(item.levelId);
      category.value = item.category;
      animation.value = item.animation;
      lifetimeType.value = item.lifetime.type;
      lifetimeCount.value = item.lifetime.spins;
      lifetimeCountWrap.hidden = item.lifetime.type !== 'spins';
      cooldown.value = item.cooldown;
      eventType.value = item.eventType;
      description.value = item.description;
      mystery.checked = item.mystery;
      enabled.checked = item.enabled;
      card.querySelector('.js-id-label').textContent = `#${item.id}`;
      renderUnlockChecks(card.querySelector('.js-unlock-checks'), item);

      bindInput(name, value => item.name = value.slice(0, 60));
      bindInput(icon, value => { item.icon = value.slice(0, 12) || '🎯'; preview.textContent = item.mystery ? '❓' : item.icon; });
      bindInput(color, value => { item.color = value; preview.style.setProperty('--preview-color', value); });
      bindInput(weight, value => item.weight = clamp(value, 0.1, 100, 1), true);
      bindInput(level, value => item.levelId = value);
      bindInput(category, value => item.category = value.slice(0, 30));
      bindInput(animation, value => item.animation = value);
      bindInput(lifetimeType, value => { item.lifetime.type = value; lifetimeCountWrap.hidden = value !== 'spins'; });
      bindInput(lifetimeCount, value => item.lifetime.spins = Math.round(clamp(value, 1, 999, 3)), true);
      bindInput(cooldown, value => item.cooldown = Math.round(clamp(value, 0, 99, 0)), true);
      bindInput(eventType, value => item.eventType = value);
      bindInput(description, value => item.description = value.slice(0, 240));
      mystery.addEventListener('change', () => { item.mystery = mystery.checked; preview.textContent = item.mystery ? '❓' : item.icon; markDirty(); });
      enabled.addEventListener('change', () => { item.enabled = enabled.checked; markDirty(); });

      card.querySelector('.js-delete').addEventListener('click', () => {
        const removedId = item.id;
        draft.forfeits.splice(index, 1);
        draft.rules.forEach(rule => { rule.conditionForfeitIds = rule.conditionForfeitIds.filter(id => id !== removedId); });
        renderForfeits(); renderRules(); renderSummary(); markDirty();
      });
      card.querySelector('.js-duplicate').addEventListener('click', () => {
        const copy = M.deepClone(item);
        copy.id = M.makeId('forfeit');
        copy.name = `${copy.name} Copy`.slice(0, 60);
        draft.forfeits.splice(index + 1, 0, copy);
        renderForfeits(); renderSummary(); markDirty();
      });
      forfeitList.appendChild(card);
    });
    if (!draft.forfeits.length) forfeitList.innerHTML = '<div class="editor-empty">No wheel entries yet. Add your first forfeit or special event.</div>';
  }

  function bindInput(node, handler, numeric = false) {
    const eventName = node.tagName === 'SELECT' ? 'change' : 'input';
    node.addEventListener(eventName, () => { handler(numeric ? Number(node.value) : node.value); renderSummary(); markDirty(); });
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function renderLevels() {
    levelList.innerHTML = '';
    draft.levels.forEach((level, index) => {
      const card = levelTemplate.content.firstElementChild.cloneNode(true);
      const name = card.querySelector('.js-level-name');
      const icon = card.querySelector('.js-level-icon');
      const color = card.querySelector('.js-level-color');
      const active = card.querySelector('.js-level-start');
      name.value = level.name; icon.value = level.icon; color.value = level.color; active.checked = level.activeAtStart;
      name.addEventListener('input', () => { level.name = name.value.slice(0, 40); markDirty(); });
      name.addEventListener('change', () => { renderForfeits(); renderRules(); });
      icon.addEventListener('input', () => { level.icon = icon.value.slice(0, 10) || '●'; markDirty(); });
      icon.addEventListener('change', () => { renderForfeits(); renderRules(); });
      color.addEventListener('input', () => { level.color = color.value; markDirty(); });
      active.addEventListener('change', () => { level.activeAtStart = active.checked; markDirty(); });
      card.querySelector('.js-level-delete').addEventListener('click', () => {
        if (draft.levels.length <= 1) return toast('At least one group is required.');
        const fallback = draft.levels.find((_, i) => i !== index)?.id;
        const removedId = level.id;
        draft.levels.splice(index, 1);
        draft.forfeits.forEach(item => { if (item.levelId === removedId) item.levelId = fallback; item.unlockLevels = item.unlockLevels.filter(id => id !== removedId); });
        draft.rules.forEach(rule => { rule.unlockLevels = rule.unlockLevels.filter(id => id !== removedId); });
        if (!draft.levels.some(l => l.activeAtStart)) draft.levels[0].activeAtStart = true;
        renderAll(); markDirty();
      });
      levelList.appendChild(card);
    });
  }

  function renderRules() {
    ruleList.innerHTML = '';
    (draft.rules || []).forEach((rule, index) => {
      const card = ruleTemplate.content.firstElementChild.cloneNode(true);
      const name = card.querySelector('.js-rule-name'), mode = card.querySelector('.js-rule-mode'), enabled = card.querySelector('.js-rule-enabled');
      name.value = rule.name; mode.value = rule.mode; enabled.checked = rule.enabled;
      name.addEventListener('input', () => { rule.name = name.value.slice(0, 60); markDirty(); });
      mode.addEventListener('change', () => { rule.mode = mode.value; markDirty(); });
      enabled.addEventListener('change', () => { rule.enabled = enabled.checked; markDirty(); });

      const conditionWrap = card.querySelector('.js-rule-conditions');
      draft.forfeits.forEach(item => {
        const label = document.createElement('label'); label.className = 'unlock-chip'; label.style.setProperty('--chip-color', item.color);
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = rule.conditionForfeitIds.includes(item.id);
        input.addEventListener('change', () => { if (input.checked && !rule.conditionForfeitIds.includes(item.id)) rule.conditionForfeitIds.push(item.id); if (!input.checked) rule.conditionForfeitIds = rule.conditionForfeitIds.filter(id => id !== item.id); markDirty(); });
        const span = document.createElement('span'); span.textContent = `${item.icon} ${item.name}`; label.append(input, span); conditionWrap.appendChild(label);
      });
      if (!draft.forfeits.length) conditionWrap.innerHTML = '<span class="muted mini-note">Add forfeits first.</span>';

      const unlockWrap = card.querySelector('.js-rule-unlocks');
      draft.levels.forEach(level => {
        const label = document.createElement('label'); label.className = 'unlock-chip'; label.style.setProperty('--chip-color', level.color);
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = rule.unlockLevels.includes(level.id);
        input.addEventListener('change', () => { if (input.checked && !rule.unlockLevels.includes(level.id)) rule.unlockLevels.push(level.id); if (!input.checked) rule.unlockLevels = rule.unlockLevels.filter(id => id !== level.id); markDirty(); });
        const span = document.createElement('span'); span.textContent = `${level.icon} ${level.name}`; label.append(input, span); unlockWrap.appendChild(label);
      });
      card.querySelector('.js-rule-delete').addEventListener('click', () => { draft.rules.splice(index, 1); renderRules(); markDirty(); });
      ruleList.appendChild(card);
    });
    if (!(draft.rules || []).length) ruleList.innerHTML = '<div class="editor-empty">No conditional rules. Direct unlocks on a forfeit still work without rules.</div>';
  }

  function renderSettings() {
    const s = draft.settings;
    $('minSpin').value = s.minSpinSeconds; $('maxSpin').value = s.maxSpinSeconds; $('minTurns').value = s.minTurns;
    $('soundEnabled').checked = s.soundEnabled; $('showTextOnWheel').checked = s.showTextOnWheel; $('showProbabilities').checked = s.showProbabilities; $('gameTitle').value = s.title;
  }

  function bindSettings() {
    $('minSpin').addEventListener('input', () => { draft.settings.minSpinSeconds = clamp($('minSpin').value, 3, 20, 6.5); markDirty(); });
    $('maxSpin').addEventListener('input', () => { draft.settings.maxSpinSeconds = clamp($('maxSpin').value, 3, 25, 9.5); markDirty(); });
    $('minTurns').addEventListener('input', () => { draft.settings.minTurns = Math.round(clamp($('minTurns').value, 3, 20, 6)); markDirty(); });
    $('soundEnabled').addEventListener('change', () => { draft.settings.soundEnabled = $('soundEnabled').checked; markDirty(); });
    $('showTextOnWheel').addEventListener('change', () => { draft.settings.showTextOnWheel = $('showTextOnWheel').checked; markDirty(); });
    $('showProbabilities').addEventListener('change', () => { draft.settings.showProbabilities = $('showProbabilities').checked; markDirty(); });
    $('gameTitle').addEventListener('input', () => { draft.settings.title = $('gameTitle').value.slice(0, 60); markDirty(); });
  }

  function addForfeit() {
    const group = draft.levels[0];
    draft.forfeits.push({ id: M.makeId('forfeit'), name: 'New Forfeit', icon: '🎯', color: '#5b8cff', weight: 1, levelId: group.id, category: 'Challenge', description: '', animation: 'zoom', lifetime: { type: 'forever', spins: 3 }, cooldown: 0, eventType: 'normal', mystery: false, enabled: true, unlockLevels: [] });
    renderForfeits(); renderSummary(); markDirty();
    setTimeout(() => forfeitList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function addLevel() {
    draft.levels.push({ id: M.makeId('group'), name: 'New Group', icon: '◆', color: '#7c6cff', activeAtStart: false });
    renderAll(); markDirty(); setTimeout(() => levelList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function addRule() {
    if (!Array.isArray(draft.rules)) draft.rules = [];
    draft.rules.push({ id: M.makeId('rule'), name: 'New Unlock Rule', mode: 'all', conditionForfeitIds: [], unlockLevels: [], enabled: true });
    renderRules(); markDirty(); setTimeout(() => ruleList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function applyChanges() {
    draft = M.saveConfig(draft); M.resetSession(draft); renderAll(); document.body.classList.remove('dirty'); toast('Saved. A fresh play session will use these settings.');
  }
  function markDirty() { document.body.classList.add('dirty'); }
  function toast(message) { const node = $('editorToast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600); }
  async function loadXml(file) { try { draft = await M.readXmlFile(file); renderAll(); markDirty(); toast('XML loaded into editor. Press Apply changes to activate it.'); } catch (error) { toast(error.message || 'Could not load XML.'); } finally { fileInput.value = ''; } }

  document.querySelectorAll('.editor-tab').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.editor-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.editor-pane').forEach(pane => pane.classList.remove('active'));
    $(`tab-${button.dataset.tab}`).classList.add('active');
  }));
  $('addForfeitBtn').addEventListener('click', addForfeit); $('addLevelBtn').addEventListener('click', addLevel); $('addRuleBtn').addEventListener('click', addRule);
  $('applyBtn').addEventListener('click', applyChanges); $('editorSaveBtn').addEventListener('click', () => M.downloadXml(draft)); $('editorLoadBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => loadXml(fileInput.files?.[0]));
  window.addEventListener('beforeunload', event => { if (!document.body.classList.contains('dirty')) return; event.preventDefault(); event.returnValue = ''; });
  bindSettings(); renderAll();
})();
