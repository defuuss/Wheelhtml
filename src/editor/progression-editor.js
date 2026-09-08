(() => {
  'use strict';

  if (window.__fortuneProgressionEditor) return;
  window.__fortuneProgressionEditor = true;

  const M = window.FortuneModel;
  const P = window.FortuneProgressionState;
  if (!M || !P) return;

  function injectStyles() {
    if (document.getElementById('progressionEditorStyles')) return;
    const style = document.createElement('style');
    style.id = 'progressionEditorStyles';
    style.textContent = `
      .progression-guide{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(101,216,255,.13);border-radius:14px;background:rgba(101,216,255,.035);display:flex;align-items:center;gap:11px;flex-wrap:wrap;color:var(--muted);font-size:.72rem;line-height:1.45}
      .progression-guide strong{color:#dff8ff}.progression-step{display:inline-flex;align-items:center;gap:6px}.progression-step b{width:21px;height:21px;display:grid;place-items:center;border-radius:7px;background:rgba(101,216,255,.09);border:1px solid rgba(101,216,255,.16);color:#bcefff;font-size:.62rem}
      .progression-box{margin:10px 48px 0 0;border:1px solid rgba(255,255,255,.075);border-radius:13px;background:rgba(255,255,255,.018);overflow:hidden}
      .progression-box>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;font-size:.7rem;font-weight:850;color:#dbe5f4}.progression-box>summary::-webkit-details-marker{display:none}.progression-box>summary:before{content:'›';color:#88e6ff;font-size:1rem;transition:transform .15s ease}.progression-box[open]>summary:before{transform:rotate(90deg)}.progression-box>summary span:first-of-type{margin-right:auto}.progression-summary{color:var(--muted2);font-size:.62rem;font-weight:750}
      .progression-content{padding:0 12px 12px;display:grid;gap:10px;border-top:1px solid rgba(255,255,255,.055)}.progression-content .field{margin-top:10px}.progression-auto-fields{display:grid;gap:9px}.progression-unlock-title{font-size:.63rem;font-weight:850;color:#dbe5f4}.progression-unlock-chips{display:flex;flex-wrap:wrap;gap:6px}.progression-unlock-chip{display:inline-flex;align-items:center;gap:5px;min-height:29px;padding:4px 8px;border-radius:9px;border:1px solid color-mix(in srgb,var(--chip-color) 30%,rgba(255,255,255,.08));background:color-mix(in srgb,var(--chip-color) 6%,rgba(255,255,255,.02));font-size:.64rem;color:#cbd6e6}.progression-unlock-chip input{accent-color:var(--chip-color)}
      .progression-hint{color:var(--muted2);font-size:.62rem;line-height:1.45}.progression-warning{padding:7px 9px;border-radius:9px;border:1px solid rgba(255,190,88,.16);background:rgba(255,190,88,.045);color:#e7c887;font-size:.62rem}
      .progression-required-line{border-color:rgba(255,190,88,.13)!important;background:rgba(255,190,88,.025)!important}.progression-required-line span:before{content:'★ ';color:#ffd47e}.progression-required-pill{display:inline-flex;align-items:center;margin-top:4px;padding:3px 6px;border-radius:99px;border:1px solid rgba(255,190,88,.18);background:rgba(255,190,88,.055);color:#ffd995;font-size:.57rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
      .advanced-progression-rules{margin-top:18px;border:1px solid rgba(255,255,255,.065);border-radius:15px;background:rgba(255,255,255,.014);overflow:hidden}.advanced-progression-rules>summary{cursor:pointer;list-style:none;padding:12px 14px;color:var(--muted);font-size:.7rem;font-weight:850}.advanced-progression-rules>summary::-webkit-details-marker{display:none}.advanced-progression-rules>summary:before{content:'›';display:inline-block;margin-right:7px;color:#88e6ff;transition:transform .15s ease}.advanced-progression-rules[open]>summary:before{transform:rotate(90deg)}.advanced-progression-rules .rule-section-head{margin-top:0;padding:0 14px 12px}.advanced-progression-rules #ruleEditorList{padding:0 14px 14px}
      @media(max-width:700px){.progression-box{margin-right:0}.progression-guide{display:grid}.progression-summary{max-width:46%;text-align:right}}
    `;
    document.head.appendChild(style);
  }

  function installAiBridge() {
    if (window.__fortuneProgressionAiBridge) return;
    window.__fortuneProgressionAiBridge = true;
    const originalFetch = window.fetch.bind(window);
    const guide = `\n\nSIMPLE LEVEL PROGRESSION SCHEMA:\n- Groups finish when their enabled forfeits are permanently removed: completion="empty" (default). Cooldowns and dependency locks do not count as removal.\n- For an earlier milestone use completion="required" and requiredForCompletion="true" on the chosen forfeits.\n- A group may contain <onComplete><group ref="NEXT_GROUP_ID"/></onComplete> to unlock other groups on completion.\n- Prefer direct <unlocks>, ALL/ANY rules and per-forfeit <requires>. No state variable system is needed. Preserve old completionLabel data on unrelated edits.\n- Per-forfeit modifierWheel supports type="number|minutes|binary|custom", enabled, chance, min, max and step. Minutes sets the result timer. Use custom only for old named outcomes.\n- eventType="cardPick" draws a fate card; spinAgain queues another spin after accepting; randomize changes active weights.\n`;

    window.fetch = async (input, init = {}) => {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\/chat\/completions(?:\?|$)/i.test(url) && typeof init.body === 'string') {
          const body = JSON.parse(init.body);
          if (Array.isArray(body.messages)) {
            body.messages = body.messages.map(message => {
              if (message?.role !== 'system' || typeof message.content !== 'string') return message;
              if (!/Fortune Engine/i.test(message.content) || message.content.includes('SIMPLE LEVEL PROGRESSION SCHEMA')) return message;
              return { ...message, content: message.content + guide };
            });
            init = { ...init, body: JSON.stringify(body) };
          }
        }
      } catch (error) {
        console.warn('Could not append progression AI schema:', error);
      }
      return originalFetch(input, init);
    };
  }

  const dirty = () => document.body.classList.add('dirty');

  function getDraft() {
    try { return window.FortuneEditor?.getDraft?.() || M.loadConfig(); }
    catch (_) { return M.loadConfig(); }
  }

  function enhanceCopy() {
    const tab = document.querySelector('.editor-tab[data-tab="levels"]');
    if (tab) tab.textContent = 'Levels & progression';
    const pane = document.getElementById('tab-levels');
    const toolbar = pane?.querySelector('.editor-toolbar');
    if (toolbar) {
      const kicker = toolbar.querySelector('.section-kicker');
      const h2 = toolbar.querySelector('h2');
      const p = toolbar.querySelector('p');
      if (kicker) kicker.textContent = 'GAME PHASES';
      if (h2) h2.textContent = 'Levels & progression';
      if (p) p.textContent = 'Groups finish when all enabled forfeits have been permanently removed. Choose which groups unlock next, or use selected-forfeit rules.';
      const add = toolbar.querySelector('#addLevelBtn');
      if (add) add.textContent = '+ Add level';
    }

    if (pane && !document.getElementById('progressionGuide')) {
      const guide = document.createElement('div');
      guide.id = 'progressionGuide';
      guide.className = 'progression-guide';
      guide.innerHTML = '<strong>Simple progression:</strong><span class="progression-step"><b>1</b> Activate a level</span><span>→</span><span class="progression-step"><b>2</b> Remove the last forfeit</span><span>→</span><span class="progression-step"><b>3</b> Unlock the next level</span>';
      pane.querySelector('.editor-toolbar')?.insertAdjacentElement('afterend', guide);
    }

    document.querySelectorAll('.unlock-box').forEach(box => {
      const strong = box.querySelector('strong');
      const span = box.querySelector('div>span');
      if (strong) strong.textContent = 'Immediate level unlock (optional)';
      if (span) span.textContent = 'Use this when one specific result should open another level immediately.';
    });

    const head = pane?.querySelector('.rule-section-head');
    const list = pane?.querySelector('#ruleEditorList');
    if (head && list && !document.getElementById('advancedProgressionRules')) {
      const details = document.createElement('details');
      details.id = 'advancedProgressionRules';
      details.className = 'advanced-progression-rules';
      const summary = document.createElement('summary');
      summary.textContent = 'Unlock after selected forfeits (ALL / ANY)';
      head.parentNode.insertBefore(details, head);
      details.append(summary, head, list);
      const kicker = head.querySelector('.section-kicker');
      const h2 = head.querySelector('h2');
      const p = head.querySelector('p');
      if (kicker) kicker.textContent = 'ADVANCED';
      if (h2) h2.textContent = 'Conditional unlock rules';
      if (p) p.textContent = 'Choose one or several forfeits, then choose the groups they unlock. ALL waits for every selected forfeit; ANY waits for the first.';
    }
  }

  function buildLevelBox(card, level, draft) {
    card.dataset.progressionLevelId = level.id;
    card.querySelector('.progression-box')?.remove();
    const extra = P.getLevel(level.id);
    const requiredCount = (draft.forfeits || []).filter(item => item.levelId === level.id && P.getForfeit(item.id).requiredForCompletion).length;
    const unlockNames = extra.completionUnlockLevels.map(id => draft.levels.find(candidate => candidate.id === id)?.name).filter(Boolean);

    const box = document.createElement('details');
    box.className = 'progression-box';
    if (extra.completionMode === 'required') box.open = true;
    const summary = document.createElement('summary');
    const summaryText = extra.completionMode === 'required'
      ? `${requiredCount} required${unlockNames.length ? ` · → ${unlockNames.join(', ')}` : ''}`
      : 'When empty';
    summary.innerHTML = `<span>Progression</span><span class="progression-summary"></span>`;
    summary.querySelector('.progression-summary').textContent = summaryText;

    const content = document.createElement('div');
    content.className = 'progression-content';
    const modeLabel = document.createElement('label');
    modeLabel.className = 'field';
    modeLabel.innerHTML = '<span>When does this level finish?</span><select><option value="empty">When all forfeits are removed</option><option value="required">When marked forfeits have been selected</option></select>';
    const mode = modeLabel.querySelector('select');
    mode.value = extra.completionMode;

    const auto = document.createElement('div');
    auto.className = 'progression-auto-fields';
    auto.hidden = false;

    const labelField = document.createElement('label');
    labelField.className = 'field';
    labelField.innerHTML = '<span>State after completion <small class="muted">(optional)</small></span><input type="text" maxlength="40" placeholder="e.g. Naked">';
    const stateInput = labelField.querySelector('input');
    stateInput.value = extra.completionLabel || '';

    const unlockTitle = document.createElement('div');
    unlockTitle.className = 'progression-unlock-title';
    unlockTitle.textContent = 'Then unlock level(s)';
    const chips = document.createElement('div');
    chips.className = 'progression-unlock-chips';
    draft.levels.filter(candidate => candidate.id !== level.id).forEach(candidate => {
      const label = document.createElement('label');
      label.className = 'progression-unlock-chip';
      label.style.setProperty('--chip-color', candidate.color || '#64748b');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = extra.completionUnlockLevels.includes(candidate.id);
      const span = document.createElement('span');
      span.textContent = `${candidate.icon || '◆'} ${candidate.name}`;
      label.append(input, span);
      input.addEventListener('change', () => {
        const next = P.getLevel(level.id);
        if (input.checked && !next.completionUnlockLevels.includes(candidate.id)) next.completionUnlockLevels.push(candidate.id);
        if (!input.checked) next.completionUnlockLevels = next.completionUnlockLevels.filter(id => id !== candidate.id);
        P.setLevel(level.id, next);
        dirty();
        schedule();
      });
      chips.appendChild(label);
    });

    const hint = document.createElement('div');
    hint.className = requiredCount ? 'progression-hint' : 'progression-warning';
    hint.textContent = requiredCount
      ? `${requiredCount} result${requiredCount === 1 ? '' : 's'} currently required. Required results are marked in the Forfeits tab.`
      : 'No required results yet. In the Forfeits tab, mark the results that must happen before this level is finished.';

    auto.append(unlockTitle, chips, hint);
    if (extra.completionMode !== 'required') hint.textContent = 'Cooldowns and locked prerequisites do not count as removal. Use “Remove after selected” for forfeits that should finish after one spin.';
    content.append(modeLabel, auto);
    box.append(summary, content);
    card.appendChild(box);

    mode.addEventListener('change', () => {
      const next = P.getLevel(level.id);
      next.completionMode = mode.value;
      P.setLevel(level.id, next);
      dirty();
      schedule();
    });
    stateInput.addEventListener('input', () => {
      const next = P.getLevel(level.id);
      next.completionLabel = stateInput.value.slice(0, 40);
      P.setLevel(level.id, next);
      dirty();
    });
  }

  function buildRequiredControl(card, item, draft) {
    card.querySelector('.progression-required-line')?.remove();
    card.querySelector('.progression-required-pill')?.remove();
    const level = draft.levels.find(candidate => candidate.id === item.levelId);
    if (!level || P.getLevel(level.id).completionMode !== 'required') return;
    const stack = card.querySelector('.check-stack');
    if (!stack) return;
    const current = P.getForfeit(item.id).requiredForCompletion;
    const label = document.createElement('label');
    label.className = 'check-line progression-required-line';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = current;
    const span = document.createElement('span');
    span.textContent = 'Required to finish this level';
    label.append(input, span);
    stack.appendChild(label);
    input.addEventListener('change', () => {
      P.setForfeit(item.id, { requiredForCompletion: input.checked });
      dirty();
      schedule();
    });
    if (current) {
      const pill = document.createElement('span');
      pill.className = 'progression-required-pill';
      pill.textContent = '★ Required for level';
      card.querySelector('.editor-title-block')?.appendChild(pill);
    }
  }

  function wrapEditorDraft() {
    const editor = window.FortuneEditor;
    if (!editor || editor.__progressionWrapped) return false;
    const original = editor.getDraft?.bind(editor);
    if (!original) return false;
    editor.__progressionRawGetDraft = original;
    editor.getDraft = () => {
      const draft = original();
      const levelIds = new Set((draft.levels || []).map(level => level.id));
      (draft.levels || []).forEach(level => {
        const extra = P.getLevel(level.id);
        level.completionMode = extra.completionMode;
        level.completionLabel = extra.completionLabel;
        level.completionUnlockLevels = extra.completionUnlockLevels.filter(id => levelIds.has(id) && id !== level.id);
      });
      (draft.forfeits || []).forEach(item => {
        item.requiredForCompletion = P.getForfeit(item.id).requiredForCompletion;
      });
      return draft;
    };
    editor.__progressionWrapped = true;
    return true;
  }

  let queued = false;
  function refresh() {
    queued = false;
    enhanceCopy();
    const draft = getDraft();
    const levelCards = [...document.querySelectorAll('#levelEditorList .level-editor-card')];
    levelCards.forEach((card, index) => {
      const level = draft.levels?.[index];
      if (level) buildLevelBox(card, level, draft);
    });
    document.querySelectorAll('#forfeitEditorList .forfeit-editor-card[data-id]').forEach(card => {
      const item = draft.forfeits?.find(candidate => candidate.id === card.dataset.id);
      if (item) buildRequiredControl(card, item, draft);
    });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
  }

  function installObservers() {
    const levels = document.getElementById('levelEditorList');
    const forfeits = document.getElementById('forfeitEditorList');
    if (levels) new MutationObserver(schedule).observe(levels, { childList:true });
    if (forfeits) new MutationObserver(schedule).observe(forfeits, { childList:true });
    document.addEventListener('change', event => {
      if (event.target.closest('.forfeit-editor-card .js-level')) setTimeout(schedule, 0);
    });
    window.addEventListener('fortune-editor-refreshed', schedule);
    window.addEventListener('fortune-ai-applied', () => setTimeout(schedule, 0));
  }

  installAiBridge();
  injectStyles();

  let tries = 0;
  const wait = () => {
    if (window.FortuneEditor && wrapEditorDraft()) {
      installObservers();
      schedule();
      return;
    }
    if (++tries < 100) setTimeout(wait, 30);
  };
  wait();
})();
