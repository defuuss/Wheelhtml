(() => {
  'use strict';

  const M = window.FortuneModel;
  const shell = document.getElementById('wheelShell');
  const rotor = document.getElementById('wheelRotor');
  const spinBtn = document.getElementById('spinBtn');
  const topActions = document.querySelector('.top-actions');
  if (!M || !shell || !rotor || !spinBtn) return;

  const STUDIO_KEY = 'fortune-engine-studio-mode-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let introRunning = false;
  let decorateQueued = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function readGame() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      return { config, session };
    } catch (_) { return { config:null, session:null }; }
  }

  function activeItems(config, session) {
    if (!config || !session) return [];
    return config.forfeits.filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    });
  }

  function restAccent() {
    const { config, session } = readGame();
    const active = config?.levels?.filter(level => session?.activeLevels?.[level.id]) || [];
    return active.at(-1)?.color || '#65d8ff';
  }

  function setAccent(color) {
    document.documentElement.style.setProperty('--stage-accent', /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#65d8ff');
  }

  function syncLighting() {
    const spinning = shell.classList.contains('wheel-spinning');
    const drama = shell.classList.contains('wheel-drama');
    document.body.classList.toggle('stage-live-spin', spinning || drama);
    const current = getComputedStyle(shell).getPropertyValue('--current-color').trim();
    setAccent((spinning || drama) && current ? current : restAccent());
  }

  function ensureUi() {
    if (!document.getElementById('studioModeBtn') && topActions) {
      const button = document.createElement('button');
      button.id = 'studioModeBtn';
      button.className = 'btn ghost';
      button.type = 'button';
      button.textContent = '◫ Studio Mode';
      topActions.prepend(button);
      button.addEventListener('click', () => setStudioMode(!document.body.classList.contains('studio-mode'), true));
    }
    if (!document.getElementById('studioExitBtn')) {
      const button = document.createElement('button');
      button.id = 'studioExitBtn';
      button.className = 'studio-exit-button';
      button.type = 'button';
      button.textContent = 'Exit Studio';
      button.addEventListener('click', () => setStudioMode(false, true));
      document.body.appendChild(button);
    }
    if (!document.getElementById('showIntroOverlay')) {
      const node = document.createElement('div');
      node.id = 'showIntroOverlay';
      node.className = 'show-intro-overlay';
      node.setAttribute('aria-hidden','true');
      node.innerHTML = '<div class="show-intro-copy"><div class="show-intro-kicker">Fortune Engine</div><div class="show-intro-title">The Wheel Decides</div><div id="showCountdown" class="show-countdown">3</div></div>';
      document.body.appendChild(node);
    }
    if (!document.getElementById('stageUnlockOverlay')) {
      const node = document.createElement('div');
      node.id = 'stageUnlockOverlay';
      node.className = 'stage-unlock-overlay';
      node.setAttribute('aria-hidden','true');
      node.innerHTML = '<div class="stage-unlock-card"><div id="stageUnlockIcon" class="stage-unlock-icon">🔓</div><div id="stageUnlockKicker" class="stage-unlock-kicker">New round</div><div id="stageUnlockName" class="stage-unlock-name">Unlocked</div><div class="stage-unlock-hint">tap to continue</div></div>';
      document.body.appendChild(node);
    }
  }

  async function setStudioMode(enabled, requestFullscreen = false) {
    document.body.classList.toggle('studio-mode', enabled);
    try { localStorage.setItem(STUDIO_KEY, enabled ? '1' : '0'); } catch (_) {}
    const button = document.getElementById('studioModeBtn');
    if (button) button.textContent = enabled ? '◫ Exit Studio' : '◫ Studio Mode';
    if (!requestFullscreen) return;
    try {
      if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!enabled && document.fullscreenElement) await document.exitFullscreen();
    } catch (_) {}
  }

  function pulse(node, value) {
    node.textContent = value;
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  async function runIntro() {
    if (introRunning) return;
    introRunning = true;
    ensureUi();
    const overlay = document.getElementById('showIntroOverlay');
    const countdown = document.getElementById('showCountdown');
    try {
      document.body.classList.add('stage-intro-active');
      shell.classList.add('stage-primed');
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden','false');
      if (reduceMotion.matches) {
        countdown.textContent = 'SPIN';
        await sleep(300);
      } else {
        pulse(countdown,'3'); await sleep(280);
        pulse(countdown,'2'); await sleep(280);
        pulse(countdown,'1'); await sleep(280);
        pulse(countdown,'SPIN'); await sleep(300);
      }
    } finally {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden','true');
      document.body.classList.remove('stage-intro-active');
      shell.classList.remove('stage-primed');
      introRunning = false;
    }
  }

  let bypassSpin = false;
  spinBtn.addEventListener('click', event => {
    if (bypassSpin || spinBtn.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runIntro().then(() => {
      bypassSpin = true;
      spinBtn.click();
      bypassSpin = false;
    });
  }, true);

  function addPatterns(root) {
    root.querySelector('defs[data-safe-stage-defs]')?.remove();
    const defs = svg('defs', { 'data-safe-stage-defs':'1' });
    const makePattern = (id, color, rotate) => {
      const p = svg('pattern', { id, width:18, height:18, patternUnits:'userSpaceOnUse', patternTransform:`rotate(${rotate})` });
      p.appendChild(svg('rect', { x:0, y:0, width:4, height:18, fill:color }));
      return p;
    };
    defs.appendChild(makePattern('safeGoodPattern','rgba(150,255,213,.42)',34));
    defs.appendChild(makePattern('safeBadPattern','rgba(255,135,155,.42)',-34));
    defs.appendChild(makePattern('safeRiskPattern','rgba(255,215,120,.48)',45));
    root.insertBefore(defs, root.firstChild);
  }

  function decorateSpecialWedges() {
    decorateQueued = false;
    const root = rotor.querySelector('.wheel-svg');
    if (!root) return;
    const { config, session } = readGame();
    const items = activeItems(config, session);
    root.querySelectorAll('.stage-special-overlay.safe').forEach(node => node.remove());
    root.querySelectorAll('.wheel-segment').forEach(path => path.classList.remove('stage-special-good','stage-special-bad','stage-special-risk','stage-special-unlock','stage-special-timed'));
    if (!items.length) return;
    addPatterns(root);
    const paths = [...root.querySelectorAll('.wheel-segment')];
    items.forEach((item, index) => {
      const path = paths[index];
      if (!path) return;
      let type = '';
      if (item.eventType === 'goodCard') { path.classList.add('stage-special-good'); type = 'good'; }
      else if (item.eventType === 'badCard') { path.classList.add('stage-special-bad'); type = 'bad'; }
      else if (item.eventType === 'doubleOrNothing') { path.classList.add('stage-special-risk'); type = 'risk'; }
      if (item.eventType === 'unlock' || item.unlockLevels?.length) path.classList.add('stage-special-unlock');
      if (Number(item.timerSeconds) > 0) path.classList.add('stage-special-timed');
      if (type) {
        path.after(svg('path', { d:path.getAttribute('d') || '', class:`stage-special-overlay safe ${type}`, 'aria-hidden':'true' }));
      }
    });
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(decorateSpecialWedges));
  }

  async function showUnlocks(names, config) {
    ensureUi();
    if (!Array.isArray(names) || !names.length) return;
    const overlay = document.getElementById('stageUnlockOverlay');
    const groups = (config?.levels || []).filter(level => names.includes(level.name));
    const first = groups[0];
    overlay.style.setProperty('--unlock-accent', first?.color || '#8b7cff');
    document.getElementById('stageUnlockIcon').textContent = groups.length === 1 ? (first?.icon || '🔓') : '🔓';
    document.getElementById('stageUnlockKicker').textContent = names.length === 1 ? 'New round' : 'New categories';
    document.getElementById('stageUnlockName').textContent = names.length === 1 ? `${names[0]} unlocked` : `${names.length} groups unlocked`;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      overlay.addEventListener('click', finish, { once:true });
      setTimeout(finish, reduceMotion.matches ? 500 : 1250);
    });
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    await sleep(100);
    queueDecorate();
  }

  ensureUi();
  try { setStudioMode(localStorage.getItem(STUDIO_KEY) === '1', false); } catch (_) {}
  setAccent(restAccent());
  queueDecorate();
  syncLighting();

  new MutationObserver(() => { queueDecorate(); syncLighting(); }).observe(rotor, { childList:true });
  new MutationObserver(syncLighting).observe(shell, { attributes:true, attributeFilter:['class','style'] });
  window.addEventListener('storage', () => { queueDecorate(); syncLighting(); });
  document.addEventListener('fullscreenchange', () => {
    const button = document.getElementById('studioModeBtn');
    if (button) button.textContent = document.body.classList.contains('studio-mode') ? '◫ Exit Studio' : '◫ Studio Mode';
  });

  window.FortuneShowStage = { runIntro, showUnlocks, setStudioMode, decorateSpecialWedges, refreshLighting:syncLighting };
})();