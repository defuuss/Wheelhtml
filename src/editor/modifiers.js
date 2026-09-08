(() => {
  'use strict';
  window.FortuneModifierEditor = { mount(card, item, changed) {
    const settings = item.modifierWheel = window.FortuneFeatures.normalizeModifier(item.modifierWheel);
    const panel = document.createElement('details'); panel.className = 'modifier-editor';
    const summary = document.createElement('summary'); summary.textContent = 'Modifier wheel';
    const content = document.createElement('div'); content.className = 'modifier-editor-content';
    const enabledLabel = document.createElement('label'); enabledLabel.className = 'check-line';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = settings.enabled;
    enabledLabel.append(enabled, document.createTextNode('Spin a modifier after this forfeit is selected'));
    const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Add your own instructions. Weight controls the chance of each outcome. Timer × changes this result’s timer only (up to 60 minutes); 1 keeps it unchanged.';
    const chanceLabel = document.createElement('label'); chanceLabel.className = 'field'; chanceLabel.textContent = 'Trigger chance (%)';
    const chance = document.createElement('input'); chance.type = 'number'; chance.min = '0'; chance.max = '100'; chance.value = settings.chance;
    chance.oninput = () => { settings.chance = Math.max(0, Math.min(100, Number(chance.value) || 0)); changed(); };
    chanceLabel.append(chance);
    const fields = document.createElement('div'); fields.hidden = !settings.enabled;
    const rows = document.createElement('div'); rows.className = 'modifier-rows';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn ghost'; add.textContent = '+ Add modifier';
    function renderRows() {
      rows.replaceChildren();
      settings.outcomes.forEach((entry, index) => {
        const row = document.createElement('div'); row.className = 'modifier-row';
        function field(label, key, type = 'text', min, max) {
          const wrap = document.createElement('label'); wrap.className = 'field'; wrap.textContent = label;
          const input = document.createElement(key === 'description' ? 'textarea' : 'input');
          if (input.tagName === 'INPUT') input.type = type;
          input.value = entry[key];
          if (type === 'number') { input.min = min; input.max = max; input.step = '.1'; }
          else input.maxLength = key === 'description' ? 240 : 60;
          input.oninput = () => { entry[key] = type === 'number' ? Math.max(min, Math.min(max, Number(input.value) || min)) : input.value; changed(); };
          wrap.append(input); row.append(wrap);
        }
        field('Outcome name', 'name'); field('Instruction', 'description'); field('Weight', 'weight', 'number', .1, 100); field('Timer ×', 'timerMultiplier', 'number', .25, 4);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn danger-soft'; remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove modifier ${index + 1}`);
        remove.onclick = () => { settings.outcomes.splice(index, 1); renderRows(); changed(); };
        row.append(remove); rows.append(row);
      });
      add.disabled = settings.outcomes.length >= 24;
      if (!settings.outcomes.length) { const empty = document.createElement('p'); empty.textContent = 'Add at least one outcome to use this modifier wheel.'; rows.append(empty); }
    }
    add.onclick = () => { settings.outcomes.push({ name: 'New modifier', description: '', weight: 1, timerMultiplier: 1 }); renderRows(); changed(); rows.lastElementChild?.querySelector('input')?.focus(); };
    enabled.onchange = () => {
      settings.enabled = enabled.checked; fields.hidden = !settings.enabled;
      summary.textContent = settings.enabled ? 'Modifier wheel · enabled' : 'Modifier wheel'; changed();
    };
    summary.textContent = settings.enabled ? 'Modifier wheel · enabled' : 'Modifier wheel';
    fields.append(note, chanceLabel, rows, add); content.append(enabledLabel, fields); panel.append(summary, content); card.append(panel); renderRows();
  } };
})();
