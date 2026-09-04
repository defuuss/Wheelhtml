(() => {
  'use strict';

  const M = window.FortuneModel;
  const S = window.FortuneSpinStyle;
  const $ = id => document.getElementById(id);

  let config = M.loadConfig();
  let session = M.loadSession(config);
  let spinning = false;
  let rotation = 0;
  let audio = null;
  let segments = [];

  const rotor = $('wheelRotor');
  const spinBtn = $('spinBtn');
  const pointer = $('pointer');
  const overlay = $('resultOverlay');
  const card = $('resultCard');
  const mystery = $('resultMystery');
  const rIcon = $('resultIcon');
  const rTitle = $('resultTitle');
  const rDesc = $('resultDescription');
  const rCategory = $('resultCategory');
  const unlockNotice = $('unlockNotice');
  const fileInput = $('fileInput');

  const norm = value => ((value % 360) + 360) % 360;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
  const randomInt = (min, max) => {
    const a = Math.ceil(Math.min(min, max));
    const b = Math.floor(Math.max(min, max));
    return Math.floor(a + Math.random() * (b - a + 1));
  };
  const randomFloat = (min, max) => {
    const a = Number(Math.min(min, max));
    const b = Number(Math.max(min, max));
    return a + Math.random() * (b - a);
  };
  const smoothStep = t => t * t * (3 - 2 * t);
  const polar = (cx, cy, radius, angle) => ({
    x: cx + radius * Math.cos(angle * Math.PI / 180),
    y: cy + radius * Math.sin(angle * Math.PI / 180)
  });

  function arc(cx, cy, radius, start, end) {
    const p = polar(cx, cy, radius, start);
    const q = polar(cx, cy, radius, end);
    return `M ${cx} ${cy} L ${p.x} ${p.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${q.x} ${q.y} Z`;
  }

  function weight(item) {
    return Math.max(.01, item.weight * (Number(session.runtime[item.id]?.weightMultiplier) || 1));
  }

  function active() {
    return config.forfeits.filter(item => {
      const runtime = session.runtime[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels[item.levelId] &&
        !(item.lifetime.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    });
  }

  function makeSegments(items) {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let angle = -90;
    return items.map(item => {
      const itemWeight = weight(item);
      const span = total ? itemWeight / total * 360 : 0;
      const segment = { item, start: angle, end: angle + span, span, weight: itemWeight, total };
      angle += span;
      return segment;
    });
  }

  function svg(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function renderWheel() {
    const items = active();
    segments = makeSegments(items);
    rotor.innerHTML = '';
    spinBtn.disabled = spinning || !segments.length;

    if (!segments.length) {
      rotor.innerHTML = '<div class="wheel-empty"><strong>No active forfeits</strong><span>Unlock a group or add entries in Edit.</span></div>';
      return;
    }

    const root = svg('svg', { viewBox: '0 0 600 600', role: 'img', 'aria-label': `${segments.length} active wheel entries` });
    root.classList.add('wheel-svg');

    segments.forEach((segment, index) => {
      const path = svg('path', {
        d: arc(300, 300, 286, segment.start, segment.end),
        fill: segment.item.color,
        class: 'wheel-segment',
        'data-index': index
      });
      const title = svg('title');
      title.textContent = segment.item.mystery
        ? `Mystery · ${(segment.weight / segment.total * 100).toFixed(1)}%`
        : `${segment.item.name} · ${(segment.weight / segment.total * 100).toFixed(1)}%`;
      path.appendChild(title);
      root.appendChild(path);

      const edge = polar(300, 300, 286, segment.start);
      root.appendChild(svg('line', { x1: 300, y1: 300, x2: edge.x, y2: edge.y, class: 'wheel-divider' }));

      if (segment.span >= 7) {
        const mid = segment.start + segment.span / 2;
        const pos = polar(300, 300, segment.span < 18 ? 230 : 205, mid);
        const group = svg('g', { transform: `translate(${pos.x} ${pos.y}) rotate(${mid + 90})` });
        const icon = svg('text', {
          x: 0,
          y: config.settings.showTextOnWheel && segment.span >= 20 ? -5 : 7,
          'text-anchor': 'middle',
          class: 'wheel-icon'
        });
        icon.textContent = segment.item.mystery ? '❓' : segment.item.icon;
        group.appendChild(icon);

        if (config.settings.showTextOnWheel && segment.span >= 20) {
          const label = svg('text', { x: 0, y: 25, 'text-anchor': 'middle', class: 'wheel-label' });
          const raw = segment.item.mystery ? 'MYSTERY' : segment.item.name;
          const limit = segment.span >= 35 ? 16 : 10;
          label.textContent = raw.length > limit ? raw.slice(0, limit - 1) + '…' : raw;
          group.appendChild(label);
        }
        root.appendChild(group);
      }
    });

    root.appendChild(svg('circle', { cx: 300, cy: 300, r: 286, class: 'wheel-rim' }));
    rotor.appendChild(root);
    rotor.style.transform = `rotate(${rotation}deg)`;
  }

  function renderLevels() {
    const box = $('levelLights');
    box.innerHTML = '';
    config.levels.forEach(level => {
      const on = !!session.activeLevels[level.id];
      const node = document.createElement('div');
      node.className = `level-light ${on ? 'active' : 'locked'}`;
      node.style.setProperty('--level-color', level.color);
      node.innerHTML = `<span class="level-dot">${esc(level.icon)}</span><span>${esc(level.name)}</span><b>${on ? 'ON' : 'LOCKED'}</b>`;
      box.appendChild(node);
    });
  }

  function renderOdds() {
    const cardNode = document.querySelector('.probability-card');
    if (cardNode) cardNode.hidden = !config.settings.showProbabilities;
    const box = $('probabilityList');
    box.innerHTML = '';
    const list = active();
    const total = list.reduce((sum, item) => sum + weight(item), 0);
    list.sort((a, b) => weight(b) - weight(a)).forEach(item => {
      const node = document.createElement('div');
      node.className = 'probability-row';
      node.innerHTML = `<span class="prob-icon" style="--item-color:${item.color}">${esc(item.mystery ? '❓' : item.icon)}</span><span class="prob-name"><strong>${esc(item.mystery ? 'Mystery' : item.name)}</strong><small>weight ${weight(item).toFixed(1)}</small></span><span class="prob-value">${(weight(item) / total * 100).toFixed(1)}%</span>`;
      box.appendChild(node);
    });
    if (!list.length) box.innerHTML = '<div class="empty-small">No selectable entries.</div>';
  }

  function renderHistory() {
    const box = $('historyList');
    const history = session.history.slice(-8).reverse();
    box.innerHTML = '';
    $('historyHint').textContent = session.history.length
      ? `${session.history.length} result${session.history.length === 1 ? '' : 's'} this session`
      : 'Nothing selected yet';

    history.forEach((entry, index) => {
      const node = document.createElement('div');
      node.className = 'history-item';
      node.innerHTML = `<span class="history-index">${session.history.length - index}</span><span class="history-icon" style="--item-color:${entry.color}">${esc(entry.icon)}</span><span class="history-copy"><strong>${esc(entry.name)}</strong><small>${esc(entry.category)}${entry.unlocked?.length ? ' · unlocked ' + esc(entry.unlocked.join(', ')) : ''}</small></span><span class="history-time">${esc(entry.time)}</span>`;
      box.appendChild(node);
    });

    if (!history.length) box.innerHTML = '<div class="history-empty">Your last results will appear here.</div>';
    $('undoBtn').disabled = !session.undoStack.length || spinning;
  }

  function renderAll() {
    document.title = `${config.settings.title} · Fortune Engine`;
    renderLevels();
    renderWheel();
    renderOdds();
    renderHistory();
    $('spinCount').textContent = session.spinCount;
    $('activeCount').textContent = active().length;
    $('chanceHint').textContent = active().length ? 'WEIGHTED' : '—';
    M.saveSession(session);
  }

  function choose(list) {
    let needle = Math.random() * list.reduce((sum, segment) => sum + segment.weight, 0);
    for (const segment of list) {
      needle -= segment.weight;
      if (needle <= 0) return segment;
    }
    return list.at(-1);
  }

  function pointerIndex(currentRotation, list) {
    const angle = norm(-90 - currentRotation);
    for (let i = 0; i < list.length; i++) {
      if (norm(angle - norm(list[i].start)) <= list[i].span + .0001) return i;
    }
    return 0;
  }

  function snapshot() {
    const snap = M.deepClone(session);
    snap.undoStack = [];
    session.undoStack.push(snap);
    if (session.undoStack.length > 12) session.undoStack.shift();
  }

  function ensureSpinPreview() {
    let preview = $('liveSpinPreview');
    if (preview) return preview;
    preview = document.createElement('div');
    preview.id = 'liveSpinPreview';
    preview.className = 'spin-live-preview';
    preview.setAttribute('aria-live', 'polite');
    preview.innerHTML = '<span class="spin-live-icon">✦</span><span class="spin-live-name">Current</span><span class="spin-live-caption">UNDER THE POINTER</span>';
    $('wheelShell')?.appendChild(preview);
    return preview;
  }

  function hideSpinPreview() {
    const preview = ensureSpinPreview();
    preview.classList.remove('show', 'bump', 'second-wind');
    const caption = preview.querySelector('.spin-live-caption');
    if (caption) caption.textContent = 'UNDER THE POINTER';
  }

  function updateSpinPreview(item, bump = true) {
    const style = S?.load?.() || {};
    if (style.showSlowIcon === false) return;
    const preview = ensureSpinPreview();
    const icon = preview.querySelector('.spin-live-icon');
    const name = preview.querySelector('.spin-live-name');
    icon.textContent = item?.mystery ? '❓' : (item?.icon || '✦');
    name.textContent = item?.mystery ? 'Mystery' : (item?.name || 'Current');
    preview.style.setProperty('--preview-color', item?.color || '#65d8ff');
    preview.classList.add('show');
    if (bump) {
      preview.classList.remove('bump');
      void preview.offsetWidth;
      preview.classList.add('bump');
    }
  }

  function dramaSignal() {
    const preview = ensureSpinPreview();
    preview.classList.add('show', 'second-wind');
    const caption = preview.querySelector('.spin-live-caption');
    if (caption) caption.textContent = 'NOT YET…';
    [430, 540, 680].forEach((freq, i) => beep(freq, .11, .035, i * .06));
    setTimeout(() => {
      preview.classList.remove('second-wind');
      if (caption) caption.textContent = 'STILL MOVING';
    }, 800);
  }

  function motionProfile(totalTargetSeconds, style) {
    const up = randomFloat(Number(style.spinUpMinSeconds ?? .7), Number(style.spinUpMaxSeconds ?? 1.4));
    const down = randomFloat(Number(style.spinDownMinSeconds ?? 3), Number(style.spinDownMaxSeconds ?? 5));
    const cruise = Math.max(.35, totalTargetSeconds - up - down);
    return { up, cruise, down, total: up + cruise + down };
  }

  function animateMotionProfile(from, to, profile, list, previewAfter = null) {
    const distance = to - from;
    const up = Math.max(.001, profile.up);
    const cruise = Math.max(0, profile.cruise);
    const down = Math.max(.001, profile.down);
    const effectiveTime = .5 * up + cruise + .5 * down;
    const maxVelocity = distance / Math.max(.001, effectiveTime);
    const upDistance = .5 * maxVelocity * up;
    const cruiseDistance = maxVelocity * cruise;
    const totalTime = up + cruise + down;
    const upEnd = up;
    const cruiseEnd = up + cruise;

    return new Promise(done => {
      const started = performance.now();
      let last = pointerIndex(from, list);
      let previewVisible = false;

      const frame = now => {
        const elapsed = Math.min(totalTime, (now - started) / 1000);
        let travelled;

        if (elapsed <= upEnd) {
          const acceleration = maxVelocity / up;
          travelled = .5 * acceleration * elapsed * elapsed;
        } else if (elapsed <= cruiseEnd) {
          travelled = upDistance + maxVelocity * (elapsed - upEnd);
        } else {
          const t = elapsed - cruiseEnd;
          const deceleration = maxVelocity / down;
          travelled = upDistance + cruiseDistance + maxVelocity * t - .5 * deceleration * t * t;
        }

        const progress = totalTime ? elapsed / totalTime : 1;
        rotation = elapsed >= totalTime ? to : from + travelled;
        rotor.style.transform = `rotate(${rotation}deg)`;

        const index = pointerIndex(rotation, list);
        const shouldPreview = Number.isFinite(previewAfter) && progress >= previewAfter;
        if (shouldPreview && !previewVisible) {
          previewVisible = true;
          updateSpinPreview(list[index]?.item, false);
        }
        if (index !== last) {
          last = index;
          tick();
          if (shouldPreview) updateSpinPreview(list[index]?.item);
        }

        if (elapsed < totalTime) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
    });
  }

  function animateCreep(from, to, durationMs, list) {
    return new Promise(done => {
      const started = performance.now();
      let last = pointerIndex(from, list);
      const frame = now => {
        const t = Math.min(1, (now - started) / Math.max(1, durationMs));
        rotation = from + (to - from) * smoothStep(t);
        rotor.style.transform = `rotate(${rotation}deg)`;
        const index = pointerIndex(rotation, list);
        if (index !== last) {
          last = index;
          tick();
          updateSpinPreview(list[index]?.item);
        }
        if (t < 1) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
    });
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function spin() {
    if (spinning || !segments.length) return;

    hideResult();
    hideSpinPreview();
    spinning = true;
    spinBtn.disabled = true;
    $('undoBtn').disabled = true;
    snapshot();

    const list = makeSegments(active());
    const pick = choose(list);
    const target = pick.start + pick.span * (.22 + Math.random() * .56);
    const desired = norm(-90 - target);
    const alignment = norm(desired - norm(rotation));
    const style = S?.load?.() || {};

    const minTurns = Math.max(3, Math.round(config.settings.minTurns || 6));
    const maxTurns = Math.max(minTurns, Math.round(style.maxTurns || minTurns + 2));
    const fullTurns = randomInt(minTurns, maxTurns);
    const minTotal = Math.min(config.settings.minSpinSeconds, config.settings.maxSpinSeconds);
    const maxTotal = Math.max(config.settings.minSpinSeconds, config.settings.maxSpinSeconds);
    const targetSeconds = randomFloat(minTotal, maxTotal);
    const profile = motionProfile(targetSeconds, style);

    const start = rotation;
    const final = rotation + fullTurns * 360 + alignment;
    const previewStart = Math.max(.1, Math.min(.8, Number(style.iconPreviewStartPercent || 35) / 100));
    const previewAfter = style.showSlowIcon === false ? null : previewStart;
    const drama = style.dramaEnabled !== false && Math.random() * 100 < Number(style.dramaChance || 0);

    state('Spinning…', `Accelerating ${profile.up.toFixed(1)}s · full speed ${profile.cruise.toFixed(1)}s · slowing ${profile.down.toFixed(1)}s.`);

    if (!drama) {
      await animateMotionProfile(start, final, profile, list, previewAfter);
      rotation = final;
    } else {
      const minCreep = Math.max(5, Number(style.dramaCreepMinDegrees || 30));
      const maxCreep = Math.max(minCreep, Number(style.dramaCreepMaxDegrees || 80));
      const creepDegrees = randomInt(minCreep, maxCreep);
      const fakeStop = final - creepDegrees;

      await animateMotionProfile(start, fakeStop, profile, list, previewAfter);
      rotation = fakeStop;
      updateSpinPreview(list[pointerIndex(rotation, list)]?.item, false);
      state('Almost…', 'The wheel finished its normal slowdown… but drama mode is not finished.');
      dramaSignal();
      await wait(280 + Math.random() * 420);
      await animateCreep(fakeStop, final, 1500 + Math.random() * 1300, list);
      rotation = final;
    }

    rotor.style.transform = `rotate(${rotation}deg)`;
    updateSpinPreview(pick.item, false);
    const outcome = applyResult(pick.item);
    spinning = false;
    renderAll();

    setTimeout(() => {
      hideSpinPreview();
      showResult(pick.item, outcome);
    }, 300);
  }

  function evaluateRules(currentId) {
    const occurred = new Set(session.history.map(entry => entry.id));
    occurred.add(currentId);
    const unlocked = [];
    const rules = [];
    (config.rules || []).forEach(rule => {
      if (!rule.enabled || !rule.conditionForfeitIds.length) return;
      const matches = rule.conditionForfeitIds.map(id => occurred.has(id));
      const ok = rule.mode === 'any' ? matches.some(Boolean) : matches.every(Boolean);
      if (!ok) return;
      const fresh = [];
      rule.unlockLevels.forEach(id => {
        if (session.activeLevels[id]) return;
        session.activeLevels[id] = true;
        const level = config.levels.find(item => item.id === id);
        if (level) { unlocked.push(level.name); fresh.push(level.name); }
      });
      if (fresh.length) rules.push(rule.name);
    });
    return { unlocked, rules };
  }

  function applyResult(item) {
    const activeBefore = { ...session.activeLevels };
    const unlocked = [];
    session.spinCount++;

    Object.values(session.runtime).forEach(runtime => { if (runtime.cooldown > 0) runtime.cooldown--; });

    item.unlockLevels.forEach(id => {
      if (session.activeLevels[id]) return;
      session.activeLevels[id] = true;
      const level = config.levels.find(entry => entry.id === id);
      if (level) unlocked.push(level.name);
    });

    evaluateRules(item.id).unlocked.forEach(name => { if (!unlocked.includes(name)) unlocked.push(name); });

    config.forfeits.forEach(entry => {
      const runtime = session.runtime[entry.id];
      if (!runtime || !activeBefore[entry.levelId] || runtime.removed) return;
      if (entry.lifetime.type === 'spins' && runtime.remainingSpins !== null) {
        runtime.remainingSpins--;
        if (runtime.remainingSpins <= 0) runtime.removed = true;
      }
    });

    const runtime = session.runtime[item.id];
    if (item.lifetime.type === 'once') runtime.removed = true;
    if (!runtime.removed && item.cooldown > 0) runtime.cooldown = item.cooldown;

    let specialMessage = '';
    if (item.eventType === 'spinAgain') specialMessage = 'Spin again is active — the next spin is waiting for you.';
    else if (item.eventType === 'doubleSpin') {
      session.doubleSpinTokens = (session.doubleSpinTokens || 0) + 1;
      specialMessage = 'Double-spin token earned.';
    } else if (item.eventType === 'immunity') {
      session.immunityTokens = (session.immunityTokens || 0) + 1;
      specialMessage = `Immunity token earned. You now have ${session.immunityTokens}.`;
    } else if (item.eventType === 'randomize') {
      active().forEach(entry => { session.runtime[entry.id].weightMultiplier = Number((.6 + Math.random()).toFixed(2)); });
      specialMessage = 'Chaos Shuffle changed the effective weights of active entries.';
    } else if (item.eventType === 'unlock' && unlocked.length) {
      specialMessage = `${unlocked.join(', ')} ${unlocked.length === 1 ? 'is' : 'are'} now active.`;
    }

    session.history.push({
      id: item.id,
      name: item.name,
      icon: item.icon,
      color: item.color,
      category: item.category,
      unlocked,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (session.history.length > 50) session.history.shift();
    M.saveSession(session);
    return { unlocked, specialMessage };
  }

  function state(title, text) {
    $('stateTitle').textContent = title;
    $('stateText').textContent = text;
  }

  function showResult(item, outcome) {
    overlay.hidden = false;
    overlay.classList.add('show');
    card.className = `result-card result-${item.animation}`;
    card.style.setProperty('--result-color', item.color);
    rCategory.textContent = item.category || 'RESULT';
    rTitle.textContent = item.mystery ? 'Mystery revealed…' : item.name;
    rDesc.textContent = item.mystery ? 'The wheel kept this one hidden.' : (item.description || 'Selected by the wheel.');
    rIcon.textContent = item.mystery ? '❓' : item.icon;
    mystery.hidden = !item.mystery;
    rIcon.hidden = item.mystery;
    unlockNotice.hidden = !(outcome.unlocked.length || outcome.specialMessage);
    unlockNotice.textContent = outcome.unlocked.length ? `UNLOCKED · ${outcome.unlocked.join(' + ')}` : outcome.specialMessage;
    $('resultSpinBtn').textContent = item.eventType === 'spinAgain' ? 'Spin again!' : 'Spin again';
    tone();

    if (item.mystery) {
      setTimeout(() => {
        if (overlay.hidden) return;
        mystery.hidden = true;
        rIcon.hidden = false;
        rIcon.textContent = item.icon;
        rTitle.textContent = item.name;
        rDesc.textContent = item.description || 'Mystery revealed.';
        card.classList.add('mystery-revealed');
        if (item.animation === 'confetti') confetti();
      }, 950);
    } else if (item.animation === 'confetti') setTimeout(confetti, 180);

    const bits = [item.name];
    if (outcome.unlocked.length) bits.push('Unlocked ' + outcome.unlocked.join(', '));
    if (outcome.specialMessage) bits.push(outcome.specialMessage);
    state('Last result', bits.join(' · '));
  }

  function hideResult() {
    overlay.classList.remove('show');
    overlay.hidden = true;
    card.className = 'result-card';
  }

  function confetti() {
    const colors = ['#fff', '#57d3ff', '#ff6bd6', '#ffb454', '#8b7cff'];
    for (let i = 0; i < 38; i++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--x', `${(Math.random() - .5) * 520}px`);
      piece.style.setProperty('--y', `${-80 - Math.random() * 330}px`);
      piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--c', colors[i % colors.length]);
      card.appendChild(piece);
      setTimeout(() => piece.remove(), 1600);
    }
  }

  function ctx() {
    if (!config.settings.soundEnabled) return null;
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) audio = new Audio();
    }
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }

  function beep(freq = 0, duration = .04, gain = .04, delay = 0) {
    const context = ctx();
    if (!context) return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const at = context.currentTime + delay;
    oscillator.frequency.value = freq;
    volume.gain.setValueAtTime(gain, at);
    volume.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .01);
  }

  function tick() {
    pointer.classList.remove('tick');
    void pointer.offsetWidth;
    pointer.classList.add('tick');
    beep(780, .035, .045);
  }

  function tone() {
    [440, 660, 880].forEach((freq, i) => beep(freq, .16, .055, i * .08));
  }

  function undo() {
    if (spinning || !session.undoStack.length) return;
    const stack = session.undoStack;
    const previous = stack.pop();
    session = { ...previous, undoStack: stack };
    rotation = 0;
    state('Last spin undone', 'The previous wheel state, cooldowns, lifetimes and unlocks have been restored.');
    renderAll();
    toast('Last spin restored.');
  }

  function reset() {
    if (!confirm('Reset the current session? This clears spin history, cooldowns and unlocked groups. Your wheel configuration stays intact.')) return;
    session = M.resetSession(config);
    rotation = 0;
    state('Session reset', 'The wheel is back to its configured starting groups.');
    renderAll();
    toast('Session reset.');
  }

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  async function loadXml(file) {
    try {
      config = M.saveConfig(await M.readXmlFile(file));
      session = M.resetSession(config);
      rotation = 0;
      renderAll();
      state('XML loaded', 'A fresh session was started with the imported wheel configuration.');
      toast('Wheel loaded from XML.');
    } catch (error) {
      toast(error.message || 'Could not load XML.');
    } finally {
      fileInput.value = '';
    }
  }

  spinBtn.addEventListener('click', () => { ctx(); spin(); });
  $('saveBtn').addEventListener('click', () => M.downloadXml(config));
  $('loadBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => loadXml(fileInput.files?.[0]));
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', reset);
  $('resultCloseBtn').addEventListener('click', hideResult);
  $('resultSpinBtn').addEventListener('click', () => { hideResult(); setTimeout(spin, 100); });
  overlay.addEventListener('click', event => { if (event.target.classList.contains('result-backdrop')) hideResult(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) hideResult(); });

  renderAll();
})();