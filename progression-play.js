(() => {
  'use strict';

  if (window.__fortuneProgressionPlay) return;
  window.__fortuneProgressionPlay = true;

  const M = window.FortuneModel;
  const P = window.FortuneProgressionState;
  const levelLights = document.getElementById('levelLights');
  const resultOverlay = document.getElementById('resultOverlay');
  const spinBtn = document.getElementById('spinBtn');
  if (!M || !P || !levelLights || !resultOverlay || !spinBtn) return;

  const seenTransitions = new Set();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function injectStyles() {
    if (document.getElementById('progressionPlayStyles')) return;
    const style = document.createElement('style');
    style.id = 'progressionPlayStyles';
    style.textContent = `
      .level-light.completed{border-color:rgba(69,224,168,.28)!important;background:rgba(69,224,168,.055)!important;color:#c6f8e5!important;opacity:.78}.level-light.completed .level-dot{filter:none!important;background:rgba(69,224,168,.08)!important}.level-light.completed b{color:#8ff4cf!important}.level-light.progress-active b{color:color-mix(in srgb,var(--level-color) 76%,white)!important}
      .scene-state-strip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:4px 2px 2px}.scene-state-label{font-size:.56rem;font-weight:900;letter-spacing:.13em;color:var(--muted2)}.scene-state-pill{padding:4px 8px;border-radius:99px;border:1px solid rgba(255,190,88,.2);background:rgba(255,190,88,.055);color:#ffe0a2;font-size:.62rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
      .level-complete-overlay{--complete-accent:#65d8ff;position:fixed;inset:0;z-index:2920;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--complete-accent) 18%,rgba(4,6,11,.9)),rgba(2,3,7,.97) 62%);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s ease;cursor:pointer}.level-complete-overlay.show{opacity:1;visibility:visible}.level-complete-card{width:min(620px,92vw);padding:34px 28px;text-align:center;border:1px solid color-mix(in srgb,var(--complete-accent) 48%,rgba(255,255,255,.16));border-radius:28px;background:rgba(8,11,19,.88);box-shadow:0 40px 120px rgba(0,0,0,.66),0 0 70px color-mix(in srgb,var(--complete-accent) 20%,transparent);backdrop-filter:blur(16px);animation:levelCompletePop .72s cubic-bezier(.16,.82,.28,1)}.level-complete-kicker{color:color-mix(in srgb,var(--complete-accent) 78%,white);font-size:.7rem;font-weight:950;letter-spacing:.3em;text-transform:uppercase}.level-complete-name{margin-top:8px;font-size:clamp(2rem,7vw,4.7rem);font-weight:1000;line-height:1.02;text-transform:uppercase;letter-spacing:.045em;text-shadow:0 0 34px color-mix(in srgb,var(--complete-accent) 30%,transparent)}.level-complete-state{margin:17px auto 0;display:inline-flex;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,190,88,.23);background:rgba(255,190,88,.06);color:#ffe0a2;font-size:.72rem;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.level-complete-hint{margin-top:15px;color:#8996aa;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase}@keyframes levelCompletePop{0%{opacity:0;transform:scale(.74)}64%{opacity:1;transform:scale(1.035)}100%{transform:none}}
      body.studio-mode .level-light.completed{opacity:.7}body.studio-mode .scene-state-strip{justify-content:center}
      @media(prefers-reduced-motion:reduce){.level-complete-card{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function read() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      return { config, session };
    } catch (_) { return { config:null, session:null }; }
  }

  function occurredSet(session) {
    return new Set((session?.history || []).map(entry => entry.id));
  }

  function syncLevelLights() {
    const { config, session } = read();
    if (!config || !session) return;
    const occurred = occurredSet(session);
    const lights = [...levelLights.querySelectorAll('.level-light')];
    config.levels.forEach((level, index) => {
      const light = lights[index];
      if (!light) return;
      const completed = !!session.completedLevels?.[level.id];
      const active = !!session.activeLevels?.[level.id] && !completed;
      light.classList.toggle('completed', completed);
      light.classList.toggle('progress-active', active && level.completionMode === 'required');
      if (completed) {
        light.classList.remove('active','locked');
        light.querySelector('b')?.replaceChildren(document.createTextNode('DONE'));
        light.title = `${level.name} completed`;
        return;
      }
      if (active && level.completionMode === 'required') {
        const required = config.forfeits.filter(item => item.enabled && item.levelId === level.id && item.requiredForCompletion);
        const done = required.filter(item => occurred.has(item.id)).length;
        const badge = light.querySelector('b');
        if (badge && required.length) badge.textContent = `${done}/${required.length}`;
        light.title = required.length ? `${done} of ${required.length} required results completed` : 'No required results configured yet';
      }
    });
    syncSceneStates(session);
  }

  function syncSceneStates(session) {
    let strip = document.getElementById('sceneStateStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'sceneStateStrip';
      strip.className = 'scene-state-strip';
      levelLights.insertAdjacentElement('afterend', strip);
    }
    const states = Array.isArray(session.sceneStates) ? session.sceneStates : [];
    strip.hidden = !states.length;
    strip.innerHTML = '';
    if (!states.length) return;
    const label = document.createElement('span');
    label.className = 'scene-state-label';
    label.textContent = 'STATE';
    strip.appendChild(label);
    states.slice(-4).forEach(value => {
      const pill = document.createElement('span');
      pill.className = 'scene-state-pill';
      pill.textContent = value;
      strip.appendChild(pill);
    });
  }

  function latestResult() {
    const { config, session } = read();
    const last = session?.history?.at?.(-1);
    const item = last ? config?.forfeits?.find(candidate => candidate.id === last.id) : null;
    return { config, session, last, item };
  }

  function syncResultButtons() {
    const spinAgain = document.getElementById('resultSpinBtn');
    const close = document.getElementById('resultCloseBtn');
    if (!spinAgain || !close || resultOverlay.hidden) return;
    const { item } = latestResult();
    spinAgain.hidden = true;
    if (item?.eventType === 'spinAgain') close.textContent = 'Continue · spin again';
    else if (!close.hidden) close.textContent = 'Continue';
  }

  function bindSpinAgainFlow() {
    const close = document.getElementById('resultCloseBtn');
    if (!close || close.dataset.progressionSpinAgain === '1') return;
    close.dataset.progressionSpinAgain = '1';
    close.addEventListener('click', event => {
      const { item } = latestResult();
      if (item?.eventType !== 'spinAgain') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      resultOverlay.classList.remove('show');
      resultOverlay.hidden = true;
      setTimeout(() => spinBtn.click(), 130);
    }, true);
  }

  function ensureCompletionOverlay() {
    let node = document.getElementById('levelCompleteOverlay');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'levelCompleteOverlay';
    node.className = 'level-complete-overlay';
    node.setAttribute('aria-hidden','true');
    node.innerHTML = '<div class="level-complete-card"><div class="level-complete-kicker">Level complete</div><div id="levelCompleteName" class="level-complete-name">Completed</div><div id="levelCompleteState" class="level-complete-state" hidden></div><div class="level-complete-hint">tap to continue</div></div>';
    document.body.appendChild(node);
    return node;
  }

  async function showCompletion(info) {
    const overlay = ensureCompletionOverlay();
    const firstName = info.completed[0];
    const level = info.config.levels.find(candidate => candidate.name === firstName);
    overlay.style.setProperty('--complete-accent', level?.color || '#65d8ff');
    document.getElementById('levelCompleteName').textContent = info.completed.length === 1 ? firstName : `${info.completed.length} levels`;
    const state = document.getElementById('levelCompleteState');
    state.hidden = !info.states.length;
    state.textContent = info.states.length ? `STATE · ${info.states.join(' + ')}` : '';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    let resolveClick;
    const clicked = new Promise(resolve => { resolveClick = resolve; });
    const click = () => resolveClick();
    overlay.addEventListener('click', click, { once:true });
    await Promise.race([sleep(reduced.matches ? 500 : 1350), clicked]);
    overlay.removeEventListener('click', click);
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    await sleep(reduced.matches ? 20 : 120);
  }

  function transitionInfo() {
    const { config, session, last } = latestResult();
    const completed = Array.isArray(last?.completedLevels) ? last.completedLevels.filter(Boolean) : [];
    if (!completed.length) return null;
    const states = Array.isArray(last?.sceneStatesAdded) ? last.sceneStatesAdded.filter(Boolean) : [];
    const key = `${session?.spinCount || 0}:${last?.id || ''}:${completed.join('|')}`;
    return { config, session, last, completed, states, key };
  }

  function bindCompletionGate(node) {
    if (!node || node.dataset.progressionCompleteBound === '1') return;
    node.dataset.progressionCompleteBound = '1';
    const observer = new MutationObserver(async () => {
      if (node.hidden || node.dataset.progressionCompleteBypass === '1') return;
      const info = transitionInfo();
      if (!info || seenTransitions.has(info.key)) return;
      seenTransitions.add(info.key);
      node.hidden = true;
      await showCompletion(info);
      syncLevelLights();
      node.dataset.progressionCompleteBypass = '1';
      node.hidden = false;
      requestAnimationFrame(() => { delete node.dataset.progressionCompleteBypass; });
    });
    observer.observe(node, { attributes:true, attributeFilter:['hidden'] });
  }

  function bindDynamic() {
    bindSpinAgainFlow();
    bindCompletionGate(resultOverlay);
    bindCompletionGate(document.getElementById('specialCardOverlay'));
    syncResultButtons();
  }

  injectStyles();
  ensureCompletionOverlay();
  bindDynamic();
  syncLevelLights();

  new MutationObserver(() => {
    syncLevelLights();
    bindDynamic();
  }).observe(levelLights, { childList:true });

  new MutationObserver(() => {
    bindDynamic();
    syncResultButtons();
    syncLevelLights();
  }).observe(resultOverlay, { attributes:true, attributeFilter:['hidden','class'] });

  new MutationObserver(() => bindDynamic()).observe(document.body, { childList:true, subtree:true });
  window.addEventListener('storage', syncLevelLights);
})();
