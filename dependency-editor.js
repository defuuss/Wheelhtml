(() => {
  'use strict';

  const M = window.FortuneModel;
  const D = window.FortuneDependencyState;
  const list = document.getElementById('forfeitEditorList');
  const ruleList = document.getElementById('ruleEditorList');
  if (!M || !D || !list) return;

  const style = document.createElement('style');
  style.id = 'dependencyEditorStyles';
  style.textContent = `
    .dependency-box{margin-top:10px;border-color:rgba(101,216,255,.15);background:rgba(101,216,255,.025)}
    .dependency-box .dependency-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .dependency-box .dependency-head>div:first-child{display:grid;gap:2px}.dependency-box .dependency-head strong{font-size:.76rem}.dependency-box .dependency-head span{font-size:.64rem;color:var(--muted2)}
    .dependency-mode{min-width:145px}.dependency-mode select{width:100%}
    .dependency-summary{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:3px 7px;border:1px solid rgba(101,216,255,.15);border-radius:99px;background:rgba(101,216,255,.04);color:#b7efff;font-size:.59rem;font-weight:800;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .forfeit-editor-card.has-dependency{--dep-indent:calc(var(--dep-depth,0) * 30px);margin-left:var(--dep-indent)!important;width:calc(100% - var(--dep-indent));border-left-color:rgba(101,216,255,.22)!important}
    .forfeit-editor-card.has-dependency::before{width:calc(20px + var(--dep-indent));left:calc(-20px - var(--dep-indent))}
    .forfeit-editor-card.dependency-parent{box-shadow:inset 3px 0 0 rgba(101,216,255,.12)}
    .dep-chain-badge{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:2px;padding:0 6px;border-radius:99px;border:1px solid rgba(101,216,255,.14);background:rgba(101,216,255,.04);color:#9deaff;font-size:.56rem;font-weight:900}
    .rule-occurrence-field{min-width:130px}.rule-occurrence-field input{width:100%}
    .dependency-empty{color:var(--muted2);font-size:.66rem;padding:4px 0}
    @media(max-width:700px){.forfeit-editor-card.has-dependency{--dep-indent:calc(var(--dep-depth,0) * 16px)}}
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  let scheduled = false;
  let suppressObserverUntil = 0;
  const nameOf = card => card?.querySelector?.('.js-name')?.value?.trim() || card?.dataset?.id || 'Forfeit';
  const cards = () => [...list.querySelectorAll('.forfeit-editor-card[data-id]')];
  const cardMap = () => new Map(cards().map(card => [card.dataset.id, card]));

  function groupLabel(card) {
    const group = card.closest('.forfeit-group');
    return group?.querySelector('.forfeit-group-title strong')?.textContent?.trim() || 'Group';
  }

  function dependencyLabel(state, byId) {
    const names = (state.requiresForfeitIds || []).map(id => nameOf(byId.get(id) || { dataset: { id } }));
    if (!names.length) return '';
    return `${state.requiresMode === 'any' ? 'after ANY' : 'after'} ${names.join(state.requiresMode === 'any' ? ' / ' : ' + ')}`;
  }

  function renderDependencyBox(card, byId) {
    const id = card.dataset.id;
    let box = card.querySelector(':scope > .dependency-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'unlock-box dependency-box';
      const unlock = card.querySelector(':scope > .unlock-box');
      if (unlock) unlock.insertAdjacentElement('afterend', box);
      else card.appendChild(box);
    }

    const current = D.getForfeit(id);
    const others = [...byId.entries()]
      .filter(([otherId]) => otherId !== id)
      .sort((a, b) => nameOf(a[1]).localeCompare(nameOf(b[1]), undefined, { sensitivity: 'base', numeric: true }));

    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'dependency-head';
    head.innerHTML = `<div><strong>Availability dependency</strong><span>Keep this forfeit off the wheel until other result(s) have happened.</span></div>`;

    const modeLabel = document.createElement('label');
    modeLabel.className = 'field dependency-mode';
    modeLabel.innerHTML = `<span>Requirement</span><select><option value="all">ALL selected</option><option value="any">ANY selected</option></select>`;
    const mode = modeLabel.querySelector('select');
    mode.value = current.requiresMode || 'all';
    mode.addEventListener('change', () => {
      const next = D.getForfeit(id);
      next.requiresMode = mode.value;
      D.setForfeit(id, next);
      document.body.classList.add('dirty');
      schedule();
    });
    head.appendChild(modeLabel);
    box.appendChild(head);

    const checks = document.createElement('div');
    checks.className = 'unlock-checks dependency-checks';
    if (!others.length) {
      checks.innerHTML = '<span class="dependency-empty">Add another forfeit first.</span>';
    } else {
      others.forEach(([otherId, otherCard]) => {
        const label = document.createElement('label');
        label.className = 'unlock-chip';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.forfeitId = otherId;
        input.checked = current.requiresForfeitIds.includes(otherId);
        input.addEventListener('change', () => {
          const next = D.getForfeit(id);
          const set = new Set(next.requiresForfeitIds || []);
          input.checked ? set.add(otherId) : set.delete(otherId);
          next.requiresForfeitIds = [...set];
          D.setForfeit(id, next);
          document.body.classList.add('dirty');
          schedule();
        });
        const span = document.createElement('span');
        span.textContent = `${otherCard.querySelector('.js-icon')?.value || '🎯'} ${nameOf(otherCard)} · ${groupLabel(otherCard)}`;
        label.append(input, span);
        checks.appendChild(label);
      });
    }
    box.appendChild(checks);
  }

  function renderSummary(card, byId) {
    const id = card.dataset.id;
    const head = card.querySelector(':scope > .editor-card-head');
    if (!head) return;
    let badge = head.querySelector('.dependency-summary');
    const state = D.getForfeit(id);
    const label = dependencyLabel(state, byId);
    if (!label) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'dependency-summary';
      const title = head.querySelector('.editor-title-block');
      title?.appendChild(badge);
    }
    badge.textContent = `↳ ${label}`;
  }

  function visualTree(byId) {
    const groups = [...list.querySelectorAll('.forfeit-group-body')];
    groups.forEach(body => {
      const groupCards = [...body.querySelectorAll(':scope > .forfeit-editor-card[data-id]')];
      if (!groupCards.length) return;
      const ids = new Set(groupCards.map(card => card.dataset.id));
      const childMap = new Map(groupCards.map(card => [card.dataset.id, []]));
      const primaryParent = new Map();

      groupCards.forEach(card => {
        const id = card.dataset.id;
        const reqs = D.getForfeit(id).requiresForfeitIds.filter(ref => ids.has(ref));
        if (reqs.length) {
          primaryParent.set(id, reqs[0]);
          childMap.get(reqs[0])?.push(id);
        }
      });

      childMap.forEach(children => children.sort((a, b) => nameOf(byId.get(a)).localeCompare(nameOf(byId.get(b)), undefined, { sensitivity: 'base', numeric: true })));
      const roots = groupCards.map(c => c.dataset.id).filter(id => !primaryParent.has(id))
        .sort((a, b) => nameOf(byId.get(a)).localeCompare(nameOf(byId.get(b)), undefined, { sensitivity: 'base', numeric: true }));
      const visited = new Set();
      const ordered = [];
      const walk = (id, depth, trail = new Set()) => {
        if (visited.has(id) || trail.has(id)) return;
        visited.add(id);
        ordered.push({ id, depth });
        const nextTrail = new Set(trail); nextTrail.add(id);
        (childMap.get(id) || []).forEach(child => walk(child, depth + 1, nextTrail));
      };
      roots.forEach(id => walk(id, 0));
      groupCards.forEach(card => { if (!visited.has(card.dataset.id)) walk(card.dataset.id, 0); });

      ordered.forEach((entry, index) => {
        const card = byId.get(entry.id);
        if (!card) return;
        card.style.order = String(index + 1);
        card.style.setProperty('--dep-depth', String(Math.min(entry.depth, 6)));
        const dep = D.getForfeit(entry.id);
        card.classList.toggle('has-dependency', dep.requiresForfeitIds.length > 0);
        card.classList.toggle('dependency-parent', (childMap.get(entry.id) || []).length > 0);
        const orderBadge = card.querySelector('.tree-order-badge');
        if (orderBadge) orderBadge.textContent = String(index + 1).padStart(2, '0');
        let chain = card.querySelector(':scope > .editor-card-head > .dep-chain-badge');
        const children = (childMap.get(entry.id) || []).length;
        if (children) {
          if (!chain) {
            chain = document.createElement('span');
            chain.className = 'dep-chain-badge';
            card.querySelector(':scope > .editor-card-head')?.appendChild(chain);
          }
          chain.textContent = `→ ${children}`;
          chain.title = `${children} dependent forfeit${children === 1 ? '' : 's'}`;
        } else chain?.remove();
      });
    });
  }

  function enhanceRules() {
    if (!ruleList) return;
    const config = M.loadConfig();
    const ruleCards = [...ruleList.querySelectorAll(':scope > .rule-editor-card')];
    ruleCards.forEach((card, index) => {
      if (card.querySelector('.rule-occurrence-field')) return;
      const rule = config.rules[index];
      if (!rule) return;
      const label = document.createElement('label');
      label.className = 'field rule-occurrence-field';
      label.innerHTML = 'Required occurrences<input type="number" min="1" max="99" step="1">';
      const input = label.querySelector('input');
      input.value = D.getRuleCount(rule.id);
      input.title = 'Each selected condition must occur this many times before the group unlocks.';
      input.addEventListener('input', () => {
        D.setRuleCount(rule.id, input.value);
        document.body.classList.add('dirty');
      });
      const enabled = card.querySelector('.js-rule-enabled');
      enabled?.closest('.check-line')?.insertAdjacentElement('beforebegin', label);
    });
  }

  function run() {
    scheduled = false;
    suppressObserverUntil = performance.now() + 80;
    const byId = cardMap();
    byId.forEach(card => {
      renderDependencyBox(card, byId);
      renderSummary(card, byId);
    });
    visualTree(byId);
    enhanceRules();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const mutationSchedule = () => { if (performance.now() >= suppressObserverUntil) schedule(); };
  new MutationObserver(mutationSchedule).observe(list, { childList: true, subtree: true });
  if (ruleList) new MutationObserver(mutationSchedule).observe(ruleList, { childList: true, subtree: true });
  document.addEventListener('input', event => {
    if (event.target.matches('.js-name,.js-icon,.js-level')) schedule();
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.js-level')) schedule();
  });
  document.getElementById('editorFileInput')?.addEventListener('change', () => setTimeout(schedule, 150));
  document.getElementById('applyBtn')?.addEventListener('click', () => setTimeout(schedule, 50));
  schedule();
})();
