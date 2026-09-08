(() => {
  'use strict';

  const M = window.FortuneModel;
  const shell = document.getElementById('wheelShell');
  const rotor = document.getElementById('wheelRotor');
  const spinBtn = document.getElementById('spinBtn');
  if (!M || !shell || !rotor || !spinBtn) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const norm = value => ((Number(value) % 360) + 360) % 360;
  const polar = (cx, cy, radius, angle) => ({
    x: cx + radius * Math.cos(angle * Math.PI / 180),
    y: cy + radius * Math.sin(angle * Math.PI / 180)
  });

  let config = null;
  let session = null;
  let segments = [];
  let tracking = false;
  let decorateQueued = false;

  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function readRotation() {
    const match = String(rotor.style.transform || '').match(/rotate\(([-+\d.]+)deg\)/i);
    return match ? Number(match[1]) || 0 : 0;
  }

  function weight(item) {
    return Math.max(.01, Number(item.weight || 0) * (Number(session?.runtime?.[item.id]?.weightMultiplier) || 1));
  }

  function refreshData() {
    try {
      config = M.loadConfig();
      session = M.loadSession(config);
    } catch (_) {
      config = null;
      session = null;
    }
    if (!config || !session) { segments = []; return; }
    const items = config.forfeits.filter(item => {
      const runtime = session.runtime?.[item.id];
      return item.enabled && runtime && !runtime.removed && runtime.cooldown <= 0 &&
        session.activeLevels?.[item.levelId] &&
        !(item.lifetime?.type === 'spins' && runtime.remainingSpins !== null && runtime.remainingSpins <= 0);
    });
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let angle = -90;
    segments = items.map(item => {
      const w = weight(item);
      const span = total ? w / total * 360 : 0;
      const out = { item, start: angle, end: angle + span, span };
      angle += span;
      return out;
    });
  }

  function pointerIndex(rotation) {
    if (!segments.length) return -1;
    const angle = norm(-90 - rotation);
    for (let i = 0; i < segments.length; i++) {
      if (norm(angle - norm(segments[i].start)) <= segments[i].span + .0001) return i;
    }
    return 0;
  }

  function arcLine(radius, start, end) {
    const p = polar(300, 300, radius, start);
    const q = polar(300, 300, radius, end);
    return `M ${p.x} ${p.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${q.x} ${q.y}`;
  }

  function addMysteryPattern(root) {
    root.querySelector('defs[data-safe-wheel-defs]')?.remove();
    const defs = svg('defs', { 'data-safe-wheel-defs': '1' });
    const pattern = svg('pattern', { id:'fortuneMysteryTextureSafe', width:18, height:18, patternUnits:'userSpaceOnUse', patternTransform:'rotate(35)' });
    pattern.appendChild(svg('rect', { x:0, y:0, width:5, height:18, fill:'rgba(255,255,255,.34)' }));
    pattern.appendChild(svg('rect', { x:9, y:0, width:2, height:18, fill:'rgba(255,255,255,.12)' }));
    defs.appendChild(pattern);
    root.insertBefore(defs, root.firstChild);
  }

  function decorate() {
    decorateQueued = false;
    refreshData();
    const root = rotor.querySelector('.wheel-svg');
    if (!root) return;
    root.querySelectorAll('[data-safe-wheel-layer], .wheel-mystery-overlay.safe').forEach(node => node.remove());
    root.querySelectorAll('.wheel-segment').forEach(path => path.classList.remove('current-under-pointer','is-mystery-segment'));
    if (!segments.length) return;

    addMysteryPattern(root);
    const groupColors = new Map((config.levels || []).map(level => [level.id, level.color || '#64748b']));
    const ring = svg('g', { 'data-safe-wheel-layer':'ring', class:'wheel-group-ring-layer' });
    const tiny = svg('g', { 'data-safe-wheel-layer':'tiny', class:'wheel-tiny-marker-layer' });

    segments.forEach((segment, index) => {
      const path = root.querySelector(`.wheel-segment[data-index="${index}"]`);
      if (!path) return;
      const groupColor = groupColors.get(segment.item.levelId) || segment.item.color || '#64748b';
      ring.appendChild(svg('path', { d:arcLine(292, segment.start + .25, segment.end - .25), stroke:groupColor, class:'wheel-group-ring-segment' }));
      if (segment.item.mystery) {
        path.classList.add('is-mystery-segment');
        const overlay = svg('path', { d:path.getAttribute('d') || '', fill:'url(#fortuneMysteryTextureSafe)', class:'wheel-mystery-overlay safe', 'aria-hidden':'true' });
        path.after(overlay);
      }
      if (segment.span < 7) {
        const mid = segment.start + segment.span / 2;
        const pos = polar(300, 300, 250, mid);
        tiny.appendChild(svg('circle', { cx:pos.x, cy:pos.y, r:segment.span < 3 ? 3.2 : 4.2, stroke:segment.item.color || groupColor, class:'wheel-tiny-marker' }));
      }
    });
    root.append(ring, tiny);
    updateHighlight();
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(decorate);
  }

  function updateHighlight() {
    if (!segments.length) return;
    const index = pointerIndex(readRotation());
    if (index < 0) return;
    rotor.querySelectorAll('.wheel-segment').forEach(path => path.classList.toggle('current-under-pointer', Number(path.dataset.index) === index));
    shell.style.setProperty('--current-color', segments[index]?.item?.color || '#65d8ff');
  }

  function beginSpinVisuals() {
    if (tracking) return;
    refreshData();
    tracking = true;
    shell.classList.remove('wheel-ready','wheel-winner-lock');
    shell.classList.add('wheel-spinning');
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    rotor.querySelectorAll('.current-under-pointer').forEach(path => path.classList.remove('current-under-pointer'));
  }

  function finishSpinVisuals() {
    tracking = false;
    shell.classList.remove('wheel-spinning','wheel-winner-lock','wheel-drama');
    document.body.classList.remove('wheel-drama-active');
    document.getElementById('winnerLockSvg')?.remove();
    document.getElementById('winnerLockBadge')?.remove();
    shell.classList.add('wheel-ready');
    queueDecorate();
  }

  window.addEventListener('fortune-spin-start', beginSpinVisuals);
  window.addEventListener('fortune-spin-end', finishSpinVisuals);

  new MutationObserver(queueDecorate).observe(rotor, { childList:true });
  new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      const node = mutation.target;
      if (node?.id === 'liveSpinPreview') {
        const drama = node.classList.contains('second-wind');
        shell.classList.toggle('wheel-drama', drama);
        document.body.classList.toggle('wheel-drama-active', drama);
      }
    });
  }).observe(shell, { subtree:true, attributes:true, attributeFilter:['class'] });

  shell.classList.add('wheel-ready');
  decorate();
})();
