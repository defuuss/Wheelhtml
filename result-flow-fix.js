(() => {
  'use strict';

  if (window.__fortuneResultFlowFix) return;
  window.__fortuneResultFlowFix = true;

  const M = window.FortuneModel;
  const spinBtn = document.getElementById('spinBtn');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultCloseBtn = document.getElementById('resultCloseBtn');
  const resultSpinBtn = document.getElementById('resultSpinBtn');
  const shell = document.getElementById('wheelShell');
  if (!M || !spinBtn || !resultOverlay) return;

  function selectableCount() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      return config.forfeits.filter(item => {
        const runtime = session.runtime?.[item.id];
        return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
          session.activeLevels?.[item.levelId] &&
          !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
      }).length;
    } catch (_) {
      return 0;
    }
  }

  function anotherOverlayOpen() {
    const card = document.getElementById('specialCardOverlay');
    const completion = document.getElementById('levelCompleteOverlay');
    const unlock = document.getElementById('stageUnlockOverlay');
    const intro = document.getElementById('showIntroOverlay');
    return (!resultOverlay.hidden) ||
      (card && !card.hidden) ||
      completion?.classList.contains('show') ||
      unlock?.classList.contains('show') ||
      intro?.classList.contains('show');
  }

  function syncSpinAvailability() {
    if (shell?.classList.contains('wheel-spinning')) return;
    if (anotherOverlayOpen()) return;
    const count = selectableCount();
    if (count > 0) {
      spinBtn.disabled = false;
      spinBtn.removeAttribute('aria-disabled');
    }
  }

  if (resultSpinBtn) {
    resultSpinBtn.hidden = true;
    resultSpinBtn.style.display = 'none';
    resultSpinBtn.setAttribute('aria-hidden', 'true');
    resultSpinBtn.tabIndex = -1;
  }

  const scheduleSync = () => {
    setTimeout(syncSpinAvailability, 40);
    setTimeout(syncSpinAvailability, 180);
  };

  resultCloseBtn?.addEventListener('click', scheduleSync);
  document.getElementById('specialCardClose')?.addEventListener('click', scheduleSync);

  new MutationObserver(() => {
    if (resultSpinBtn) {
      resultSpinBtn.hidden = true;
      resultSpinBtn.style.display = 'none';
    }
    if (resultOverlay.hidden) scheduleSync();
  }).observe(resultOverlay, { attributes:true, attributeFilter:['hidden','class'] });

  new MutationObserver(() => {
    const specialClose = document.getElementById('specialCardClose');
    if (specialClose && specialClose.dataset.resultFlowBound !== '1') {
      specialClose.dataset.resultFlowBound = '1';
      specialClose.addEventListener('click', scheduleSync);
    }
  }).observe(document.body, { childList:true, subtree:true });

  window.addEventListener('storage', scheduleSync);
  window.addEventListener('focus', scheduleSync);
  setTimeout(syncSpinAvailability, 250);
})();
