(() => {
  'use strict';

  const M = window.FortuneModel;
  const levelLights = document.getElementById('levelLights');
  const resultOverlay = document.getElementById('resultOverlay');
  const spinBtn = document.getElementById('spinBtn');
  if (!M || !levelLights || !resultOverlay || !spinBtn) return;

  const seenTransitions = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let postFlowRunning = false;

  function read() {
    try {
      const config = M.loadConfig();
      const session = M.loadSession(config);
      const last = session?.history?.at?.(-1) || null;
      const item = last ? config?.forfeits?.find(candidate => candidate.id === last.id) || null : null;
      return { config, session, last, item };
    } catch (_) { return { config:null, session:null, last:null, item:null }; }
  }

  function injectStyles() {
    if (document.getElementById('progressionSafeStyles')) return;
    const style = document.createElement('style');
    style.id = 'progressionSafeStyles';
    style.textContent = `
      .level-light.completed{border-color:rgba(69,224,168,.28)!important;background:rgba(69,224,168,.055)!important;color:#c6f8e5!important;opacity:.8}.level-light.completed b{color:#8ff4cf!important}.level-light.progress-active b{color:color-mix(in srgb,var(--level-color) 76%,white)!important}
      .scene-state-strip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:4px 2px 2px}.scene-state-label{font-size:.56rem;font-weight:900;letter-spacing:.13em;color:var(--muted2)}.scene-state-pill{padding:4px 8px;border-radius:99px;border:1px solid rgba(255,190,88,.2);background:rgba(255,190,88,.055);color:#ffe0a2;font-size:.62rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
      .level-complete-overlay{--complete-accent:#65d8ff;position:fixed;inset:0;z-index:2920;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--complete-accent) 18%,rgba(4,6,11,.9)),rgba(2,3,7,.97) 62%);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s ease;cursor:pointer}.level-complete-overlay.show{opacity:1;visibility:visible}.level-complete-card{width:min(620px,92vw);padding:34px 28px;text-align:center;border:1px solid color-mix(in srgb,var(--complete-accent) 48%,rgba(255,255,255,.16));border-radius:28px;background:rgba(8,11,19,.9);box-shadow:0 40px 120px rgba(0,0,0,.66),0 0 70px color-mix(in srgb,var(--complete-accent) 20%,transparent);backdrop-filter:blur(16px)}.level-complete-kicker{color:color-mix(in srgb,var(--complete-accent) 78%,white);font-size:.7rem;font-weight:950;letter-spacing:.3em;text-transform:uppercase}.level-complete-name{margin-top:8px;font-size:clamp(2rem,7vw,4.7rem);font-weight:1000;line-height:1.02;text-transform:uppercase;letter-spacing:.045em}.level-complete-state{margin:17px auto 0;display:inline-flex;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,190,88,.23);background:rgba(255,190,88,.06);color:#ffe0a2;font-size:.72rem;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.level-complete-hint{margin-top:15px;color:#8996aa;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase}
      body.studio-mode .scene-state-strip{justify-content:center}
    `;
    document.head.appendChild(style);
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

  function syncSceneStates(session) {
    let strip = document.getElementById('sceneStateStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'sceneStateStrip';
      strip.className = 'scene-state-strip';
      levelLights.insertAdjacentElement('afterend', strip);
    }
    const states = Array.isArray(session?.sceneStates) ? session.sceneStates : [];
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

  function syncLevelLights() {
    const { config, session } = read();
    if (!config || !session) return;
    const occurred = new Set((session.history || []).map(entry => entry.id));
    const lights = [...levelLights.querySelectorAll('.level-light')];
    config.levels.forEach((level, index) => {
      const light = lights[index];
      if (!light) return;
      const completed = !!session.completedLevels?.[level.id];
      const active = !!session.activeLevels?.[level.id] && !completed;
      light.classList.toggle('completed', completed);
      light.classList.toggle('progress-active', active && level.completionMode === 'required');
      const badge = light.querySelector('b');
      if (completed) {
        light.classList.remove('active','locked');
        if (badge) badge.textContent = 'DONE';
      } else if (active && level.completionMode === 'empty') {
        const members = config.forfeits.filter(item => item.enabled && item.levelId === level.id);
        const gone = members.filter(item => session.runtime?.[item.id]?.removed && !session.runtime?.[item.id]?.dependencyLocked);
        if (badge) badge.textContent = `${gone.length}/${members.length}`;
      } else if (active && level.completionMode === 'required') {
        const required = config.forfeits.filter(item => item.enabled && item.levelId === level.id && item.requiredForCompletion);
        if (required.length && badge) badge.textContent = `${required.filter(item => occurred.has(item.id)).length}/${required.length}`;
      }
    });
    syncSceneStates(session);
  }

  async function showCompletion(last, config) {
    const completed = Array.isArray(last?.completedLevels) ? last.completedLevels.filter(Boolean) : [];
    if (!completed.length) return;
    const overlay = ensureCompletionOverlay();
    const first = config.levels.find(level => level.name === completed[0]);
    overlay.style.setProperty('--complete-accent', first?.color || '#65d8ff');
    document.getElementById('levelCompleteName').textContent = completed.length === 1 ? completed[0] : `${completed.length} levels`;
    const states = Array.isArray(last.sceneStatesAdded) ? last.sceneStatesAdded.filter(Boolean) : [];
    const state = document.getElementById('levelCompleteState');
    state.hidden = !states.length;
    state.textContent = states.length ? `STATE · ${states.join(' + ')}` : '';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      overlay.addEventListener('click', finish, { once:true });
      setTimeout(finish, reduced.matches ? 500 : 1200);
    });
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    await sleep(100);
  }

  async function runPostResultFlow() {
    if (postFlowRunning) return;
    const { config, session, last } = read();
    if (!config || !session || !last) return;
    const completed = Array.isArray(last.completedLevels) ? last.completedLevels.filter(Boolean) : [];
    const unlocked = Array.isArray(last.unlocked) ? [...new Set(last.unlocked.filter(Boolean))] : [];
    if (!completed.length && !unlocked.length) return;
    const key = `${session.spinCount || 0}:${last.id || ''}:${completed.join('|')}:${unlocked.join('|')}`;
    if (seenTransitions.has(key)) return;
    seenTransitions.add(key);
    postFlowRunning = true;
    try {
      await showCompletion(last, config);
      if (unlocked.length && window.FortuneShowStage?.showUnlocks) await window.FortuneShowStage.showUnlocks(unlocked, config);
    } finally {
      postFlowRunning = false;
      syncLevelLights();
      if (spinBtn.disabled && !document.querySelector('.batch-overlay')) {
        const available = config.forfeits.some(item => {
          const runtime = session.runtime?.[item.id];
          return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 && session.activeLevels?.[item.levelId];
        });
        if (available) spinBtn.disabled = false;
      }
    }
  }

  function normalizeResultButtons() {
    const spinAgain = document.getElementById('resultSpinBtn');
    const close = document.getElementById('resultCloseBtn');
    if (spinAgain) {
      spinAgain.hidden = true;
      spinAgain.style.display = 'none';
      spinAgain.setAttribute('aria-hidden','true');
    }
    if (close && !close.hidden) close.textContent = 'OK';
  }

  injectStyles();
  ensureCompletionOverlay();
  normalizeResultButtons();
  syncLevelLights();

  let wasVisible = !resultOverlay.hidden;
  new MutationObserver(() => {
    normalizeResultButtons();
    const visible = !resultOverlay.hidden;
    if (visible) wasVisible = true;
    else if (wasVisible) {
      wasVisible = false;
      setTimeout(runPostResultFlow, 40);
      setTimeout(syncLevelLights, 80);
    }
  }).observe(resultOverlay, { attributes:true, attributeFilter:['hidden','class'] });

  new MutationObserver(() => {
    normalizeResultButtons();
    syncLevelLights();
  }).observe(document.getElementById('spinCount'), { childList:true });

  document.getElementById('resultCloseBtn')?.addEventListener('click', () => {
    setTimeout(syncLevelLights, 50);
  });
})();