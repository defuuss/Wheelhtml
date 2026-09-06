(() => {
  'use strict';

  if (window.__fortuneShowStage) return;
  window.__fortuneShowStage = true;

  const M = window.FortuneModel;
  const shell = document.getElementById('wheelShell');
  const rotor = document.getElementById('wheelRotor');
  const spinBtn = document.getElementById('spinBtn');
  const topActions = document.querySelector('.top-actions');
  const resultOverlay = document.getElementById('resultOverlay');
  if (!M || !shell || !rotor || !spinBtn) return;

  const STUDIO_KEY = 'fortune-engine-studio-mode-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const seenUnlocks = new Set();
  let decorateQueued = false;
  let lightingRaf = 0;
  let introPromise = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[ch]));

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function readGame() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      return { config, session };
    } catch (error) {
      console.warn('Show stage could not read game state:', error);
      return { config: null, session: null };
    }
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
    if (!config || !session) return '#65d8ff';
    const activeGroups = config.levels.filter(level => session.activeLevels?.[level.id]);
    return activeGroups.at(-1)?.color || '#65d8ff';
  }

  function setAccent(color) {
    const value = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#65d8ff';
    document.documentElement.style.setProperty('--stage-accent', value);
  }

  function syncLighting() {
    const spinning = shell.classList.contains('wheel-spinning');
    const winner = shell.classList.contains('wheel-winner-lock');
    const drama = shell.classList.contains('wheel-drama');
    document.body.classList.toggle('stage-live-spin', spinning || drama);
    document.body.classList.toggle('stage-winner-light', winner);

    if (spinning || drama || winner) {
      const variable = winner ? '--winner-color' : '--current-color';
      const color = getComputedStyle(shell).getPropertyValue(variable).trim();
      if (color) setAccent(color);
      if (!lightingRaf) lightingRaf = requestAnimationFrame(lightingLoop);
    } else {
      if (lightingRaf) cancelAnimationFrame(lightingRaf);
      lightingRaf = 0;
      setAccent(restAccent());
    }
  }

  function lightingLoop() {
    lightingRaf = 0;
    const active = shell.classList.contains('wheel-spinning') || shell.classList.contains('wheel-drama') || shell.classList.contains('wheel-winner-lock');
    if (!active) {
      setAccent(restAccent());
      return;
    }
    const winner = shell.classList.contains('wheel-winner-lock');
    const color = getComputedStyle(shell).getPropertyValue(winner ? '--winner-color' : '--current-color').trim();
    if (color) setAccent(color);
    lightingRaf = requestAnimationFrame(lightingLoop);
  }

  function addPatterns(root) {
    root.querySelector('defs[data-stage-special-defs]')?.remove();
    const defs = svg('defs', { 'data-stage-special-defs':'1' });

    const pattern = (id, color, width = 16, stripe = 4, rotate = 35) => {
      const p = svg('pattern', { id, width, height:width, patternUnits:'userSpaceOnUse', patternTransform:`rotate(${rotate})` });
      p.appendChild(svg('rect', { x:0, y:0, width:stripe, height:width, fill:color }));
      return p;
    };

    defs.appendChild(pattern('stageGoodPattern', 'rgba(150,255,213,.42)', 18, 4, 34));
    defs.appendChild(pattern('stageBadPattern', 'rgba(255,135,155,.42)', 16, 4, -34));

    const risk = svg('pattern', { id:'stageRiskPattern', width:24, height:24, patternUnits:'userSpaceOnUse', patternTransform:'rotate(45)' });
    risk.appendChild(svg('rect', { x:0, y:0, width:8, height:24, fill:'rgba(255,215,120,.55)' }));
    risk.appendChild(svg('rect', { x:12, y:0, width:3, height:24, fill:'rgba(255,255,255,.22)' }));
    defs.appendChild(risk);

    const unlock = svg('pattern', { id:'stageUnlockPattern', width:20, height:20, patternUnits:'userSpaceOnUse' });
    unlock.appendChild(svg('circle', { cx:5, cy:5, r:2.2, fill:'rgba(210,190,255,.65)' }));
    unlock.appendChild(svg('circle', { cx:15, cy:15, r:2.2, fill:'rgba(210,190,255,.65)' }));
    defs.appendChild(unlock);

    root.insertBefore(defs, root.firstChild);
  }

  function decorateSpecialWedges() {
    decorateQueued = false;
    const root = rotor.querySelector('.wheel-svg');
    if (!root) return;
    const { config, session } = readGame();
    const items = activeItems(config, session);
    if (!items.length) return;

    root.querySelectorAll('.stage-special-overlay').forEach(node => node.remove());
    root.querySelectorAll('.wheel-segment').forEach(path => {
      path.classList.remove('stage-special-good','stage-special-bad','stage-special-risk','stage-special-unlock','stage-special-timed');
    });
    addPatterns(root);

    const paths = [...root.querySelectorAll('.wheel-segment')];
    items.forEach((item, index) => {
      const path = paths[index];
      if (!path) return;
      path.dataset.stageItemId = item.id;
      const types = [];
      if (item.eventType === 'goodCard') { path.classList.add('stage-special-good'); types.push('good'); }
      if (item.eventType === 'badCard') { path.classList.add('stage-special-bad'); types.push('bad'); }
      if (item.eventType === 'doubleOrNothing') { path.classList.add('stage-special-risk'); types.push('risk'); }
      if (item.eventType === 'unlock' || item.unlockLevels?.length) { path.classList.add('stage-special-unlock'); types.push('unlock'); }
      if (Number(item.timerSeconds) > 0) path.classList.add('stage-special-timed');

      types.forEach(type => {
        const overlay = svg('path', {
          d:path.getAttribute('d') || '',
          class:`stage-special-overlay ${type}`,
          'aria-hidden':'true'
        });
        path.after(overlay);
      });
    });
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(decorateSpecialWedges));
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
    } catch (_) {
      /* Studio layout still works when browser fullscreen is unavailable. */
    }
  }

  function pulseCountdown(node, value) {
    node.textContent = value;
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  async function runIntro() {
    if (introPromise) return introPromise;
    ensureUi();
    introPromise = (async () => {
      const overlay = document.getElementById('showIntroOverlay');
      const countdown = document.getElementById('showCountdown');
      if (!overlay || !countdown) return;
      document.body.classList.add('stage-intro-active');
      shell.classList.add('stage-primed');
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden','false');

      if (reduceMotion.matches) {
        countdown.textContent = 'SPIN';
        await sleep(360);
      } else {
        pulseCountdown(countdown, '3'); await sleep(310);
        pulseCountdown(countdown, '2'); await sleep(310);
        pulseCountdown(countdown, '1'); await sleep(310);
        pulseCountdown(countdown, 'SPIN'); await sleep(330);
      }

      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden','true');
      document.body.classList.remove('stage-intro-active');
      shell.classList.remove('stage-primed');
      await sleep(reduceMotion.matches ? 30 : 110);
    })().finally(() => { introPromise = null; });
    return introPromise;
  }

  function forcedPending() {
    const { session } = readGame();
    return Number(session?.cardState?.forcedForfeits || 0) > 0;
  }

  function bindIntroGate(button, predicate = () => true) {
    if (!button || button.dataset.stageIntroBound === '1') return;
    button.dataset.stageIntroBound = '1';
    let bypass = false;
    button.addEventListener('click', event => {
      if (bypass || button.disabled || !predicate()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runIntro().then(() => {
        bypass = true;
        button.click();
        bypass = false;
      });
    }, true);
  }

  function bindSpinGates() {
    bindIntroGate(spinBtn);
    bindIntroGate(document.getElementById('resultSpinBtn'));
    bindIntroGate(document.getElementById('resultRespinBtn'));
    bindIntroGate(document.getElementById('resultCloseBtn'), forcedPending);
    bindIntroGate(document.getElementById('specialCardClose'), forcedPending);
  }

  function latestUnlockInfo() {
    const { config, session } = readGame();
    const last = session?.history?.at?.(-1);
    const names = Array.isArray(last?.unlocked) ? last.unlocked.filter(Boolean) : [];
    if (!names.length) return null;
    const key = `${session.spinCount || 0}:${last.id || ''}:${names.join('|')}`;
    return { config, session, last, names, key };
  }

  function markUnlockedWedges(names, config) {
    const ids = new Set((config?.levels || []).filter(level => names.includes(level.name)).map(level => level.id));
    if (!ids.size) return;
    const { session } = readGame();
    const items = activeItems(config, session);
    const paths = [...rotor.querySelectorAll('.wheel-segment')];
    items.forEach((item, index) => {
      if (!ids.has(item.levelId) || !paths[index]) return;
      paths[index].classList.add('stage-new-unlocked');
      setTimeout(() => paths[index]?.classList.remove('stage-new-unlocked'), 1300);
    });
    document.querySelectorAll('.level-light').forEach(light => {
      const text = light.textContent || '';
      if (!names.some(name => text.includes(name))) return;
      light.classList.add('stage-new-group');
      setTimeout(() => light.classList.remove('stage-new-group'), 1400);
    });
  }

  async function showUnlocks(names, config) {
    ensureUi();
    const overlay = document.getElementById('stageUnlockOverlay');
    if (!overlay || !names?.length) return;
    const groups = (config?.levels || []).filter(level => names.includes(level.name));
    const first = groups[0];
    const accent = first?.color || '#8b7cff';
    const icon = groups.length === 1 ? (first?.icon || '🔓') : '🔓';
    const title = names.length === 1 ? `${names[0]} unlocked` : `${names.length} groups unlocked`;

    overlay.style.setProperty('--unlock-accent', accent);
    document.getElementById('stageUnlockIcon').textContent = icon;
    document.getElementById('stageUnlockKicker').textContent = names.length === 1 ? 'New round' : 'New categories';
    document.getElementById('stageUnlockName').textContent = title;
    setAccent(accent);
    document.body.classList.add('stage-unlock-active');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');

    let skip;
    const clicked = new Promise(resolve => { skip = resolve; });
    const onClick = () => skip();
    overlay.addEventListener('click', onClick, { once:true });
    await Promise.race([sleep(reduceMotion.matches ? 600 : 1450), clicked]);
    overlay.removeEventListener('click', onClick);
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('stage-unlock-active');
    await sleep(reduceMotion.matches ? 20 : 150);
    markUnlockedWedges(names, config);
    setTimeout(() => setAccent(restAccent()), 900);
  }

  function bindUnlockGate(node) {
    if (!node || node.dataset.stageUnlockBound === '1') return;
    node.dataset.stageUnlockBound = '1';
    const observer = new MutationObserver(async () => {
      if (node.hidden || node.dataset.stageUnlockBypass === '1') return;
      const info = latestUnlockInfo();
      if (!info || seenUnlocks.has(info.key)) return;
      seenUnlocks.add(info.key);
      node.hidden = true;
      await showUnlocks(info.names, info.config);
      node.dataset.stageUnlockBypass = '1';
      node.hidden = false;
      requestAnimationFrame(() => { delete node.dataset.stageUnlockBypass; });
    });
    observer.observe(node, { attributes:true, attributeFilter:['hidden'] });
  }

  function bindDynamicUi() {
    bindSpinGates();
    bindUnlockGate(resultOverlay);
    bindUnlockGate(document.getElementById('specialCardOverlay'));
  }

  ensureUi();
  try { setStudioMode(localStorage.getItem(STUDIO_KEY) === '1', false); } catch (_) {}
  setAccent(restAccent());
  bindDynamicUi();
  queueDecorate();

  new MutationObserver(() => {
    queueDecorate();
    bindDynamicUi();
  }).observe(rotor, { childList:true, subtree:false });

  new MutationObserver(() => syncLighting()).observe(shell, { attributes:true, attributeFilter:['class','style'] });
  new MutationObserver(() => bindDynamicUi()).observe(document.body, { childList:true, subtree:true });

  window.addEventListener('storage', () => { setAccent(restAccent()); queueDecorate(); });
  document.addEventListener('fullscreenchange', () => {
    const button = document.getElementById('studioModeBtn');
    if (button) button.textContent = document.body.classList.contains('studio-mode') ? '◫ Exit Studio' : '◫ Studio Mode';
  });

  window.FortuneShowStage = {
    runIntro,
    showUnlocks,
    setStudioMode,
    decorateSpecialWedges,
    refreshLighting:syncLighting
  };
})();
