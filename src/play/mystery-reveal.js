(() => {
  'use strict';
  const M = window.FortuneModel;
  const overlay = document.getElementById('resultOverlay');
  const card = document.getElementById('resultCard');
  const title = document.getElementById('resultTitle');
  const desc = document.getElementById('resultDescription');
  if (!M || !overlay || !card || !title || !desc) return;

  let revealTimer = null;
  let countdownTimer = null;
  let lastHistoryKey = '';

  const genericMystery = item => {
    const name = String(item?.name || '').trim().toLowerCase();
    const description = String(item?.description || '').trim().toLowerCase();
    return (name === 'mystery' || name === 'mystery challenge' || name === 'mystery forfeit') &&
      (!description || description.includes('hidden challenge is revealed') || description === 'mystery revealed.');
  };

  function sound(freq, delay = 0, duration = .1) {
    try {
      const cfg = M.loadConfig();
      if (cfg.settings?.soundEnabled === false) return;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      const ctx = sound.ctx || (sound.ctx = new Audio());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const when = ctx.currentTime + delay;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(.035, when);
      gain.gain.exponentialRampToValueAtTime(.001, when + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + duration + .02);
    } catch (_) {}
  }

  function clearTimers() {
    clearTimeout(revealTimer);
    clearInterval(countdownTimer);
    revealTimer = null;
    countdownTimer = null;
  }

  function removeCurtain() {
    clearTimers();
    card.querySelector('.mystery-curtain')?.remove();
  }

  function getMysteryItem() {
    const config = M.loadConfig();
    const session = M.loadSession(config);
    const last = session.history?.at?.(-1) || session.history?.[session.history.length - 1];
    if (!last) return null;
    return config.forfeits.find(item => item.id === last.id && item.mystery) || null;
  }

  function reveal(curtain, item) {
    if (!curtain?.isConnected) return;
    clearTimers();
    curtain.classList.add('revealing');
    sound(520, 0, .13); sound(690, .07, .14); sound(910, .15, .16);

    setTimeout(() => {
      curtain.remove();
      card.classList.add('mystery-super-revealed');
      if (genericMystery(item)) {
        title.textContent = 'Mystery has no hidden result yet';
        desc.textContent = 'Edit this mystery forfeit and put the real hidden result in its Name and Description. The wheel will still hide it as ❓ until selected.';
        if (!card.querySelector('.mystery-config-warning')) {
          const warning = document.createElement('div');
          warning.className = 'mystery-config-warning';
          warning.textContent = 'Tip: a mystery forfeit should be named after the real hidden outcome, not “Mystery Challenge”.';
          desc.insertAdjacentElement('afterend', warning);
        }
      }
    }, 690);
  }

  function startReveal(item) {
    removeCurtain();
    card.querySelector('.mystery-config-warning')?.remove();
    card.classList.remove('mystery-super-revealed');

    const curtain = document.createElement('div');
    curtain.className = 'mystery-curtain';
    curtain.style.setProperty('--mystery-color', item.color || '#65d8ff');
    curtain.innerHTML = `
      <div class="mystery-curtain-inner">
        <div class="mystery-orbit"><div class="mystery-question">?</div></div>
        <div class="section-kicker">MYSTERY SELECTED</div>
        <h3>What did the wheel choose?</h3>
        <p>The hidden result is about to be revealed.</p>
        <div class="mystery-countdown" aria-live="polite">3</div>
        <button class="mystery-reveal-now" type="button">Reveal now</button>
      </div>`;
    card.appendChild(curtain);
    requestAnimationFrame(() => curtain.classList.add('active'));

    const count = curtain.querySelector('.mystery-countdown');
    let n = 3;
    sound(360, 0, .08);
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n > 0) {
        count.textContent = String(n);
        sound(360 + (3 - n) * 80, 0, .08);
      } else {
        count.textContent = 'REVEAL';
        clearInterval(countdownTimer);
      }
    }, 620);

    curtain.querySelector('.mystery-reveal-now').addEventListener('click', () => reveal(curtain, item));
    revealTimer = setTimeout(() => reveal(curtain, item), 2100);
  }

  function inspect() {
    if (overlay.hidden || !overlay.classList.contains('show')) return;
    const item = getMysteryItem();
    if (!item) return;
    const config = M.loadConfig();
    const session = M.loadSession(config);
    const history = session.history || [];
    const key = `${history.length}:${item.id}`;
    if (key === lastHistoryKey && card.querySelector('.mystery-curtain')) return;
    lastHistoryKey = key;
    startReveal(item);
  }

  new MutationObserver(inspect).observe(overlay, { attributes: true, attributeFilter: ['hidden', 'class'] });
  document.getElementById('resultCloseBtn')?.addEventListener('click', removeCurtain);
  document.getElementById('resultSpinBtn')?.addEventListener('click', removeCurtain);
})();
