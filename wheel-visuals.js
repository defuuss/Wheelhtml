(() => {
  'use strict';

  if (window.__fortuneWheelVisuals) return;
  window.__fortuneWheelVisuals = true;

  const M = window.FortuneModel;
  const shell = document.getElementById('wheelShell');
  const rotor = document.getElementById('wheelRotor');
  const spinBtn = document.getElementById('spinBtn');
  const pointer = document.getElementById('pointer');
  const overlay = document.getElementById('resultOverlay');
  if (!M || !shell || !rotor || !spinBtn || !pointer || !overlay) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const norm = value => ((Number(value) % 360) + 360) % 360;
  const polar = (cx, cy, radius, angle) => ({
    x: cx + radius * Math.cos(angle * Math.PI / 180),
    y: cy + radius * Math.sin(angle * Math.PI / 180)
  });

  let config = null;
  let session = null;
  let visualSegments = [];
  let visualSpinning = false;
  let raf = 0;
  let lastIndex = -1;
  let lastSnapshot = null;
  let winnerLockUntil = 0;
  let winnerTimer = 0;
  let resultGateTimer = 0;
  let allowOverlayOnce = false;
  let decorateQueued = false;

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function readRotation() {
    const raw = rotor.style.transform || '';
    const match = raw.match(/rotate\(([-+\d.]+)deg\)/i);
    return match ? Number(match[1]) || 0 : 0;
  }

  function weight(item) {
    return Math.max(.01, Number(item.weight || 0) * (Number(session?.runtime?.[item.id]?.weightMultiplier) || 1));
  }

  function activeItems() {
    if (!config || !session) return [];
    return config.forfeits.filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    });
  }

  function refreshData() {
    try {
      config = M.loadConfig();
      session = M.loadSession(config);
    } catch (error) {
      console.warn('Wheel visual layer could not read wheel state:', error);
      config = null;
      session = null;
    }

    const items = activeItems();
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let angle = -90;
    visualSegments = items.map(item => {
      const itemWeight = weight(item);
      const span = total ? itemWeight / total * 360 : 0;
      const segment = { item, start: angle, end: angle + span, span, weight: itemWeight, total };
      angle += span;
      return segment;
    });
  }

  function pointerIndex(rotation) {
    if (!visualSegments.length) return -1;
    const angle = norm(-90 - rotation);
    for (let i = 0; i < visualSegments.length; i++) {
      const segment = visualSegments[i];
      if (norm(angle - norm(segment.start)) <= segment.span + .0001) return i;
    }
    return 0;
  }

  function arcLine(radius, start, end) {
    const p = polar(300, 300, radius, start);
    const q = polar(300, 300, radius, end);
    const span = Math.max(0, end - start);
    return `M ${p.x} ${p.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${q.x} ${q.y}`;
  }

  function addMysteryPattern(root) {
    let defs = root.querySelector('defs[data-wheel-visual-defs]');
    if (defs) defs.remove();
    defs = svg('defs', { 'data-wheel-visual-defs': '1' });
    const pattern = svg('pattern', {
      id: 'fortuneMysteryTexture',
      width: 18,
      height: 18,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(35)'
    });
    pattern.appendChild(svg('rect', { x: 0, y: 0, width: 5, height: 18, fill: 'rgba(255,255,255,.38)' }));
    pattern.appendChild(svg('rect', { x: 9, y: 0, width: 2, height: 18, fill: 'rgba(255,255,255,.14)' }));
    defs.appendChild(pattern);
    root.insertBefore(defs, root.firstChild);
  }

  function decorateWheel() {
    decorateQueued = false;
    refreshData();
    const root = rotor.querySelector('.wheel-svg');
    if (!root || !visualSegments.length) {
      shell.classList.toggle('wheel-ready', !visualSpinning);
      return;
    }

    root.querySelectorAll('[data-wheel-visual-layer], .wheel-mystery-overlay').forEach(node => node.remove());
    root.querySelectorAll('.wheel-segment').forEach(path => path.classList.remove('is-mystery-segment', 'current-under-pointer'));
    addMysteryPattern(root);

    const groupColors = new Map((config?.levels || []).map(level => [level.id, level.color || '#64748b']));
    const ring = svg('g', { class: 'wheel-group-ring-layer', 'data-wheel-visual-layer': 'group-ring' });
    const tiny = svg('g', { class: 'wheel-tiny-marker-layer', 'data-wheel-visual-layer': 'tiny-markers' });

    visualSegments.forEach((segment, index) => {
      const path = root.querySelector(`.wheel-segment[data-index="${index}"]`);
      if (!path) return;
      path.dataset.itemId = segment.item.id;

      const groupColor = groupColors.get(segment.item.levelId) || segment.item.color || '#64748b';
      ring.appendChild(svg('path', {
        d: arcLine(292, segment.start + .25, segment.end - .25),
        stroke: groupColor,
        class: 'wheel-group-ring-segment'
      }));

      if (segment.item.mystery) {
        path.classList.add('is-mystery-segment');
        const overlayPath = svg('path', {
          d: path.getAttribute('d'),
          fill: 'url(#fortuneMysteryTexture)',
          class: 'wheel-mystery-overlay',
          'aria-hidden': 'true'
        });
        path.after(overlayPath);
      }

      if (segment.span < 7) {
        const mid = segment.start + segment.span / 2;
        const pos = polar(300, 300, 250, mid);
        tiny.appendChild(svg('circle', {
          cx: pos.x,
          cy: pos.y,
          r: segment.span < 3 ? 3.2 : 4.2,
          stroke: segment.item.color || groupColor,
          class: `wheel-tiny-marker${segment.item.mystery ? ' mystery' : ''}`
        }));
      }
    });

    root.appendChild(ring);
    root.appendChild(tiny);
    shell.classList.toggle('wheel-ready', !visualSpinning && winnerLockUntil <= performance.now());
    updateCurrentHighlight(false);
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(decorateWheel);
  }

  function snapshotFor(index, rotation) {
    const segment = visualSegments[index];
    const path = rotor.querySelector(`.wheel-segment[data-index="${index}"]`);
    if (!segment || !path) return null;
    return {
      index,
      rotation,
      pathD: path.getAttribute('d') || '',
      item: {
        id: segment.item.id,
        name: segment.item.name,
        icon: segment.item.icon,
        color: segment.item.color,
        mystery: !!segment.item.mystery,
        levelId: segment.item.levelId
      }
    };
  }

  function updateCurrentHighlight(capture = true) {
    if (!visualSegments.length) return;
    const rotation = readRotation();
    const index = pointerIndex(rotation);
    if (index < 0) return;
    const segment = visualSegments[index];
    const paths = rotor.querySelectorAll('.wheel-segment');
    paths.forEach(path => path.classList.toggle('current-under-pointer', Number(path.dataset.index) === index));
    shell.style.setProperty('--current-color', segment?.item?.color || '#65d8ff');
    lastIndex = index;
    if (capture && visualSpinning) {
      const snapshot = snapshotFor(index, rotation);
      if (snapshot) lastSnapshot = snapshot;
    }
  }

  function trackingFrame() {
    if (!visualSpinning) {
      raf = 0;
      return;
    }
    updateCurrentHighlight(true);
    raf = requestAnimationFrame(trackingFrame);
  }

  function stopDrama() {
    shell.classList.remove('wheel-drama');
    document.body.classList.remove('wheel-drama-active');
  }

  function startDrama() {
    if (!visualSpinning || shell.classList.contains('wheel-drama')) return;
    shell.classList.add('wheel-drama');
    document.body.classList.add('wheel-drama-active');
  }

  function beginVisualSpin() {
    if (visualSpinning) return;
    refreshData();
    if (!visualSegments.length) return;
    visualSpinning = true;
    lastSnapshot = null;
    lastIndex = -1;
    clearTimeout(winnerTimer);
    winnerLockUntil = 0;
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    shell.classList.remove('wheel-ready', 'wheel-winner-lock');
    shell.classList.add('wheel-spinning');
    pointer.classList.remove('winner-pop');
    stopDrama();
    if (!raf) raf = requestAnimationFrame(trackingFrame);
  }

  function finishWinnerLock() {
    clearTimeout(winnerTimer);
    winnerTimer = 0;
    winnerLockUntil = 0;
    shell.classList.remove('wheel-winner-lock');
    pointer.classList.remove('winner-pop');
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    if (!visualSpinning) shell.classList.add('wheel-ready');
  }

  function startWinnerLock(snapshot) {
    if (!snapshot?.pathD) {
      shell.classList.add('wheel-ready');
      return;
    }

    const duration = 650;
    const color = snapshot.item.color || '#65d8ff';
    shell.style.setProperty('--winner-color', color);
    shell.style.setProperty('--current-color', color);
    shell.classList.remove('wheel-ready');
    shell.classList.add('wheel-winner-lock');
    pointer.classList.remove('winner-pop');
    void pointer.offsetWidth;
    pointer.classList.add('winner-pop');

    const lockSvg = svg('svg', {
      id: 'winnerLockSvg',
      class: 'winner-lock-svg',
      viewBox: '0 0 600 600',
      'aria-hidden': 'true'
    });
    const path = svg('path', {
      d: snapshot.pathD,
      fill: color,
      transform: `rotate(${snapshot.rotation} 300 300)`,
      class: 'winner-lock-path'
    });
    lockSvg.appendChild(path);

    const badge = document.createElement('div');
    badge.id = 'winnerLockBadge';
    badge.className = 'winner-lock-badge';
    const displayIcon = snapshot.item.mystery ? '❓' : (snapshot.item.icon || '✦');
    const displayName = snapshot.item.mystery ? 'Mystery' : (snapshot.item.name || 'Selected');
    badge.innerHTML = `<span class="winner-lock-icon"></span><span class="winner-lock-name"></span>`;
    badge.querySelector('.winner-lock-icon').textContent = displayIcon;
    badge.querySelector('.winner-lock-name').textContent = displayName;

    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    shell.append(lockSvg, badge);

    winnerLockUntil = performance.now() + duration;
    winnerTimer = setTimeout(finishWinnerLock, duration);
  }

  function finishVisualSpin() {
    if (!visualSpinning) return;
    updateCurrentHighlight(true);
    visualSpinning = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    shell.classList.remove('wheel-spinning');
    stopDrama();
    startWinnerLock(lastSnapshot);
    queueDecorate();
  }

  const rotorObserver = new MutationObserver(() => queueDecorate());
  rotorObserver.observe(rotor, { childList: true });

  let previousDisabled = spinBtn.disabled;
  const spinObserver = new MutationObserver(() => {
    const disabled = spinBtn.disabled;
    if (disabled && !previousDisabled) beginVisualSpin();
    if (!disabled && previousDisabled && visualSpinning) finishVisualSpin();
    previousDisabled = disabled;
  });
  spinObserver.observe(spinBtn, { attributes: true, attributeFilter: ['disabled'] });

  /* Programmatic spins can toggle the disabled property very quickly; pointer/click is an extra guard. */
  spinBtn.addEventListener('pointerdown', () => {
    if (!spinBtn.disabled && visualSegments.length) setTimeout(() => { if (spinBtn.disabled) beginVisualSpin(); }, 0);
  });

  const previewObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const target = mutation.target;
      if (target?.id === 'liveSpinPreview' && target.classList?.contains('second-wind')) startDrama();
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node?.id === 'liveSpinPreview' && node.classList?.contains('second-wind')) startDrama();
        });
      }
    }
  });
  previewObserver.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  /* Hold the result card back until the short winner-lock animation is complete. */
  const overlayObserver = new MutationObserver(() => {
    if (overlay.hidden || allowOverlayOnce) {
      if (allowOverlayOnce && !overlay.hidden) allowOverlayOnce = false;
      return;
    }
    const remaining = winnerLockUntil - performance.now();
    if (remaining <= 20) return;
    overlay.hidden = true;
    clearTimeout(resultGateTimer);
    resultGateTimer = setTimeout(() => {
      finishWinnerLock();
      allowOverlayOnce = true;
      overlay.hidden = false;
    }, Math.max(20, remaining));
  });
  overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });

  window.addEventListener('storage', queueDecorate);
  shell.classList.add('wheel-ready');
  decorateWheel();
})();
