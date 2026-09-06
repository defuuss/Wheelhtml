(() => {
  'use strict';

  if (window.__fortuneResultFlowV2) return;
  window.__fortuneResultFlowV2 = true;

  const M = window.FortuneModel;
  const spinBtn = document.getElementById('spinBtn');
  const resultOverlay = document.getElementById('resultOverlay');
  const shell = document.getElementById('wheelShell');
  if (!M || !spinBtn || !resultOverlay) return;

  const seenPostTransitions = new Set();
  let spinWasDisabled = spinBtn.disabled;
  let rescueTimer = 0;
  let postFlowRunning = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function read() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      const last = session?.history?.at?.(-1) || null;
      const item = last ? config?.forfeits?.find(entry => entry.id === last.id) || null : null;
      return { config, session, last, item };
    } catch (_) {
      return { config:null, session:null, last:null, item:null };
    }
  }

  function selectableCount() {
    const { config, session } = read();
    if (!config || !session) return 0;
    return config.forfeits.filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    }).length;
  }

  function anotherOverlayOpen() {
    const special = document.getElementById('specialCardOverlay');
    const complete = document.getElementById('levelCompleteOverlay');
    const unlock = document.getElementById('stageUnlockOverlay');
    const intro = document.getElementById('showIntroOverlay');
    return (!resultOverlay.hidden) ||
      (special && !special.hidden) ||
      complete?.classList.contains('show') ||
      unlock?.classList.contains('show') ||
      intro?.classList.contains('show');
  }

  function freeSpinButton() {
    if (shell?.classList.contains('wheel-spinning')) return;
    if (anotherOverlayOpen()) return;
    if (selectableCount() > 0) {
      spinBtn.disabled = false;
      spinBtn.removeAttribute('aria-disabled');
    }
  }

  function disableOldPreResultGates() {
    /* Older presentation layers used to hide the result while showing unlock/completion
       animations. That created races with the winner-lock overlay. The result now always
       gets priority; transitions happen only after the player leaves the result screen. */
    resultOverlay.dataset.progressionCompleteBypass = '1';
    resultOverlay.dataset.stageUnlockBypass = '1';

    const special = document.getElementById('specialCardOverlay');
    if (special) {
      special.dataset.progressionCompleteBypass = '1';
      special.dataset.stageUnlockBypass = '1';
    }
  }

  function clearWinnerVisuals() {
    clearTimeout(rescueTimer);
    rescueTimer = 0;
    shell?.classList.remove('wheel-winner-lock', 'wheel-drama');
    document.body.classList.remove('wheel-drama-active', 'stage-winner-light');
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    const preview = document.getElementById('liveSpinPreview');
    preview?.classList.remove('show', 'bump', 'second-wind');
  }

  function ensureResultContent() {
    const title = document.getElementById('resultTitle');
    if (!title || (title.textContent && title.textContent !== 'Selected')) return true;

    const { item, last } = read();
    if (!item || ['goodCard','badCard','doubleOrNothing'].includes(item.eventType)) return false;

    const card = document.getElementById('resultCard');
    const category = document.getElementById('resultCategory');
    const description = document.getElementById('resultDescription');
    const icon = document.getElementById('resultIcon');
    const mystery = document.getElementById('resultMystery');
    const unlock = document.getElementById('unlockNotice');

    card?.style.setProperty('--result-color', item.color || '#65d8ff');
    if (category) category.textContent = item.category || 'RESULT';
    title.textContent = item.name || last?.name || 'Selected';
    if (description) {
      const timerText = Number(item.timerSeconds) > 0 ? ` · Timed: ${Math.round(Number(item.timerSeconds))} seconds.` : '';
      description.textContent = (item.description || 'Selected by the wheel.') + timerText;
    }
    if (icon) { icon.hidden = false; icon.textContent = item.icon || last?.icon || '✦'; }
    if (mystery) mystery.hidden = true;
    if (unlock) {
      const names = Array.isArray(last?.unlocked) ? last.unlocked.filter(Boolean) : [];
      unlock.hidden = !names.length;
      unlock.textContent = names.length ? `UNLOCKED · ${names.join(' + ')}` : '';
    }
    return true;
  }

  function forceResultVisible() {
    disableOldPreResultGates();
    clearWinnerVisuals();

    const special = document.getElementById('specialCardOverlay');
    if (special && !special.hidden) return;

    const { item } = read();
    if (!item || ['goodCard','badCard','doubleOrNothing'].includes(item.eventType)) return;
    ensureResultContent();
    resultOverlay.hidden = false;
    resultOverlay.classList.add('show');
  }

  function scheduleResultRescue() {
    clearTimeout(rescueTimer);
    rescueTimer = setTimeout(() => {
      const special = document.getElementById('specialCardOverlay');
      if (!resultOverlay.hidden || (special && !special.hidden)) {
        clearWinnerVisuals();
        return;
      }
      forceResultVisible();
    }, 900);
  }

  async function showCompletion(last, config) {
    const completed = Array.isArray(last?.completedLevels) ? last.completedLevels.filter(Boolean) : [];
    if (!completed.length) return;

    let overlay = document.getElementById('levelCompleteOverlay');
    if (!overlay) return;
    const first = config?.levels?.find(level => level.name === completed[0]);
    overlay.style.setProperty('--complete-accent', first?.color || '#65d8ff');
    const name = document.getElementById('levelCompleteName');
    const state = document.getElementById('levelCompleteState');
    if (name) name.textContent = completed.length === 1 ? completed[0] : `${completed.length} levels`;
    const states = Array.isArray(last?.sceneStatesAdded) ? last.sceneStatesAdded.filter(Boolean) : [];
    if (state) {
      state.hidden = !states.length;
      state.textContent = states.length ? `STATE · ${states.join(' + ')}` : '';
    }
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');

    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      overlay.addEventListener('click', finish, { once:true });
      setTimeout(finish, 1250);
    });

    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    await sleep(120);
  }

  async function runPostResultTransitions() {
    if (postFlowRunning) return;
    const { config, session, last } = read();
    if (!config || !session || !last) return;

    const completed = Array.isArray(last.completedLevels) ? last.completedLevels.filter(Boolean) : [];
    const unlocked = Array.isArray(last.unlocked) ? [...new Set(last.unlocked.filter(Boolean))] : [];
    if (!completed.length && !unlocked.length) return;

    const key = `${session.spinCount || 0}:${last.id || ''}:${completed.join('|')}:${unlocked.join('|')}`;
    if (seenPostTransitions.has(key)) return;
    seenPostTransitions.add(key);
    postFlowRunning = true;

    try {
      await showCompletion(last, config);
      if (unlocked.length && window.FortuneShowStage?.showUnlocks) {
        await window.FortuneShowStage.showUnlocks(unlocked, config);
      }
    } finally {
      postFlowRunning = false;
      setTimeout(freeSpinButton, 80);
    }
  }

  function hideLegacySpinAgain() {
    const button = document.getElementById('resultSpinBtn');
    if (!button) return;
    button.hidden = true;
    button.style.display = 'none';
    button.setAttribute('aria-hidden', 'true');
    button.tabIndex = -1;
  }

  disableOldPreResultGates();
  hideLegacySpinAgain();

  new MutationObserver(() => {
    disableOldPreResultGates();
    hideLegacySpinAgain();

    const disabled = spinBtn.disabled;
    if (spinWasDisabled && !disabled) scheduleResultRescue();
    spinWasDisabled = disabled;
  }).observe(spinBtn, { attributes:true, attributeFilter:['disabled'] });

  let resultWasVisible = !resultOverlay.hidden;
  new MutationObserver(() => {
    disableOldPreResultGates();
    hideLegacySpinAgain();

    if (!resultOverlay.hidden) {
      resultWasVisible = true;
      clearWinnerVisuals();
      return;
    }

    if (resultWasVisible) {
      resultWasVisible = false;
      setTimeout(runPostResultTransitions, 40);
      setTimeout(freeSpinButton, 80);
      setTimeout(freeSpinButton, 220);
    }
  }).observe(resultOverlay, { attributes:true, attributeFilter:['hidden','class'] });

  new MutationObserver(() => disableOldPreResultGates()).observe(document.body, { childList:true, subtree:true });

  document.getElementById('resultCloseBtn')?.addEventListener('click', () => {
    setTimeout(freeSpinButton, 80);
    setTimeout(freeSpinButton, 220);
  });

  window.addEventListener('focus', freeSpinButton);
  window.addEventListener('storage', freeSpinButton);
  setTimeout(freeSpinButton, 250);
})();
