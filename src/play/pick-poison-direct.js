(() => {
  'use strict';

  if (window.__fortunePickPoisonDirectV1) return;
  window.__fortunePickPoisonDirectV1 = true;

  const M = window.FortuneModel;
  const $ = id => document.getElementById(id);
  if (!M) return;

  const CARD_EVENTS = new Set(['cardPick', 'goodCard', 'badCard', 'doubleOrNothing']);
  let poisonSwapChosen = false;
  let directRevealActive = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  function weight(item, session) {
    return Math.max(.01, Number(item.weight || 1) * (Number(session.runtime?.[item.id]?.weightMultiplier) || 1));
  }

  function activeNormalForfeits(config, session, excludeId = '') {
    return (config.forfeits || []).filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.id !== excludeId &&
        item.enabled &&
        !CARD_EVENTS.has(item.eventType) &&
        runtime &&
        !runtime.removed &&
        Number(runtime.cooldown || 0) <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    });
  }

  function weightedPick(items, session) {
    if (!items.length) return null;
    let needle = Math.random() * items.reduce((sum, item) => sum + weight(item, session), 0);
    for (const item of items) {
      needle -= weight(item, session);
      if (needle <= 0) return item;
    }
    return items[items.length - 1];
  }

  function snapshot(session) {
    const snap = M.deepClone(session);
    snap.undoStack = [];
    session.undoStack = Array.isArray(session.undoStack) ? session.undoStack : [];
    session.undoStack.push(snap);
    if (session.undoStack.length > 12) session.undoStack.shift();
  }

  function evaluateRules(config, session, currentId) {
    const occurred = new Set((session.history || []).map(entry => entry.id));
    occurred.add(currentId);
    const unlocked = [];
    (config.rules || []).forEach(rule => {
      if (!rule.enabled || !rule.conditionForfeitIds?.length) return;
      const matches = rule.conditionForfeitIds.map(id => occurred.has(id));
      const ok = rule.mode === 'any' ? matches.some(Boolean) : matches.every(Boolean);
      if (!ok) return;
      (rule.unlockLevels || []).forEach(id => {
        if (session.activeLevels?.[id]) return;
        session.activeLevels[id] = true;
        const level = (config.levels || []).find(entry => entry.id === id);
        if (level) unlocked.push(level.name);
      });
    });
    return unlocked;
  }

  function applyDirectResult(config, session, item) {
    const activeBefore = { ...(session.activeLevels || {}) };
    const unlocked = [];
    session.spinCount = Math.max(0, Number(session.spinCount) || 0) + 1;

    Object.values(session.runtime || {}).forEach(runtime => {
      if (runtime.cooldown > 0) runtime.cooldown--;
    });

    (item.unlockLevels || []).forEach(id => {
      if (session.activeLevels[id]) return;
      session.activeLevels[id] = true;
      const level = (config.levels || []).find(entry => entry.id === id);
      if (level) unlocked.push(level.name);
    });

    evaluateRules(config, session, item.id).forEach(name => {
      if (!unlocked.includes(name)) unlocked.push(name);
    });

    (config.forfeits || []).forEach(entry => {
      const runtime = session.runtime?.[entry.id];
      if (!runtime || !activeBefore[entry.levelId] || runtime.removed) return;
      if (entry.lifetime?.type === 'spins' && runtime.remainingSpins !== null) {
        runtime.remainingSpins--;
        if (runtime.remainingSpins <= 0) runtime.removed = true;
      }
    });

    const runtime = session.runtime?.[item.id];
    if (runtime) {
      if (item.lifetime?.type === 'once') runtime.removed = true;
      if (!runtime.removed && Number(item.cooldown || 0) > 0) runtime.cooldown = Number(item.cooldown);
    }

    let specialMessage = '';
    if (item.eventType === 'spinAgain') specialMessage = 'Spin again is active — the next spin is waiting for you.';
    else if (item.eventType === 'doubleSpin') {
      session.doubleSpinTokens = (session.doubleSpinTokens || 0) + 1;
      specialMessage = 'Double-spin token earned.';
    } else if (item.eventType === 'immunity') {
      session.immunityTokens = (session.immunityTokens || 0) + 1;
      specialMessage = `Immunity token earned. You now have ${session.immunityTokens}.`;
    } else if (item.eventType === 'randomize') {
      activeNormalForfeits(config, session).forEach(entry => {
        if (session.runtime?.[entry.id]) session.runtime[entry.id].weightMultiplier = Number((.6 + Math.random()).toFixed(2));
      });
      specialMessage = 'Chaos Shuffle changed the effective weights of active entries.';
    } else if (item.eventType === 'unlock' && unlocked.length) {
      specialMessage = `${unlocked.join(', ')} ${unlocked.length === 1 ? 'is' : 'are'} now active.`;
    }

    session.history = Array.isArray(session.history) ? session.history : [];
    session.history.push({
      id:item.id,
      name:item.name,
      icon:item.icon,
      color:item.color,
      category:item.category,
      unlocked,
      cardName:'Pick Your Poison',
      time:new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    });
    if (session.history.length > 50) session.history.shift();

    return { unlocked, specialMessage };
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const min = Math.floor(value / 60);
    const sec = value % 60;
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function showDirectReveal(item, outcome) {
    const overlay = $('fateDeckOverlayV4');
    const shell = overlay?.querySelector('.fate-v4-shell');
    if (!overlay || !shell) return;

    shell.querySelectorAll('.fate-v4-card,.fate-v4-status,.fate-v4-coin-area,.fate-v4-choice-area,.fate-v4-roulette-area,.fate-v4-actions,.fate-v4-reveal-label')
      .forEach(node => node.hidden = true);

    let reveal = $('poisonDirectReveal');
    if (!reveal) {
      reveal = document.createElement('section');
      reveal.id = 'poisonDirectReveal';
      reveal.className = 'poison-direct-reveal';
      shell.appendChild(reveal);
    }

    const timer = Number(item.timerSeconds || 0) > 0 ? `<span class="poison-direct-timer">⏱ ${formatTime(item.timerSeconds)}</span>` : '';
    const unlocked = outcome.unlocked?.length ? `<div class="poison-direct-unlock">UNLOCKED · ${esc(outcome.unlocked.join(' + '))}</div>` : '';
    const special = outcome.specialMessage ? `<div class="poison-direct-unlock">${esc(outcome.specialMessage)}</div>` : '';

    reveal.innerHTML = `
      <div class="poison-direct-kicker">PICK YOUR POISON</div>
      <div class="poison-direct-sub">The wheel did not spin. Fate picked directly from the active wheel.</div>
      <div class="poison-direct-card" style="--poison-color:${esc(item.color || '#8b7cff')}">
        <div class="poison-direct-icon">${esc(item.mystery ? '❓' : (item.icon || '✦'))}</div>
        <div class="poison-direct-category">${esc(item.category || 'FORFEIT')}</div>
        <h2>${esc(item.mystery ? 'Mystery Forfeit' : item.name)}</h2>
        <p>${esc(item.mystery ? 'Your replacement was chosen. Reveal it now.' : (item.description || 'This is your replacement forfeit.'))}</p>
        ${timer}${unlocked}${special}
      </div>
      <button id="poisonDirectAccept" class="btn primary large poison-direct-accept" type="button">ACCEPT THIS FORFEIT</button>`;

    reveal.hidden = false;
    directRevealActive = true;

    if (item.mystery) {
      setTimeout(() => {
        if (!directRevealActive || !reveal.isConnected) return;
        reveal.querySelector('.poison-direct-icon').textContent = item.icon || '✦';
        reveal.querySelector('h2').textContent = item.name;
        reveal.querySelector('p').textContent = item.description || 'This is your replacement forfeit.';
        reveal.classList.add('mystery-open');
      }, 900);
    }

    $('poisonDirectAccept').onclick = () => {
      directRevealActive = false;
      window.location.reload();
    };
  }

  function directPoisonSwap() {
    const beforeConfig = M.loadConfig();
    const beforeSession = M.loadSession(beforeConfig);
    const original = beforeSession.history?.[beforeSession.history.length - 1];
    const originalId = original?.id || '';

    // Restore the state from before the wheel result. The app's Undo handler is synchronous.
    const undo = $('undoBtn');
    if (!undo || undo.disabled) return;
    undo.click();

    setTimeout(() => {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      const candidates = activeNormalForfeits(config, session, originalId);
      const picked = weightedPick(candidates, session);

      if (!picked) {
        const status = $('fateV4Status')?.querySelector('small');
        if (status) status.textContent = 'No other active forfeit is currently available. Your original result remains.';
        return;
      }

      snapshot(session);
      const outcome = applyDirectResult(config, session, picked);
      M.saveSession(session);
      showDirectReveal(picked, outcome);
    }, 80);
  }

  // Remember when the player picked the unknown side of Pick Your Poison.
  document.addEventListener('click', event => {
    if (event.target.closest('#fateV4ChoiceSwap')) poisonSwapChosen = true;
    if (event.target.closest('#fateV4ChoiceKeep')) poisonSwapChosen = false;
  }, true);

  // Replace the old "spin the wheel again" resolution with a direct weighted draw.
  document.addEventListener('click', event => {
    const continueButton = event.target.closest('#fateV4Continue');
    if (!continueButton || !poisonSwapChosen || directRevealActive) return;
    if (continueButton.textContent.trim() !== 'Reveal replacement') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    poisonSwapChosen = false;
    directPoisonSwap();
  }, true);
})();
