(() => {
  'use strict';

  const forfeitList = document.getElementById('forfeitEditorList');
  const levelList = document.getElementById('levelEditorList');
  const forfeitPane = document.getElementById('tab-forfeits');
  if (!forfeitList || !forfeitPane) return;

  const expandedCards = new Set();
  const collapsedGroups = new Set();
  let currentSearch = '';
  let listObserver;
  let levelObserver;
  let groupTimer;
  let levelTimer;
  let activeIconInput = null;
  let pickerCategory = 'All';

  const pictograms = [
    ['🎯','target challenge goal','Common'],['⭐','star bonus favorite','Common'],['✨','sparkles magic surprise','Common'],['🎁','gift mystery reward','Common'],['❓','question mystery unknown','Common'],['🎲','dice random game','Common'],['🏆','trophy winner reward','Common'],['⚡','lightning power fast','Common'],['🔥','fire hot intense','Common'],['💥','boom impact','Common'],['💫','dizzy spin','Common'],['🔔','bell alert','Common'],
    ['😀','smile happy face','People'],['😈','devil mischievous','People'],['😇','angel innocent','People'],['😂','laugh funny','People'],['🤣','laugh rolling','People'],['😳','blush embarrassed','People'],['😱','shock scream','People'],['🤭','giggle teasing','People'],['🤫','quiet secret','People'],['😜','wink tongue tease','People'],['🥳','party celebrate','People'],['🤪','crazy silly','People'],['😎','cool sunglasses','People'],['🙈','monkey hide eyes','People'],['🙊','monkey secret','People'],
    ['👕','shirt tshirt clothing','Clothing'],['👚','blouse shirt clothing','Clothing'],['👖','pants trousers jeans clothing','Clothing'],['🩳','shorts clothing','Clothing'],['👗','dress clothing','Clothing'],['🧥','coat jacket clothing','Clothing'],['🧦','socks clothing feet','Clothing'],['👟','shoe sneaker shoes','Clothing'],['👞','shoe formal shoes','Clothing'],['👠','heel high heel shoe','Clothing'],['👢','boot shoes','Clothing'],['🩴','flip flop sandal','Clothing'],['🧢','cap hat clothing','Clothing'],['👒','hat clothing','Clothing'],['🎩','top hat','Clothing'],['🧤','gloves clothing','Clothing'],['🧣','scarf clothing','Clothing'],['🕶️','sunglasses glasses','Clothing'],
    ['🪶','feather tickle soft','Actions'],['👏','clap hands action','Actions'],['👋','wave hand','Actions'],['🤚','raised hand','Actions'],['✋','stop hand','Actions'],['👌','ok hand','Actions'],['🤏','pinch small','Actions'],['👉','point right','Actions'],['👈','point left','Actions'],['👆','point up','Actions'],['👇','point down','Actions'],['👍','thumb up','Actions'],['👎','thumb down','Actions'],['💪','strong arm','Actions'],['🫶','heart hands','Actions'],['🕺','dance man','Actions'],['💃','dance woman','Actions'],['🏃','run running','Actions'],['🧘','relax meditation','Actions'],['🤸','gymnast flip','Actions'],
    ['👀','eyes look watch','Body'],['👁️','eye look','Body'],['👂','ear listen','Body'],['👃','nose smell','Body'],['👄','mouth lips','Body'],['👅','tongue','Body'],['🦶','foot feet','Body'],['🦵','leg','Body'],['💅','nails manicure','Body'],['🧠','brain think','Body'],['❤️','heart love','Body'],['💓','beating heart','Body'],
    ['🍕','pizza food','Food'],['🍔','burger food','Food'],['🌭','hotdog food','Food'],['🍟','fries food','Food'],['🍿','popcorn snack','Food'],['🍫','chocolate sweet','Food'],['🍬','candy sweet','Food'],['🍭','lollipop sweet','Food'],['🍪','cookie biscuit','Food'],['🧁','cupcake cake','Food'],['🍦','ice cream','Food'],['☕','coffee drink','Food'],['🥤','drink cup','Food'],['💧','water drop','Food'],
    ['🎵','music note','Fun'],['🎤','microphone sing karaoke','Fun'],['🎧','headphones music','Fun'],['🎮','game controller videogame','Fun'],['🃏','joker card game','Fun'],['🧩','puzzle game','Fun'],['🎨','paint art','Fun'],['📸','camera photo','Fun'],['🎬','movie film','Fun'],['🎉','party popper celebration','Fun'],['🎊','confetti celebration','Fun'],['🪩','disco dance','Fun'],['🛋️','sofa couch','Fun'],['🛏️','bed sleep','Fun'],
    ['⏱️','timer stopwatch time','Objects'],['⏳','hourglass time wait','Objects'],['🔒','lock locked','Objects'],['🔓','unlock open','Objects'],['🔑','key unlock','Objects'],['💡','idea light bulb','Objects'],['📱','phone mobile','Objects'],['📷','camera photo','Objects'],['🪞','mirror','Objects'],['🪑','chair','Objects'],['🧹','broom clean','Objects'],['🧊','ice cold','Objects'],['🕯️','candle','Objects'],['🧸','teddy bear','Objects'],['🪄','magic wand','Objects'],['🧲','magnet','Objects'],
    ['✅','check yes complete','Symbols'],['❌','cross no fail','Symbols'],['⭕','circle','Symbols'],['🚫','forbidden stop','Symbols'],['⚠️','warning caution','Symbols'],['🔁','repeat again','Symbols'],['🔀','shuffle random','Symbols'],['⬆️','up increase level','Symbols'],['⬇️','down decrease','Symbols'],['➡️','right next','Symbols'],['⬅️','left back','Symbols'],['▶️','play start','Symbols'],['⏸️','pause','Symbols'],['🆘','sos help','Symbols'],['💯','hundred perfect','Symbols'],['♾️','infinity forever','Symbols']
  ].map(([emoji, keywords, category]) => ({ emoji, keywords, category }));

  function debounceGroup() {
    clearTimeout(groupTimer);
    groupTimer = setTimeout(groupForfeits, 0);
  }

  function debounceLevels() {
    clearTimeout(levelTimer);
    levelTimer = setTimeout(() => {
      enhanceLevelIconInputs();
      debounceGroup();
    }, 0);
  }

  function initToolbar() {
    if (document.getElementById('forfeitEnhancementTools')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'forfeitEnhancementTools';
    toolbar.className = 'forfeit-tools';
    toolbar.innerHTML = `
      <label class="forfeit-search" aria-label="Search forfeits">
        <input id="forfeitSearchInput" type="search" placeholder="Search forfeits, categories or IDs…">
        <span>⌕</span>
      </label>
      <span id="forfeitShownCount" class="tool-count"></span>
      <button id="expandAllGroups" class="btn ghost" type="button">Expand groups</button>
      <button id="collapseAllGroups" class="btn ghost" type="button">Collapse groups</button>`;
    const editorToolbar = forfeitPane.querySelector('.editor-toolbar');
    editorToolbar.insertAdjacentElement('afterend', toolbar);

    document.getElementById('forfeitSearchInput').addEventListener('input', event => {
      currentSearch = event.target.value.trim().toLowerCase();
      applySearchFilter();
    });
    document.getElementById('expandAllGroups').addEventListener('click', () => {
      collapsedGroups.clear();
      forfeitList.querySelectorAll('.forfeit-group').forEach(group => group.classList.remove('collapsed'));
    });
    document.getElementById('collapseAllGroups').addEventListener('click', () => {
      forfeitList.querySelectorAll('.forfeit-group').forEach(group => {
        collapsedGroups.add(group.dataset.levelId);
        group.classList.add('collapsed');
      });
    });
  }

  function getLevelMeta(cards) {
    const firstSelect = cards[0]?.querySelector('.js-level');
    if (!firstSelect) return [];
    const levelCards = [...document.querySelectorAll('#levelEditorList .level-editor-card')];
    return [...firstSelect.options].map((option, index) => {
      const levelCard = levelCards[index];
      return {
        id: option.value,
        name: levelCard?.querySelector('.js-level-name')?.value || option.textContent.trim() || 'Group',
        icon: levelCard?.querySelector('.js-level-icon')?.value || '◆',
        color: levelCard?.querySelector('.js-level-color')?.value || '#64748b',
        activeAtStart: !!levelCard?.querySelector('.js-level-start')?.checked
      };
    });
  }

  function cardSearchText(card) {
    return [
      card.dataset.id,
      card.querySelector('.js-name')?.value,
      card.querySelector('.js-category')?.value,
      card.querySelector('.js-description')?.value,
      card.querySelector('.js-icon')?.value
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function cardStats(card) {
    const weight = Number(card.querySelector('.js-weight')?.value || 0);
    const enabled = !!card.querySelector('.js-enabled')?.checked;
    return { weight: Number.isFinite(weight) ? weight : 0, enabled };
  }

  function groupForfeits() {
    if (!forfeitList.isConnected) return;
    const cards = [...forfeitList.querySelectorAll('.forfeit-editor-card')];
    if (!cards.length) {
      forfeitList.classList.remove('grouped-forfeits');
      updateShownCount(0, 0);
      return;
    }

    listObserver?.disconnect();
    cards.forEach(enhanceForfeitCard);
    const levels = getLevelMeta(cards);
    const levelMap = new Map(levels.map(level => [level.id, level]));
    const grouped = new Map(levels.map(level => [level.id, []]));
    const unassigned = [];

    cards.forEach(card => {
      const levelId = card.querySelector('.js-level')?.value;
      if (grouped.has(levelId)) grouped.get(levelId).push(card);
      else unassigned.push(card);
    });

    forfeitList.innerHTML = '';
    forfeitList.classList.add('grouped-forfeits');

    levels.forEach(level => {
      const groupCards = grouped.get(level.id) || [];
      if (groupCards.length) forfeitList.appendChild(buildGroup(level, groupCards));
    });
    if (unassigned.length) {
      forfeitList.appendChild(buildGroup({ id: '__unassigned__', name: 'Unassigned', icon: '❔', color: '#64748b', activeAtStart: false }, unassigned));
    }

    observeForfeits();
    applySearchFilter();
  }

  function buildGroup(level, cards) {
    const section = document.createElement('section');
    section.className = 'forfeit-group';
    section.dataset.levelId = level.id;
    section.style.setProperty('--group-color', level.color);
    if (collapsedGroups.has(level.id) && !currentSearch) section.classList.add('collapsed');

    const totalWeight = cards.reduce((sum, card) => sum + cardStats(card).weight, 0);
    const enabledCount = cards.filter(card => cardStats(card).enabled).length;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'forfeit-group-head';
    head.innerHTML = `
      <span class="forfeit-group-icon"></span>
      <span class="forfeit-group-title"><strong></strong><small></small></span>
      <span class="forfeit-group-badges"></span>
      <span class="forfeit-group-chevron">⌄</span>`;
    head.querySelector('.forfeit-group-icon').textContent = level.icon;
    head.querySelector('.forfeit-group-title strong').textContent = level.name;
    head.querySelector('.forfeit-group-title small').textContent = `${cards.length} ${cards.length === 1 ? 'entry' : 'entries'} · ${enabledCount} enabled`;
    const badges = head.querySelector('.forfeit-group-badges');
    badges.appendChild(makeBadge(`Weight ${totalWeight.toFixed(1)}`));
    if (level.activeAtStart) badges.appendChild(makeBadge('ACTIVE AT START', 'start'));

    const body = document.createElement('div');
    body.className = 'forfeit-group-body';
    cards.forEach(card => body.appendChild(card));
    head.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      if (collapsed) collapsedGroups.add(level.id); else collapsedGroups.delete(level.id);
    });
    section.append(head, body);
    return section;
  }

  function makeBadge(text, extraClass = '') {
    const badge = document.createElement('span');
    badge.className = `group-badge ${extraClass}`.trim();
    badge.textContent = text;
    return badge;
  }

  function enhanceForfeitCard(card) {
    if (card.dataset.enhancedForfeits === '1') return;
    card.dataset.enhancedForfeits = '1';
    const id = card.dataset.id || '';
    if (expandedCards.has(id)) card.classList.add('is-expanded');

    const actions = card.querySelector('.editor-head-actions');
    if (actions) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'icon-btn detail-toggle';
      toggle.textContent = card.classList.contains('is-expanded') ? 'Hide' : 'Details';
      toggle.title = 'Show or hide full forfeit settings';
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        const expanded = card.classList.toggle('is-expanded');
        toggle.textContent = expanded ? 'Hide' : 'Details';
        if (expanded) expandedCards.add(id); else expandedCards.delete(id);
      });
      actions.insertBefore(toggle, actions.firstChild);
    }

    const titleBlock = card.querySelector('.editor-title-block');
    if (titleBlock && !titleBlock.querySelector('.forfeit-compact-meta')) {
      const meta = document.createElement('div');
      meta.className = 'forfeit-compact-meta';
      titleBlock.appendChild(meta);
      const refresh = () => updateCompactMeta(card, meta);
      ['.js-weight','.js-category','.js-lifetime-type','.js-cooldown','.js-mystery','.js-enabled'].forEach(selector => {
        const node = card.querySelector(selector);
        node?.addEventListener('input', refresh);
        node?.addEventListener('change', refresh);
      });
      updateCompactMeta(card, meta);
    }

    const iconInput = card.querySelector('.js-icon');
    if (iconInput) attachPickerButton(iconInput, 'Choose forfeit pictogram');
    const preview = card.querySelector('.editor-icon-preview');
    if (preview && iconInput) {
      preview.classList.add('picker-enabled');
      preview.title = 'Choose pictogram';
      preview.addEventListener('click', () => openPicker(iconInput, 'Choose forfeit pictogram'));
    }

    card.querySelector('.js-level')?.addEventListener('change', debounceGroup);
    card.querySelector('.js-weight')?.addEventListener('input', debounceGroup);
    card.querySelector('.js-enabled')?.addEventListener('change', debounceGroup);
    ['.js-name','.js-category','.js-description'].forEach(selector => card.querySelector(selector)?.addEventListener('input', applySearchFilter));
  }

  function updateCompactMeta(card, meta) {
    const category = card.querySelector('.js-category')?.value || 'Uncategorized';
    const weight = Number(card.querySelector('.js-weight')?.value || 0);
    const lifetime = card.querySelector('.js-lifetime-type')?.value || 'forever';
    const cooldown = Number(card.querySelector('.js-cooldown')?.value || 0);
    const mystery = !!card.querySelector('.js-mystery')?.checked;
    const enabled = !!card.querySelector('.js-enabled')?.checked;
    meta.innerHTML = '';
    [category, `weight ${Number.isFinite(weight) ? weight : 0}`, lifetime === 'once' ? 'one-time' : lifetime === 'spins' ? 'timed' : 'forever', cooldown ? `cooldown ${cooldown}` : null, mystery ? 'mystery' : null, enabled ? null : 'disabled']
      .filter(Boolean)
      .forEach(text => { const span = document.createElement('span'); span.textContent = text; meta.appendChild(span); });
  }

  function applySearchFilter() {
    const groups = [...forfeitList.querySelectorAll('.forfeit-group')];
    let total = 0;
    let shown = 0;
    groups.forEach(group => {
      const cards = [...group.querySelectorAll('.forfeit-editor-card')];
      let visibleInGroup = 0;
      cards.forEach(card => {
        total++;
        const visible = !currentSearch || cardSearchText(card).includes(currentSearch);
        card.hidden = !visible;
        if (visible) { shown++; visibleInGroup++; }
      });
      group.classList.toggle('is-filtered-empty', visibleInGroup === 0);
      if (currentSearch && visibleInGroup) group.classList.remove('collapsed');
      else if (!currentSearch) group.classList.toggle('collapsed', collapsedGroups.has(group.dataset.levelId));
    });
    updateShownCount(shown, total);
  }

  function updateShownCount(shown, total) {
    const node = document.getElementById('forfeitShownCount');
    if (!node) return;
    node.textContent = total ? `${shown} of ${total} shown` : 'No forfeits';
  }

  function attachPickerButton(input, title) {
    if (!input || input.dataset.pickerEnhanced === '1') return;
    input.dataset.pickerEnhanced = '1';
    const parent = input.parentNode;
    const wrapper = document.createElement('div');
    wrapper.className = 'picker-field-wrap';
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-trigger';
    button.textContent = 'Choose';
    button.addEventListener('click', () => openPicker(input, title));
    wrapper.appendChild(button);
  }

  function enhanceLevelIconInputs() {
    document.querySelectorAll('#levelEditorList .js-level-icon').forEach(input => attachPickerButton(input, 'Choose group pictogram'));
  }

  function initPicker() {
    if (document.getElementById('pictogramPicker')) return;
    const picker = document.createElement('div');
    picker.id = 'pictogramPicker';
    picker.className = 'pictogram-picker';
    picker.hidden = true;
    picker.innerHTML = `
      <div class="pictogram-picker-backdrop"></div>
      <section class="pictogram-picker-panel" role="dialog" aria-modal="true" aria-labelledby="pictogramPickerTitle">
        <div class="pictogram-picker-head">
          <div><h2 id="pictogramPickerTitle">Choose pictogram</h2><p>Pick one visually or search by meaning.</p></div>
          <button class="pictogram-picker-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="pictogram-picker-search"><input id="pictogramSearch" type="search" placeholder="Search: shoes, mystery, music, warning…"></div>
        <div id="pictogramCategories" class="pictogram-categories"></div>
        <div id="pictogramGrid" class="pictogram-grid"></div>
        <div class="pictogram-picker-foot">The picker uses standard Unicode pictograms, so it stays free and works without an external icon service. You can still type any emoji manually.</div>
      </section>`;
    document.body.appendChild(picker);
    picker.querySelector('.pictogram-picker-backdrop').addEventListener('click', closePicker);
    picker.querySelector('.pictogram-picker-close').addEventListener('click', closePicker);
    picker.querySelector('#pictogramSearch').addEventListener('input', renderPickerGrid);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !picker.hidden) closePicker(); });
    renderPickerCategories();
    renderPickerGrid();
  }

  function openPicker(input, title) {
    const picker = document.getElementById('pictogramPicker');
    if (!picker) return;
    activeIconInput = input;
    pickerCategory = 'All';
    picker.querySelector('#pictogramPickerTitle').textContent = title || 'Choose pictogram';
    picker.querySelector('#pictogramSearch').value = '';
    picker.hidden = false;
    renderPickerCategories();
    renderPickerGrid();
    setTimeout(() => picker.querySelector('#pictogramSearch').focus(), 0);
  }

  function closePicker() {
    const picker = document.getElementById('pictogramPicker');
    if (picker) picker.hidden = true;
    activeIconInput = null;
  }

  function renderPickerCategories() {
    const wrap = document.getElementById('pictogramCategories');
    if (!wrap) return;
    const categories = ['All', ...new Set(pictograms.map(item => item.category))];
    wrap.innerHTML = '';
    categories.forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pictogram-category${category === pickerCategory ? ' active' : ''}`;
      button.textContent = category;
      button.addEventListener('click', () => { pickerCategory = category; renderPickerCategories(); renderPickerGrid(); });
      wrap.appendChild(button);
    });
  }

  function renderPickerGrid() {
    const grid = document.getElementById('pictogramGrid');
    const search = document.getElementById('pictogramSearch');
    if (!grid || !search) return;
    const query = search.value.trim().toLowerCase();
    const visible = pictograms.filter(item => (pickerCategory === 'All' || item.category === pickerCategory) && (!query || `${item.emoji} ${item.keywords} ${item.category}`.toLowerCase().includes(query)));
    grid.innerHTML = '';
    visible.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pictogram-choice';
      button.textContent = item.emoji;
      button.title = item.keywords.split(' ').slice(0, 4).join(' ');
      button.setAttribute('aria-label', item.keywords);
      button.addEventListener('click', () => choosePictogram(item.emoji));
      grid.appendChild(button);
    });
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'pictogram-empty';
      empty.textContent = 'No matching pictogram. You can close the picker and type any emoji manually.';
      grid.appendChild(empty);
    }
  }

  function choosePictogram(emoji) {
    const input = activeIconInput;
    const picker = document.getElementById('pictogramPicker');
    if (picker) picker.hidden = true;
    activeIconInput = null;
    if (!input || !input.isConnected) return;
    input.value = emoji;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function observeForfeits() {
    listObserver?.disconnect();
    listObserver = new MutationObserver(debounceGroup);
    listObserver.observe(forfeitList, { childList: true });
  }

  function observeLevels() {
    levelObserver?.disconnect();
    levelObserver = new MutationObserver(debounceLevels);
    levelObserver.observe(levelList, { childList: true, subtree: true });
  }

  initToolbar();
  initPicker();
  enhanceLevelIconInputs();
  observeForfeits();
  observeLevels();
  groupForfeits();
})();
