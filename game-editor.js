(() => {
  'use strict';

  const M = window.FortuneModel;
  const template = document.getElementById('forfeitTemplate');
  if (!M || !template || window.__fortuneGameEditor) return;
  window.__fortuneGameEditor = true;

  const timerDraft = window.FortuneTimerDraft instanceof Map ? window.FortuneTimerDraft : new Map();
  window.FortuneTimerDraft = timerDraft;

  function installAiSchemaBridge() {
    if (window.__fortuneCardTimerAiBridge) return;
    window.__fortuneCardTimerAiBridge = true;
    const originalFetch = window.fetch.bind(window);
    const guide = `\n\nCARD + TIMER SCHEMA:\n- Forfeit timerSeconds is an integer 0..3600. 0 means no timer. A timed normal forfeit shows a Start/Pause/Finish countdown on the play page.\n- eventType="goodCard" draws a visual GOOD card: either Re-spin (saved in inventory) or Shorten (saved in inventory, halves a timed result).\n- eventType="badCard" draws a visual BAD card: either Chaos Spin (temporary random weights for the next spin) or Double Time (next timed forfeit is doubled).\n- eventType="doubleOrNothing" opens a visual coin flip: Nothing means no forfeit; Double queues two forfeits.\n- Preserve timerSeconds and these card eventType values on unrelated edits. Do not translate or reinterpret eventType tokens.\n`;
    window.fetch = async (input, init = {}) => {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\/chat\/completions(?:\?|$)/i.test(url) && typeof init.body === 'string') {
          const body = JSON.parse(init.body);
          if (Array.isArray(body.messages)) {
            body.messages = body.messages.map(message => {
              if (message?.role !== 'system' || typeof message.content !== 'string') return message;
              if (!/Fortune Engine/i.test(message.content) || message.content.includes('CARD + TIMER SCHEMA')) return message;
              return { ...message, content: message.content + guide };
            });
            init = { ...init, body: JSON.stringify(body) };
          }
        }
      } catch (error) {
        console.warn('Could not append card/timer AI schema:', error);
      }
      return originalFetch(input, init);
    };
  }

  function addTemplateFields() {
    const select = template.content.querySelector('.js-event-type');
    if (select && !select.querySelector('option[value="goodCard"]')) {
      const options = [
        ['goodCard', 'Good card draw'],
        ['badCard', 'Bad card draw'],
        ['doubleOrNothing', 'Double or Nothing']
      ];
      options.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
    }

    const grid = template.content.querySelector('.editor-fields-grid');
    if (grid && !grid.querySelector('.js-timer-seconds')) {
      const label = document.createElement('label');
      label.className = 'field game-timer-field';
      label.innerHTML = 'Timer seconds<input class="js-timer-seconds" type="number" min="0" max="3600" step="5" value="0"><span class="mini-note">0 = no timer</span>';
      grid.appendChild(label);
    }
  }

  function configTimer(id) {
    try {
      const draft = window.FortuneEditor?.getDraft?.();
      const item = draft?.forfeits?.find(entry => entry.id === id);
      if (item) return Math.max(0, Math.round(Number(item.timerSeconds) || 0));
    } catch (_) {}
    try {
      const item = M.loadConfig().forfeits.find(entry => entry.id === id);
      return Math.max(0, Math.round(Number(item?.timerSeconds) || 0));
    } catch (_) { return 0; }
  }

  function seedTimerDraft() {
    timerDraft.clear();
    try {
      M.loadConfig().forfeits.forEach(item => timerDraft.set(item.id, Math.max(0, Math.round(Number(item.timerSeconds) || 0))));
    } catch (_) {}
  }

  function decorateCard(card) {
    if (!card?.dataset?.id) return;
    const input = card.querySelector('.js-timer-seconds');
    if (!input) return;
    const id = card.dataset.id;
    if (!timerDraft.has(id)) timerDraft.set(id, configTimer(id));
    if (input.dataset.timerBound !== '1') {
      input.dataset.timerBound = '1';
      input.value = String(timerDraft.get(id) || 0);
      const update = () => {
        const value = Math.max(0, Math.min(3600, Math.round(Number(input.value) || 0)));
        timerDraft.set(id, value);
        input.value = String(value);
        document.body.classList.add('dirty');
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    } else if (document.activeElement !== input) {
      input.value = String(timerDraft.get(id) || 0);
    }

    const event = card.querySelector('.js-event-type');
    if (event && !event.querySelector('option[value="goodCard"]')) {
      [['goodCard','Good card draw'],['badCard','Bad card draw'],['doubleOrNothing','Double or Nothing']].forEach(([value,label]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = label; event.appendChild(option);
      });
      try {
        const saved = M.loadConfig().forfeits.find(entry => entry.id === id);
        if (saved?.eventType && [...event.options].some(option => option.value === saved.eventType)) event.value = saved.eventType;
      } catch (_) {}
    }
  }

  let scheduled = false;
  function refreshCards() {
    scheduled = false;
    document.querySelectorAll('#forfeitEditorList .forfeit-editor-card[data-id]').forEach(decorateCard);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refreshCards);
  }

  function wrapEditorApi() {
    const editor = window.FortuneEditor;
    if (!editor || editor.__gameTimerWrapped) return false;
    const originalGetDraft = editor.getDraft?.bind(editor);
    if (originalGetDraft) {
      editor.getDraft = () => {
        const draft = originalGetDraft();
        draft?.forfeits?.forEach(item => {
          if (timerDraft.has(item.id)) item.timerSeconds = timerDraft.get(item.id);
          else item.timerSeconds = Math.max(0, Math.round(Number(item.timerSeconds) || 0));
        });
        return draft;
      };
    }
    editor.__gameTimerWrapped = true;
    return true;
  }

  installAiSchemaBridge();
  addTemplateFields();
  seedTimerDraft();

  const list = document.getElementById('forfeitEditorList');
  if (list) new MutationObserver(schedule).observe(list, { childList: true, subtree: true });

  window.addEventListener('fortune-editor-refreshed', () => { seedTimerDraft(); schedule(); });
  window.addEventListener('fortune-ai-applied', () => setTimeout(() => { seedTimerDraft(); schedule(); }, 0));

  let tries = 0;
  const waitForEditor = () => {
    if (wrapEditorApi()) { schedule(); return; }
    if (++tries < 40) setTimeout(waitForEditor, 25);
  };
  setTimeout(waitForEditor, 0);
})();
