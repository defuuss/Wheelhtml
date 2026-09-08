(() => {
  'use strict';

  const picker = document.getElementById('pictogramPicker');
  if (!picker) return;

  const search = document.getElementById('pictogramSearch');
  const baseCategories = document.getElementById('pictogramCategories');
  const grid = document.getElementById('pictogramGrid');
  const foot = picker.querySelector('.pictogram-picker-foot');
  if (!search || !baseCategories || !grid) return;

  const extras = [
    { emoji:'⛓️', keywords:'chains handcuffs cuffs restraint restraints bondage linked', category:'Restraint' },
    { emoji:'🔗', keywords:'link chain handcuffs cuffs restraint restraints', category:'Restraint' },
    { emoji:'🪢', keywords:'knot rope restraint tie tied binding', category:'Restraint' },
    { emoji:'🔒', keywords:'lock locked restraint secure cuffs', category:'Restraint' },
    { emoji:'🔓', keywords:'unlock release restraint free', category:'Restraint' },
    { emoji:'🔑', keywords:'key release unlock handcuffs cuffs', category:'Restraint' },
    { emoji:'🤐', keywords:'gag ballgag mouth gagged quiet silence approximate', category:'Restraint' },
    { emoji:'😶', keywords:'gag mouth covered silent ballgag approximate', category:'Restraint' },

    { emoji:'🪒', keywords:'razor shave shaving blade hair removal', category:'Medical' },
    { emoji:'💉', keywords:'syringe injection needle medical shot', category:'Medical' },
    { emoji:'🩺', keywords:'medical doctor stethoscope examination', category:'Medical' },
    { emoji:'🩹', keywords:'bandage plaster dressing medical wound', category:'Medical' },
    { emoji:'💊', keywords:'pill medicine medication medical', category:'Medical' },
    { emoji:'🧪', keywords:'test tube sample medical laboratory', category:'Medical' },
    { emoji:'🩸', keywords:'blood drop medical', category:'Medical' },
    { emoji:'🧤', keywords:'glove gloves medical latex examination', category:'Medical' },
    { emoji:'🧴', keywords:'bottle lotion gel lubricant liquid medical enema approximate', category:'Medical' },
    { emoji:'💧', keywords:'water liquid drop rinse irrigation enema approximate', category:'Medical' },
    { emoji:'🚿', keywords:'shower rinse wash irrigation enema approximate', category:'Medical' },
    { emoji:'🫗', keywords:'pour liquid rinse irrigation fluid enema approximate', category:'Medical' },
    { emoji:'🧻', keywords:'tissue toilet paper hygiene cleaning medical', category:'Medical' },
    { emoji:'🚽', keywords:'toilet bathroom hygiene enema approximate', category:'Medical' },
    { emoji:'🧼', keywords:'soap wash clean hygiene medical', category:'Medical' },

    { emoji:'👅', keywords:'tongue mouth body anatomy', category:'Body+' },
    { emoji:'👄', keywords:'mouth lips body anatomy', category:'Body+' },
    { emoji:'👀', keywords:'eyes eye body anatomy', category:'Body+' },
    { emoji:'👂', keywords:'ear body anatomy', category:'Body+' },
    { emoji:'👃', keywords:'nose body anatomy', category:'Body+' },
    { emoji:'💪', keywords:'arm biceps muscle body anatomy', category:'Body+' },
    { emoji:'🦾', keywords:'arm prosthetic arm body anatomy', category:'Body+' },
    { emoji:'🖐️', keywords:'hand fingers palm body anatomy', category:'Body+' },
    { emoji:'✋', keywords:'hand palm body anatomy', category:'Body+' },
    { emoji:'🦵', keywords:'leg knee body anatomy', category:'Body+' },
    { emoji:'🦿', keywords:'leg prosthetic leg body anatomy', category:'Body+' },
    { emoji:'🦶', keywords:'foot feet toes body anatomy', category:'Body+' },
    { emoji:'🧠', keywords:'brain head body anatomy organ', category:'Body+' },
    { emoji:'🫀', keywords:'heart organ body anatomy', category:'Body+' },
    { emoji:'🫁', keywords:'lungs organ chest body anatomy', category:'Body+' },
    { emoji:'🦷', keywords:'tooth teeth mouth body anatomy', category:'Body+' },
    { emoji:'🦴', keywords:'bone body anatomy', category:'Body+' },
    { emoji:'🍑', keywords:'peach bottom butt buttocks adult body shorthand approximate', category:'Body+' },
    { emoji:'🍆', keywords:'eggplant adult body genital genitals penis shorthand approximate', category:'Body+' },
    { emoji:'♀️', keywords:'female anatomy sex genital genitals symbol approximate', category:'Body+' },
    { emoji:'♂️', keywords:'male anatomy sex genital genitals symbol approximate', category:'Body+' },
    { emoji:'⚧️', keywords:'gender anatomy body symbol genital genitals approximate', category:'Body+' },

    { emoji:'✂️', keywords:'scissors cut cutting clothing hair tool', category:'Tools' },
    { emoji:'🪒', keywords:'razor shave shaving blade tool', category:'Tools' },
    { emoji:'🧷', keywords:'safety pin pin clothing tool', category:'Tools' },
    { emoji:'🔧', keywords:'wrench tool repair', category:'Tools' },
    { emoji:'🪛', keywords:'screwdriver tool repair', category:'Tools' }
  ];

  let activeInput = null;
  let extendedCategory = null;

  function recordTarget(event) {
    const trigger = event.target.closest?.('.picker-trigger');
    if (trigger) {
      const input = trigger.closest('.picker-field-wrap')?.querySelector('input');
      if (input) activeInput = input;
      return;
    }
    const preview = event.target.closest?.('.editor-icon-preview');
    if (preview) {
      const input = preview.closest('.forfeit-editor-card')?.querySelector('.js-icon');
      if (input) activeInput = input;
    }
  }

  document.addEventListener('click', recordTarget, true);

  const extraWrap = document.createElement('div');
  extraWrap.className = 'pictogram-categories pictogram-extra-categories';
  extraWrap.setAttribute('aria-label', 'Extended pictogram categories');
  baseCategories.insertAdjacentElement('afterend', extraWrap);

  const style = document.createElement('style');
  style.textContent = `
    .pictogram-extra-categories{margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.07)}
    .pictogram-extra-label{align-self:center;color:var(--muted);font-size:.64rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase;margin-right:2px}
    .pictogram-choice.extended-choice{position:relative}
    .pictogram-choice.extended-choice::after{content:'+';position:absolute;right:4px;top:2px;color:var(--accent);font-size:.58rem;font-weight:900}
    .pictogram-extended-note{grid-column:1/-1;color:var(--muted);font-size:.72rem;padding:5px 2px 2px}
  `;
  document.head.appendChild(style);

  function renderExtraCategoryButtons() {
    extraWrap.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'pictogram-extra-label';
    label.textContent = 'Extended';
    extraWrap.appendChild(label);
    ['Restraint','Medical','Body+','Tools'].forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pictogram-category${extendedCategory === category ? ' active' : ''}`;
      button.textContent = category;
      button.addEventListener('click', () => {
        extendedCategory = category;
        baseCategories.querySelectorAll('.pictogram-category').forEach(b => b.classList.remove('active'));
        renderExtraCategoryButtons();
        renderExtendedGrid();
      });
      extraWrap.appendChild(button);
    });
  }

  function visibleExtras(category = null) {
    const q = search.value.trim().toLowerCase();
    return extras.filter(item => (!category || item.category === category) && (!q || `${item.emoji} ${item.keywords} ${item.category}`.toLowerCase().includes(q)));
  }

  function makeChoice(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pictogram-choice extended-choice';
    button.textContent = item.emoji;
    button.title = item.keywords.split(' ').slice(0, 6).join(' ');
    button.setAttribute('aria-label', item.keywords);
    button.addEventListener('click', () => choose(item.emoji));
    return button;
  }

  function renderExtendedGrid() {
    if (!extendedCategory) return;
    const items = visibleExtras(extendedCategory);
    grid.innerHTML = '';
    items.forEach(item => grid.appendChild(makeChoice(item)));
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'pictogram-empty';
      empty.textContent = 'No matching extended pictogram.';
      grid.appendChild(empty);
    }
    const note = document.createElement('div');
    note.className = 'pictogram-extended-note';
    note.textContent = 'Some concepts do not have an exact Unicode emoji; entries marked as approximate use the closest standard symbol.';
    grid.appendChild(note);
  }

  function appendSearchMatches() {
    if (extendedCategory) {
      renderExtendedGrid();
      return;
    }
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const matches = visibleExtras();
    if (!matches.length) return;
    const separator = document.createElement('div');
    separator.className = 'pictogram-extended-note';
    separator.textContent = 'Extended matches';
    grid.appendChild(separator);
    matches.forEach(item => grid.appendChild(makeChoice(item)));
  }

  function choose(emoji) {
    if (!activeInput || !activeInput.isConnected) return;
    activeInput.value = emoji;
    activeInput.dispatchEvent(new Event('input', { bubbles:true }));
    activeInput.dispatchEvent(new Event('change', { bubbles:true }));
    picker.hidden = true;
    extendedCategory = null;
    renderExtraCategoryButtons();
  }

  baseCategories.addEventListener('click', event => {
    if (!event.target.closest('.pictogram-category')) return;
    extendedCategory = null;
    renderExtraCategoryButtons();
  });

  search.addEventListener('input', () => setTimeout(appendSearchMatches, 0));

  new MutationObserver(() => {
    if (!picker.hidden) {
      extendedCategory = null;
      renderExtraCategoryButtons();
      setTimeout(appendSearchMatches, 0);
    }
  }).observe(picker, { attributes:true, attributeFilter:['hidden'] });

  if (foot && !foot.dataset.extendedNote) {
    foot.dataset.extendedNote = '1';
    foot.textContent += ' Extended categories include standard Unicode approximations for concepts that have no dedicated emoji.';
  }

  renderExtraCategoryButtons();
})();
