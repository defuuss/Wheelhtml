(() => {
  'use strict';

  if (window.__fortuneHostessPoses) return;
  window.__fortuneHostessPoses = true;

  const host = document.getElementById('gameShowHost');
  const img = host?.querySelector('img');
  if (!host || !img) return;

  const POSES = {
    idle: 'assets/show/gameshow-hostess.png?v=2',
    thinking: 'assets/show/gameshow-hostess-thinking.png?v=1',
    pointing: 'assets/show/gameshow-hostess-pointing.png?v=1',
    invite: 'assets/show/gameshow-hostess-invite.png?v=1',
    card: 'assets/show/gameshow-hostess-card.png?v=1'
  };

  const COPY = {
    idle: ['YOUR FATE AWAITS', 'Spin • Risk • Reveal'],
    thinking: ['WHAT WILL IT BE?', 'The wheel is deciding…'],
    pointing: ['SPIN THE FATE', 'Let the wheel choose'],
    invite: ['YOUR RESULT', 'Accept it… or tempt fate'],
    card: ['FATE DECK', 'One card can change everything']
  };

  Object.values(POSES).forEach(src => {
    const preload = new Image();
    preload.src = src;
  });

  let current = 'idle';
  let resetTimer = null;

  function setPose(name, temporaryMs = 0) {
    if (!POSES[name]) name = 'idle';
    clearTimeout(resetTimer);
    current = name;

    host.classList.remove('host-missing');
    host.dataset.pose = name;
    host.classList.remove('host-pose-enter');
    void host.offsetWidth;
    host.classList.add('host-pose-enter');

    const [title, subtitle] = COPY[name] || COPY.idle;
    const strong = host.querySelector('figcaption strong');
    const span = host.querySelector('figcaption span');
    if (strong) strong.textContent = title;
    if (span) span.textContent = subtitle;

    img.onerror = () => {
      if (name !== 'idle') {
        img.onerror = null;
        img.src = POSES.idle;
        host.dataset.pose = 'idle';
      } else {
        host.classList.add('host-missing');
      }
    };
    img.src = POSES[name];

    if (temporaryMs > 0) resetTimer = setTimeout(() => setPose('idle'), temporaryMs);
  }

  const spinBtn = document.getElementById('spinBtn');
  spinBtn?.addEventListener('click', () => {
    setPose(Math.random() < .5 ? 'thinking' : 'pointing');
  });

  const resultOverlay = document.getElementById('resultOverlay');
  if (resultOverlay) {
    new MutationObserver(() => {
      if (!resultOverlay.hidden) setPose('invite');
      else if (!document.getElementById('fateDeckOverlayV4') || document.getElementById('fateDeckOverlayV4').hidden) setPose('idle', 350);
    }).observe(resultOverlay, { attributes: true, attributeFilter: ['hidden'] });
  }

  const attachFateObserver = () => {
    const fate = document.getElementById('fateDeckOverlayV4');
    if (!fate || fate.dataset.hostObserved) return;
    fate.dataset.hostObserved = '1';
    new MutationObserver(() => {
      if (!fate.hidden) setPose('card');
      else if (resultOverlay?.hidden !== false) setPose('idle', 350);
      else setPose('invite');
    }).observe(fate, { attributes: true, attributeFilter: ['hidden'] });
  };

  attachFateObserver();
  new MutationObserver(attachFateObserver).observe(document.body, { childList: true, subtree: true });

  document.getElementById('resultCloseBtn')?.addEventListener('click', () => setPose('idle', 250));
  document.getElementById('resetBtn')?.addEventListener('click', () => setPose('idle'));

  setPose('idle');
})();
