(() => {
  'use strict';

  if (window.__fortuneSimpleResultMode) return;
  window.__fortuneSimpleResultMode = true;

  const M = window.FortuneModel;
  const overlay = document.getElementById('resultOverlay');
  const spinBtn = document.getElementById('spinBtn');
  const closeBtn = document.getElementById('resultCloseBtn');
  const spinAgainBtn = document.getElementById('resultSpinBtn');
  const shell = document.getElementById('wheelShell');
  if (!M || !overlay || !spinBtn || !closeBtn) return;

  const CARD_EVENTS = new Set(['goodCard', 'badCard', 'doubleOrNothing']);
  let previousDisabled = spinBtn.disabled;
  let rescueTimer = 0;
  let awaitingResult = false;

  function bypassPresentationGates() {
    overlay.dataset.progressionCompleteBypass = '1';
    overlay.dataset.stageUnlockBypass = '1';
    const special = document.getElementById('specialCardOverlay');
    if (special) {
      special.dataset.progressionCompleteBypass = '1';
      special.dataset.stageUnlockBypass = '1';
    }
  }

  function normalizeButtons() {
    closeBtn.textContent = 'OK';
    closeBtn.hidden = false;
    if (spinAgainBtn) {
      spinAgainBtn.hidden = true;
      spinAgainBtn.style.display = 'none';
      spinAgainBtn.setAttribute('aria-hidden', 'true');
      spinAgainBtn.tabIndex = -1;
    }
  }

  function readLatest() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      const last = session?.history?.at?.(-1) || null;
      const item = last ? config.forfeits.find(entry => entry.id === last.id) || null : null;
      return { config, session, last, item };
    } catch (_) {
      return { config:null, session:null, last:null, item:null };
    }
  }

  function selectableCount() {
    const { config, session } = readLatest();
    if (!config || !session) return 0;
    return config.forfeits.filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    }).length;
  }

  function clearWinnerHold() {
    shell?.classList.remove('wheel-winner-lock', 'wheel-drama');
    document.body.classList.remove('wheel-drama-active', 'stage-winner-light');
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    document.getElementById('liveSpinPreview')?.classList.remove('show', 'bump', 'second-wind');
  }

  function fillPopup(item, last) {
    const card = document.getElementById('resultCard');
    const icon = document.getElementById('resultIcon');
    const mystery = document.getElementById('resultMystery');
    const category = document.getElementById('resultCategory');
    const title = document.getElementById('resultTitle');
    const description = document.getElementById('resultDescription');
    const unlock = document.getElementById('unlockNotice');

    card?.style.setProperty('--result-color', item.color || '#65d8ff');
    if (category) category.textContent = item.category || 'RESULT';
    if (title) title.textContent = item.name || last?.name || 'Selected';
    if (description) description.textContent = item.description || 'Selected by the wheel.';
    if (icon) {
      icon.hidden = false;
      icon.textContent = item.icon || last?.icon || '✦';
    }
    if (mystery) mystery.hidden = true;
    if (unlock) {
      const names = Array.isArray(last?.unlocked) ? last.unlocked.filter(Boolean) : [];
      unlock.hidden = !names.length;
      unlock.textContent = names.length ? `UNLOCKED · ${names.join(' + ')}` : '';
    }
  }

  function specialCardVisible() {
    const special = document.getElementById('specialCardOverlay');
    return !!special && !special.hidden;
  }

  function forceNormalPopup() {
    bypassPresentationGates();
    normalizeButtons();
    if (!awaitingResult || specialCardVisible()) return;

    const { item, last } = readLatest();
    if (!item || CARD_EVENTS.has(item.eventType)) return;

    clearWinnerHold();
    fillPopup(item, last);
    overlay.hidden = false;
    overlay.classList.add('show');
    awaitingResult = false;
  }

  function schedulePopupRescue() {
    clearTimeout(rescueTimer);
    awaitingResult = true;
    /* app-v4 opens the normal result after 300ms; waiting past the old 650ms
       winner-lock guarantees no presentation layer can strand the result. */
    rescueTimer = setTimeout(forceNormalPopup, 760);
  }

  function restoreSpinButton() {
    awaitingResult = false;
    clearTimeout(rescueTimer);
    setTimeout(() => {
      if (selectableCount() > 0 && !shell?.classList.contains('wheel-spinning')) spinBtn.disabled = false;
    }, 40);
  }

  bypassPresentationGates();
  normalizeButtons();

  new MutationObserver(() => {
    bypassPresentationGates();
    normalizeButtons();

    const disabled = spinBtn.disabled;
    if (previousDisabled && !disabled) schedulePopupRescue();
    previousDisabled = disabled;
  }).observe(spinBtn, { attributes:true, attributeFilter:['disabled'] });

  new MutationObserver(() => {
    bypassPresentationGates();
    normalizeButtons();
    if (!overlay.hidden) {
      clearTimeout(rescueTimer);
      awaitingResult = false;
      clearWinnerHold();
    }
  }).observe(overlay, { attributes:true, attributeFilter:['hidden','class'] });

  new MutationObserver(() => bypassPresentationGates()).observe(document.body, { childList:true, subtree:true });

  closeBtn.addEventListener('click', restoreSpinButton);
  window.addEventListener('focus', () => {
    bypassPresentationGates();
    normalizeButtons();
  });
})();
