(() => {
  'use strict';

  const M = window.FortuneModel;
  const D = window.FortuneDependencyState;
  const list = document.getElementById('forfeitEditorList');
  const pane = document.getElementById('tab-forfeits');
  if (!M || !D || !list || !pane) return;

  const $ = id => document.getElementById(id);
  const text = value => String(value || '').trim();
  const cmp = (a, b) => text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
  let scheduled = false;
  let suppressUntil = 0;
  let logicMode = false;
  let picker = null;

  const style = document.getElementById('dependencyEditorStyles') || document.createElement('style');
  style.id = 'dependencyEditorStyles';
  style.textContent = `
    .dependency-box{display:none!important}
    .dep-compact-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:5px}
    .dep-pill{display:inline-flex;align-items:center;gap:5px;max-width:100%;min-height:22px;padding:2px 7px;border:1px solid rgba(101,216,255,.16);border-radius:99px;background:rgba(101,216,255,.045);color:#b7efff;font-size:.59rem;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
    .dep-pill:hover{border-color:rgba(101,216,255,.34);background:rgba(101,216,255,.09);color:#fff}
    .dep-pill.enables{border-color:rgba(69,224,168,.18);background:rgba(69,224,168,.055);color:#9bf2d3}
    .dep-pill.problem{border-color:rgba(255,120,145,.3);background:rgba(255,92,122,.08);color:#ffb0bd}
    .dep-head-btn{min-height:27px!important;padding:0 8px!important;width:auto!important;font-size:.61rem!important;border-radius:8px!important;white-space:nowrap}
    .dep-head-btn.primary-dep{color:#b7efff;border-color:rgba(101,216,255,.18)}
    .forfeit-editor-card.dep-child{--dep-indent:calc(var(--dep-depth,0) * 22px);margin-left:var(--dep-indent)!important;width:calc(100% - var(--dep-indent))}
    .forfeit-editor-card.dep-child::before{width:calc(20px + var(--dep-indent))!important;left:calc(-20px - var(--dep-indent))!important;background:linear-gradient(90deg,color-mix(in srgb,var(--tree-color) 38%,transparent),rgba(101,216,255,.48))!important}
    .forfeit-editor-card.dep-parent{box-shadow:inset 3px 0 0 rgba(101,216,255,.12)!important}
    .forfeit-editor-card.dep-problem{border-color:rgba(255,100,125,.28)!important}
    .dep-view-toggle{display:inline-flex;gap:3px;margin-left:auto;padding:3px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.025)}
    .dep-view-toggle button{border:0;border-radius:7px;background:transparent;color:var(--muted);padding:6px 9px;font-size:.65rem;font-weight:800;cursor:pointer}
    .dep-view-toggle button.active{background:rgba(101,216,255,.1);color:#dff7ff}
    #dependencyLogicView{display:none;margin-top:12px}
    #tab-forfeits.dep-logic-mode #forfeitEditorList{display:none!important}
    #tab-forfeits.dep-logic-mode #dependencyLogicView{display:grid;gap:12px}
    .dep-logic-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .dep-logic-stat{padding:10px 12px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025)}
    .dep-logic-stat span{display:block;color:var(--muted2);font-size:.57rem;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.dep-logic-stat strong{display:block;margin-top:3px;font-size:1rem}
    .dep-logic-group{border:1px solid rgba(255,255,255,.075);border-radius:15px;background:rgba(9,13,23,.62);overflow:hidden}
    .dep-logic-group-head{display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.055)}
    .dep-logic-group-head .icon{font-size:1.15rem}.dep-logic-group-head strong{font-size:.8rem}.dep-logic-group-head span:last-child{margin-left:auto;color:var(--muted2);font-size:.62rem}
    .dep-flow-list{display:grid;gap:7px;padding:10px}
    .dep-flow-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(150px,.8fr) auto;gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(255,255,255,.018)}
    .dep-flow-row.problem{border-color:rgba(255,100,125,.24);background:rgba(255,70,100,.035)}
    .dep-flow-prereqs{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.dep-flow-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:8px;border:1px solid rgba(101,216,255,.13);background:rgba(101,216,255,.04);font-size:.64rem;color:#c9f3ff}
    .dep-flow-op{font-size:.58rem;font-weight:900;color:#8fdfff;text-align:center}.dep-flow-arrow{color:var(--muted2);font-weight:900}.dep-flow-target{display:flex;align-items:center;gap:7px;min-width:0}.dep-flow-target strong{font-size:.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dep-flow-edit{min-height:28px!important;padding:0 8px!important;font-size:.61rem!important}
    .dep-logic-empty{padding:18px;text-align:center;color:var(--muted2);font-size:.72rem}
    .dep-modal-backdrop{position:fixed;inset:0;z-index:1450;background:rgba(2,5,12,.72);backdrop-filter:blur(5px);display:grid;place-items:center;padding:18px}
    .dep-modal{width:min(720px,96vw);max-height:min(820px,92vh);display:flex;flex-direction:column;border:1px solid rgba(101,216,255,.2);border-radius:20px;background:linear-gradient(180deg,#0d1323,#080b14);box-shadow:0 28px 90px rgba(0,0,0,.55);overflow:hidden}
    .dep-modal-head{display:flex;align-items:center;gap:11px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07)}.dep-modal-head .target-icon{font-size:1.5rem}.dep-modal-head strong{display:block;font-size:.9rem}.dep-modal-head small{display:block;margin-top:2px;color:var(--muted2);font-size:.62rem}.dep-modal-close{margin-left:auto}
    .dep-modal-body{overflow:auto;padding:14px;display:grid;gap:12px}
    .dep-mode-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.dep-mode-tabs button{min-height:40px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025);color:var(--muted);font-weight:800;font-size:.68rem;cursor:pointer}.dep-mode-tabs button.active{border-color:rgba(101,216,255,.3);background:rgba(101,216,255,.1);color:#e5f9ff}
    .dep-selected{display:flex;gap:6px;flex-wrap:wrap;min-height:30px}.dep-selected-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid rgba(101,216,255,.16);border-radius:9px;background:rgba(101,216,255,.05);font-size:.64rem;color:#d7f7ff}.dep-selected-chip button{border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0 1px}
    .dep-search{position:relative}.dep-search input{width:100%;padding-left:35px!important}.dep-search::before{content:'⌕';position:absolute;left:12px;bottom:9px;color:var(--accent);font-size:1rem;z-index:2}
    .dep-picker-groups{display:grid;gap:9px}.dep-picker-group{border:1px solid rgba(255,255,255,.06);border-radius:12px;overflow:hidden}.dep-picker-group-title{padding:7px 10px;background:rgba(255,255,255,.025);color:var(--muted2);font-size:.58rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.dep-picker-options{display:grid}.dep-option{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border:0;border-top:1px solid rgba(255,255,255,.045);background:transparent;color:#fff;text-align:left;cursor:pointer}.dep-option:hover{background:rgba(101,216,255,.045)}.dep-option.selected{background:rgba(101,216,255,.075)}.dep-option .ico{font-size:1rem}.dep-option strong{display:block;font-size:.7rem}.dep-option small{display:block;margin-top:1px;color:var(--muted2);font-size:.57rem}.dep-option .check{color:#8ff4cf;font-weight:900}.dep-option.cycle{opacity:.55;cursor:not-allowed}.dep-option.cycle .check{color:#ff9cac}
    .dep-warning{display:none;padding:8px 10px;border:1px solid rgba(255,112,137,.24);border-radius:10px;background:rgba(255,72,105,.055);color:#ffc0ca;font-size:.65rem;line-height:1.4}.dep-warning.show{display:block}
    .dep-modal-foot{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid rgba(255,255,255,.07)}.dep-modal-foot .hint{margin-right:auto;color:var(--muted2);font-size:.61rem}
    @media(max-width:780px){.dep-logic-summary{grid-template-columns:repeat(2,1fr)}.dep-flow-row{grid-template-columns:1fr}.dep-flow-op,.dep-flow-arrow{display:none}.dep-view-toggle{margin-left:0}.forfeit-editor-card.dep-child{--dep-indent:calc(var(--dep-depth,0) * 12px)}}
  `;
  if (!style.isConnected) document.head.appendChild(style);

  const cards = () => [...list.querySelectorAll('.forfeit-editor-card[data-id]')];
  const cardMap = () => new Map(cards().map(card => [card.dataset.id, card]));
  const nameOf = card => text(card?.querySelector?.('.js-name')?.value) || card?.dataset?.id || 'Forfeit';
  const iconOf = card => text(card?.querySelector?.('.js-icon')?.value) || '🎯';
  const categoryOf = card => text(card?.querySelector?.('.js-category')?.value) || 'Challenge';
  const enabledOf = card => !!card?.querySelector?.('.js-enabled')?.checked;
  const groupIdOf = card => card?.querySelector?.('.js-level')?.value || '';
  const groupNameOf = card => card?.closest('.forfeit-group')?.querySelector('.forfeit-group-title strong')?.textContent?.trim() || 'Group';
  const markDirty = () => document.body.classList.add('dirty');

  function states(byId) {
    const valid = new Set(byId.keys());
    const map = new Map();
    byId.forEach((_, id) => {
      const raw = D.getForfeit(id);
      const reqs = [...new Set((raw.requiresForfeitIds || []).filter(ref => ref !== id && valid.has(ref)))];
      if (reqs.length !== (raw.requiresForfeitIds || []).length) D.setForfeit(id, { requiresMode: raw.requiresMode, requiresForfeitIds: reqs });
      map.set(id, { requiresMode: raw.requiresMode === 'any' ? 'any' : 'all', requiresForfeitIds: reqs });
    });
    return map;
  }

  function reverseMap(stateMap) {
    const reverse = new Map([...stateMap.keys()].map(id => [id, []]));
    stateMap.forEach((state, target) => state.requiresForfeitIds.forEach(source => reverse.get(source)?.push(target)));
    reverse.forEach(values => values.sort());
    return reverse;
  }

  function pathExists(from, target, stateMap, seen = new Set()) {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const next = stateMap.get(from)?.requiresForfeitIds || [];
    return next.some(id => pathExists(id, target, stateMap, seen));
  }

  function cycleNodes(stateMap) {
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    const bad = new Set();
    const visit = id => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        const at = stack.indexOf(id);
        (at >= 0 ? stack.slice(at) : [id]).forEach(x => bad.add(x));
        return;
      }
      visiting.add(id); stack.push(id);
      (stateMap.get(id)?.requiresForfeitIds || []).forEach(visit);
      stack.pop(); visiting.delete(id); visited.add(id);
    };
    stateMap.forEach((_, id) => visit(id));
    return bad;
  }

  function disabledProblem(id, stateMap, byId) {
    const state = stateMap.get(id);
    if (!state?.requiresForfeitIds?.length) return false;
    const enabled = state.requiresForfeitIds.map(ref => enabledOf(byId.get(ref)));
    return state.requiresMode === 'any' ? !enabled.some(Boolean) : enabled.some(v => !v);
  }

  function badgeLabel(id, stateMap, byId) {
    const state = stateMap.get(id);
    const reqs = state?.requiresForfeitIds || [];
    if (!reqs.length) return '';
    const names = reqs.map(ref => nameOf(byId.get(ref)));
    const preview = names.slice(0, 2).join(state.requiresMode === 'any' ? ' / ' : ' + ');
    const more = names.length > 2 ? ` +${names.length - 2}` : '';
    return `🔒 ${state.requiresMode === 'any' ? 'ANY' : 'ALL'} · ${preview}${more}`;
  }

  function ensureToolbar() {
    const tools = $('forfeitEnhancementTools');
    if (!tools || $('dependencyViewToggle')) return;
    const toggle = document.createElement('div');
    toggle.id = 'dependencyViewToggle';
    toggle.className = 'dep-view-toggle';
    toggle.innerHTML = '<button type="button" class="active" data-view="tree">☷ Tree</button><button type="button" data-view="logic">🔗 Logic</button>';
    tools.appendChild(toggle);
    toggle.addEventListener('click', event => {
      const button = event.target.closest('button[data-view]');
      if (!button) return;
      logicMode = button.dataset.view === 'logic';
      toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
      pane.classList.toggle('dep-logic-mode', logicMode);
      if (logicMode) schedule();
    });
    const logic = document.createElement('div');
    logic.id = 'dependencyLogicView';
    list.insertAdjacentElement('beforebegin', logic);
  }

  function decorateCard(card, stateMap, reverse, byId, cycles) {
    card.querySelectorAll(':scope > .dependency-box').forEach(node => node.remove());
    const id = card.dataset.id;
    const state = stateMap.get(id) || { requiresMode: 'all', requiresForfeitIds: [] };
    const dependents = reverse.get(id) || [];
    const problem = cycles.has(id) || disabledProblem(id, stateMap, byId);
    card.classList.toggle('dep-problem', problem);

    const title = card.querySelector('.editor-title-block');
    if (title) {
      let row = title.querySelector('.dep-compact-row');
      if (!row) { row = document.createElement('div'); row.className = 'dep-compact-row'; title.appendChild(row); }
      row.innerHTML = '';
      if (state.requiresForfeitIds.length) {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = `dep-pill${problem ? ' problem' : ''}`;
        badge.textContent = problem ? `⚠ ${badgeLabel(id, stateMap, byId).replace(/^🔒\s*/, '')}` : badgeLabel(id, stateMap, byId);
        badge.title = 'Edit when this forfeit becomes available';
        badge.addEventListener('click', event => { event.stopPropagation(); openAvailability(id); });
        row.appendChild(badge);
      }
      if (dependents.length) {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'dep-pill enables';
        badge.textContent = `🔓 enables ${dependents.length}`;
        badge.title = dependents.map(ref => nameOf(byId.get(ref))).join('\n');
        badge.addEventListener('click', event => { event.stopPropagation(); openDependents(id); });
        row.appendChild(badge);
      }
    }

    const actions = card.querySelector('.editor-head-actions');
    if (actions) {
      let edit = actions.querySelector('.dep-edit-action');
      if (!edit) {
        edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'icon-btn dep-head-btn primary-dep dep-edit-action';
        edit.textContent = '🔒 Available'; edit.title = 'Choose when this forfeit may appear';
        edit.addEventListener('click', event => { event.stopPropagation(); openAvailability(card.dataset.id); });
        actions.insertBefore(edit, actions.firstChild);
      }
      let after = actions.querySelector('.dep-after-action');
      if (!after) {
        after = document.createElement('button');
        after.type = 'button'; after.className = 'icon-btn dep-head-btn dep-after-action';
        after.title = 'Choose which forfeits become available after this result';
        after.addEventListener('click', event => { event.stopPropagation(); openDependents(card.dataset.id); });
        actions.insertBefore(after, edit.nextSibling);
      }
      after.textContent = dependents.length ? `→ ${dependents.length}` : '→ After';
    }
  }

  function orderTree(byId, stateMap, reverse) {
    [...list.querySelectorAll('.forfeit-group-body')].forEach(body => {
      const groupCards = [...body.querySelectorAll(':scope > .forfeit-editor-card[data-id]')];
      const ids = new Set(groupCards.map(card => card.dataset.id));
      const parent = new Map();
      const children = new Map(groupCards.map(card => [card.dataset.id, []]));
      groupCards.forEach(card => {
        const req = (stateMap.get(card.dataset.id)?.requiresForfeitIds || []).find(ref => ids.has(ref));
        if (req) { parent.set(card.dataset.id, req); children.get(req)?.push(card.dataset.id); }
      });
      children.forEach(arr => arr.sort((a, b) => cmp(nameOf(byId.get(a)), nameOf(byId.get(b)))));
      const roots = groupCards.map(card => card.dataset.id).filter(id => !parent.has(id)).sort((a, b) => cmp(nameOf(byId.get(a)), nameOf(byId.get(b))));
      const visited = new Set();
      const ordered = [];
      const walk = (id, depth, trail = new Set()) => {
        if (visited.has(id) || trail.has(id)) return;
        visited.add(id); ordered.push({ id, depth });
        const next = new Set(trail); next.add(id);
        (children.get(id) || []).forEach(child => walk(child, depth + 1, next));
      };
      roots.forEach(id => walk(id, 0));
      groupCards.forEach(card => { if (!visited.has(card.dataset.id)) walk(card.dataset.id, 0); });
      ordered.forEach((entry, index) => {
        const card = byId.get(entry.id); if (!card) return;
        card.style.order = String(index + 1);
        card.style.setProperty('--dep-depth', String(Math.min(entry.depth, 7)));
        card.classList.toggle('dep-child', entry.depth > 0);
        card.classList.toggle('dep-parent', (reverse.get(entry.id) || []).some(ref => ids.has(ref)));
        const badge = card.querySelector('.tree-order-badge');
        if (badge) badge.textContent = String(index + 1).padStart(2, '0');
      });
    });
  }

  function renderLogic(byId, stateMap, reverse, cycles) {
    const logic = $('dependencyLogicView');
    if (!logic) return;
    const locked = [...stateMap.values()].filter(s => s.requiresForfeitIds.length).length;
    const sources = [...reverse.values()].filter(v => v.length).length;
    const problems = [...stateMap.keys()].filter(id => cycles.has(id) || disabledProblem(id, stateMap, byId)).length;
    logic.innerHTML = '';
    const summary = document.createElement('div');
    summary.className = 'dep-logic-summary';
    [['Forfeits', byId.size], ['With prerequisites', locked], ['Enable other entries', sources], ['Logic problems', problems]].forEach(([label, value]) => {
      const node = document.createElement('div'); node.className = 'dep-logic-stat'; node.innerHTML = `<span>${label}</span><strong>${value}</strong>`; summary.appendChild(node);
    });
    logic.appendChild(summary);

    const groups = [...list.querySelectorAll(':scope > .forfeit-group')];
    groups.forEach(group => {
      const groupCards = [...group.querySelectorAll('.forfeit-group-body > .forfeit-editor-card[data-id]')];
      const lockedCards = groupCards.filter(card => (stateMap.get(card.dataset.id)?.requiresForfeitIds || []).length);
      if (!lockedCards.length) return;
      const section = document.createElement('section'); section.className = 'dep-logic-group';
      const head = document.createElement('div'); head.className = 'dep-logic-group-head';
      head.innerHTML = `<span class="icon">${group.querySelector('.forfeit-group-icon')?.textContent || '◆'}</span><strong>${group.querySelector('.forfeit-group-title strong')?.textContent || 'Group'}</strong><span>${lockedCards.length} gated ${lockedCards.length === 1 ? 'entry' : 'entries'}</span>`;
      const flow = document.createElement('div'); flow.className = 'dep-flow-list';
      lockedCards.sort((a, b) => cmp(nameOf(a), nameOf(b))).forEach(card => {
        const id = card.dataset.id, state = stateMap.get(id), problem = cycles.has(id) || disabledProblem(id, stateMap, byId);
        const row = document.createElement('div'); row.className = `dep-flow-row${problem ? ' problem' : ''}`;
        const prereqs = document.createElement('div'); prereqs.className = 'dep-flow-prereqs';
        state.requiresForfeitIds.forEach(ref => {
          const chip = document.createElement('span'); chip.className = 'dep-flow-chip'; chip.textContent = `${iconOf(byId.get(ref))} ${nameOf(byId.get(ref))}`; prereqs.appendChild(chip);
        });
        const op = document.createElement('span'); op.className = 'dep-flow-op'; op.textContent = state.requiresMode === 'any' ? 'ANY' : 'ALL';
        const arrow = document.createElement('span'); arrow.className = 'dep-flow-arrow'; arrow.textContent = '→';
        const target = document.createElement('div'); target.className = 'dep-flow-target'; target.innerHTML = `<span>${iconOf(card)}</span><strong>${nameOf(card)}</strong>`;
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn ghost dep-flow-edit'; edit.textContent = problem ? '⚠ Fix' : 'Edit'; edit.addEventListener('click', () => openAvailability(id));
        row.append(prereqs, op, arrow, target, edit);
        flow.appendChild(row);
      });
      section.append(head, flow); logic.appendChild(section);
    });
    if (!locked) {
      const empty = document.createElement('div'); empty.className = 'dep-logic-empty'; empty.textContent = 'No availability dependencies yet. Use “🔒 Available” on a forfeit to create one.'; logic.appendChild(empty);
    }
  }

  function ensurePicker() {
    if (picker?.isConnected) return picker;
    const backdrop = document.createElement('div');
    backdrop.className = 'dep-modal-backdrop'; backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="dep-modal" role="dialog" aria-modal="true" aria-labelledby="depModalTitle">
        <div class="dep-modal-head"><span class="target-icon">🔒</span><div><strong id="depModalTitle">Availability</strong><small id="depModalSub"></small></div><button type="button" class="icon-btn dep-modal-close">×</button></div>
        <div class="dep-modal-body">
          <div class="dep-mode-tabs"><button type="button" data-mode="always">● With group</button><button type="button" data-mode="any">ANY result</button><button type="button" data-mode="all">ALL results</button></div>
          <div class="dep-warning"></div>
          <div class="dep-selected"></div>
          <label class="field dep-search">Search forfeits<input type="search" placeholder="Type a name, group, category or ID…" autocomplete="off"></label>
          <div class="dep-picker-groups"></div>
        </div>
        <div class="dep-modal-foot"><span class="hint">Changes are added to the editor draft; press Apply changes when finished.</span><button type="button" class="btn ghost dep-cancel">Cancel</button><button type="button" class="btn primary dep-apply">Apply</button></div>
      </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.dep-modal-close').addEventListener('click', closePicker);
    backdrop.querySelector('.dep-cancel').addEventListener('click', closePicker);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closePicker(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) closePicker(); });
    picker = backdrop;
    return picker;
  }

  function closePicker() { if (picker) picker.hidden = true; }

  function pickerData() {
    const byId = cardMap(); return { byId, stateMap: states(byId), reverse: null };
  }

  function groupedCandidates(byId, excludeId, search, preferredGroup) {
    const q = text(search).toLowerCase();
    const groups = new Map();
    byId.forEach((card, id) => {
      if (id === excludeId) return;
      const hay = `${id} ${nameOf(card)} ${categoryOf(card)} ${groupNameOf(card)}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const gid = groupIdOf(card), label = groupNameOf(card);
      if (!groups.has(gid)) groups.set(gid, { id: gid, label, cards: [] });
      groups.get(gid).cards.push(card);
    });
    return [...groups.values()].sort((a, b) => {
      if (a.id === preferredGroup && b.id !== preferredGroup) return -1;
      if (b.id === preferredGroup && a.id !== preferredGroup) return 1;
      return cmp(a.label, b.label);
    }).map(group => ({ ...group, cards: group.cards.sort((a, b) => cmp(nameOf(a), nameOf(b))) }));
  }

  function openAvailability(targetId) {
    const modal = ensurePicker();
    const { byId, stateMap } = pickerData();
    const targetCard = byId.get(targetId); if (!targetCard) return;
    const initial = stateMap.get(targetId) || { requiresMode: 'all', requiresForfeitIds: [] };
    const draft = { type: 'availability', targetId, mode: initial.requiresForfeitIds.length ? initial.requiresMode : 'always', selected: new Set(initial.requiresForfeitIds), search: '' };
    modal._draft = draft; modal.hidden = false;
    modal.querySelector('.target-icon').textContent = iconOf(targetCard);
    modal.querySelector('#depModalTitle').textContent = `Availability · ${nameOf(targetCard)}`;
    modal.querySelector('#depModalSub').textContent = `${groupNameOf(targetCard)} · choose when this entry may appear on the wheel`;
    modal.querySelector('.dep-mode-tabs').hidden = false;
    const input = modal.querySelector('.dep-search input'); input.value = ''; input.oninput = () => { draft.search = input.value; renderAvailabilityPicker(); };
    modal.querySelectorAll('.dep-mode-tabs button').forEach(button => {
      button.onclick = () => { draft.mode = button.dataset.mode; if (draft.mode === 'always') draft.selected.clear(); renderAvailabilityPicker(); };
    });
    modal.querySelector('.dep-apply').onclick = () => {
      if (modal.querySelector('.dep-apply').disabled) return;
      D.setForfeit(targetId, { requiresMode: draft.mode === 'any' ? 'any' : 'all', requiresForfeitIds: draft.mode === 'always' ? [] : [...draft.selected] });
      markDirty(); closePicker(); schedule();
    };
    renderAvailabilityPicker(); setTimeout(() => input.focus(), 30);
  }

  function renderAvailabilityPicker() {
    const modal = ensurePicker(), draft = modal._draft; if (!draft || draft.type !== 'availability') return;
    const { byId, stateMap } = pickerData();
    const targetCard = byId.get(draft.targetId); if (!targetCard) return;
    modal.querySelectorAll('.dep-mode-tabs button').forEach(button => button.classList.toggle('active', button.dataset.mode === draft.mode));
    const selectedWrap = modal.querySelector('.dep-selected'); selectedWrap.innerHTML = '';
    if (draft.mode === 'always') {
      const chip = document.createElement('span'); chip.className = 'dep-selected-chip'; chip.textContent = '● Available whenever its group is active'; selectedWrap.appendChild(chip);
    } else if (!draft.selected.size) {
      const chip = document.createElement('span'); chip.className = 'dep-selected-chip'; chip.textContent = 'Choose at least one prerequisite below'; selectedWrap.appendChild(chip);
    } else {
      [...draft.selected].forEach(id => {
        const chip = document.createElement('span'); chip.className = 'dep-selected-chip'; chip.innerHTML = `<span>${iconOf(byId.get(id))}</span><span>${nameOf(byId.get(id))}</span><button type="button" title="Remove">×</button>`;
        chip.querySelector('button').onclick = () => { draft.selected.delete(id); renderAvailabilityPicker(); };
        selectedWrap.appendChild(chip);
      });
    }

    const testMap = new Map([...stateMap].map(([id, value]) => [id, { requiresMode: value.requiresMode, requiresForfeitIds: [...value.requiresForfeitIds] }]));
    testMap.set(draft.targetId, { requiresMode: draft.mode === 'any' ? 'any' : 'all', requiresForfeitIds: draft.mode === 'always' ? [] : [...draft.selected] });
    const cycles = cycleNodes(testMap);
    const warning = modal.querySelector('.dep-warning');
    warning.classList.toggle('show', cycles.has(draft.targetId));
    warning.textContent = cycles.has(draft.targetId) ? '⚠ This selection creates a circular dependency. The wheel could never satisfy it. Remove one of the circular prerequisites.' : '';
    modal.querySelector('.dep-apply').disabled = cycles.has(draft.targetId) || (draft.mode !== 'always' && !draft.selected.size);

    const groupsWrap = modal.querySelector('.dep-picker-groups'); groupsWrap.innerHTML = '';
    if (draft.mode === 'always') {
      groupsWrap.innerHTML = '<div class="dep-logic-empty">No prerequisite is needed in this mode.</div>';
      return;
    }
    const groups = groupedCandidates(byId, draft.targetId, draft.search, groupIdOf(targetCard));
    groups.forEach(group => {
      const section = document.createElement('section'); section.className = 'dep-picker-group';
      const title = document.createElement('div'); title.className = 'dep-picker-group-title'; title.textContent = `${group.id === groupIdOf(targetCard) ? '★ ' : ''}${group.label}`;
      const options = document.createElement('div'); options.className = 'dep-picker-options';
      group.cards.forEach(card => {
        const id = card.dataset.id, selected = draft.selected.has(id);
        const trial = new Map([...testMap].map(([key, value]) => [key, { requiresMode: value.requiresMode, requiresForfeitIds: [...value.requiresForfeitIds] }]));
        const reqs = new Set(trial.get(draft.targetId)?.requiresForfeitIds || []); reqs.add(id); trial.set(draft.targetId, { requiresMode: draft.mode, requiresForfeitIds: [...reqs] });
        const cycle = !selected && cycleNodes(trial).has(draft.targetId);
        const button = document.createElement('button'); button.type = 'button'; button.className = `dep-option${selected ? ' selected' : ''}${cycle ? ' cycle' : ''}`;
        button.innerHTML = `<span class="ico">${iconOf(card)}</span><span><strong>${nameOf(card)}</strong><small>${categoryOf(card)} · ${card.dataset.id}</small></span><span class="check">${cycle ? 'cycle' : selected ? '✓' : '+'}</span>`;
        if (!cycle) button.onclick = () => { selected ? draft.selected.delete(id) : draft.selected.add(id); renderAvailabilityPicker(); };
        options.appendChild(button);
      });
      section.append(title, options); groupsWrap.appendChild(section);
    });
    if (!groups.length) groupsWrap.innerHTML = '<div class="dep-logic-empty">No forfeits match your search.</div>';
  }

  function openDependents(sourceId) {
    const modal = ensurePicker();
    const { byId, stateMap } = pickerData();
    const source = byId.get(sourceId); if (!source) return;
    const reverse = reverseMap(stateMap);
    const draft = { type: 'dependents', sourceId, selected: new Set(reverse.get(sourceId) || []), original: new Set(reverse.get(sourceId) || []), search: '' };
    modal._draft = draft; modal.hidden = false;
    modal.querySelector('.target-icon').textContent = iconOf(source);
    modal.querySelector('#depModalTitle').textContent = `After this · ${nameOf(source)}`;
    modal.querySelector('#depModalSub').textContent = 'Choose which forfeits should become available after this result has happened.';
    modal.querySelector('.dep-mode-tabs').hidden = true;
    const input = modal.querySelector('.dep-search input'); input.value = ''; input.oninput = () => { draft.search = input.value; renderDependentsPicker(); };
    modal.querySelector('.dep-apply').onclick = () => {
      if (modal.querySelector('.dep-apply').disabled) return;
      byId.forEach((_, targetId) => {
        if (targetId === sourceId) return;
        const state = D.getForfeit(targetId); const reqs = new Set(state.requiresForfeitIds || []);
        if (draft.selected.has(targetId)) reqs.add(sourceId); else reqs.delete(sourceId);
        D.setForfeit(targetId, { requiresMode: state.requiresMode || 'all', requiresForfeitIds: [...reqs] });
      });
      markDirty(); closePicker(); schedule();
    };
    renderDependentsPicker(); setTimeout(() => input.focus(), 30);
  }

  function renderDependentsPicker() {
    const modal = ensurePicker(), draft = modal._draft; if (!draft || draft.type !== 'dependents') return;
    const { byId, stateMap } = pickerData(); const source = byId.get(draft.sourceId); if (!source) return;
    const selectedWrap = modal.querySelector('.dep-selected'); selectedWrap.innerHTML = '';
    if (!draft.selected.size) {
      const chip = document.createElement('span'); chip.className = 'dep-selected-chip'; chip.textContent = 'Nothing is currently enabled by this result'; selectedWrap.appendChild(chip);
    } else [...draft.selected].forEach(id => {
      const chip = document.createElement('span'); chip.className = 'dep-selected-chip'; chip.innerHTML = `<span>${iconOf(byId.get(id))}</span><span>${nameOf(byId.get(id))}</span><button type="button">×</button>`;
      chip.querySelector('button').onclick = () => { draft.selected.delete(id); renderDependentsPicker(); }; selectedWrap.appendChild(chip);
    });

    let hasCycle = false;
    const warning = modal.querySelector('.dep-warning');
    const groupsWrap = modal.querySelector('.dep-picker-groups'); groupsWrap.innerHTML = '';
    const groups = groupedCandidates(byId, draft.sourceId, draft.search, groupIdOf(source));
    groups.forEach(group => {
      const section = document.createElement('section'); section.className = 'dep-picker-group';
      const title = document.createElement('div'); title.className = 'dep-picker-group-title'; title.textContent = `${group.id === groupIdOf(source) ? '★ ' : ''}${group.label}`;
      const options = document.createElement('div'); options.className = 'dep-picker-options';
      group.cards.forEach(card => {
        const targetId = card.dataset.id, selected = draft.selected.has(targetId);
        const cycle = !selected && pathExists(draft.sourceId, targetId, stateMap);
        if (selected && pathExists(draft.sourceId, targetId, stateMap) && !(stateMap.get(targetId)?.requiresForfeitIds || []).includes(draft.sourceId)) hasCycle = true;
        const button = document.createElement('button'); button.type = 'button'; button.className = `dep-option${selected ? ' selected' : ''}${cycle ? ' cycle' : ''}`;
        button.innerHTML = `<span class="ico">${iconOf(card)}</span><span><strong>${nameOf(card)}</strong><small>${categoryOf(card)} · ${groupNameOf(card)}</small></span><span class="check">${cycle ? 'cycle' : selected ? '✓' : '+'}</span>`;
        if (!cycle) button.onclick = () => { selected ? draft.selected.delete(targetId) : draft.selected.add(targetId); renderDependentsPicker(); };
        options.appendChild(button);
      });
      section.append(title, options); groupsWrap.appendChild(section);
    });
    warning.classList.toggle('show', hasCycle); warning.textContent = hasCycle ? '⚠ One of these selections would create a circular dependency.' : '';
    modal.querySelector('.dep-apply').disabled = hasCycle;
    if (!groups.length) groupsWrap.innerHTML = '<div class="dep-logic-empty">No forfeits match your search.</div>';
  }

  function run() {
    scheduled = false; suppressUntil = performance.now() + 100;
    ensureToolbar();
    const byId = cardMap(); if (!byId.size) return;
    const stateMap = states(byId), reverse = reverseMap(stateMap), cycles = cycleNodes(stateMap);
    byId.forEach(card => decorateCard(card, stateMap, reverse, byId, cycles));
    orderTree(byId, stateMap, reverse);
    renderLogic(byId, stateMap, reverse, cycles);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  new MutationObserver(() => { if (performance.now() >= suppressUntil) schedule(); }).observe(list, { childList: true, subtree: true });
  document.addEventListener('input', event => { if (event.target.matches('.js-name,.js-icon,.js-category')) schedule(); });
  document.addEventListener('change', event => { if (event.target.matches('.js-level,.js-enabled,.js-name')) schedule(); });
  $('applyBtn')?.addEventListener('click', () => setTimeout(schedule, 70));
  $('editorFileInput')?.addEventListener('change', () => setTimeout(schedule, 180));

  schedule();
})();
