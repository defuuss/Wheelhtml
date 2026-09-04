(() => {
  'use strict';

  const M = window.FortuneModel;
  const D = window.FortuneDependencyState;
  const S = window.FortuneSpinStyle;
  if (!M || !D || window.__fortuneAiDependencyV4) return;
  window.__fortuneAiDependencyV4 = true;

  let installed = false;
  let busy = false;
  let history = [];
  let undo = null;
  let timer = null;
  let started = 0;
  const $ = id => document.getElementById(id);
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));
  const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
  const slug = s => String(s || 'item').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';

  const token = () => $('aiToken')?.value.trim() || '';
  const model = () => $('aiModel')?.value || '';
  const provider = () => $('aiProvider')?.value || 'custom';
  const endpoint = () => $('aiEndpoint')?.value.trim().replace(/\/+$/, '') || '';

  function chatUrl() {
    const raw = endpoint();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      let path = url.pathname.replace(/\/+$/, '');
      if (/\/chat\/completions$/i.test(path)) return url.toString();
      path = path.replace(/\/models$/i, '');
      url.pathname = `${path}/chat/completions`.replace(/\/+/g, '/');
      return url.toString();
    } catch (_) { return raw; }
  }

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (token()) h.Authorization = `Bearer ${token()}`;
    if (provider() === 'openrouter') {
      h['HTTP-Referer'] = location.origin + location.pathname;
      h['X-Title'] = 'Fortune Engine AI Editor';
    }
    return h;
  }

  function status(text, type = '') {
    const node = $('aiStatus');
    if (!node) return;
    node.textContent = text;
    node.className = `ai-status ${type}`.trim();
  }

  function addMessage(role, text, meta = '') {
    const box = $('chatMessages');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = `ai-chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';
    const copy = document.createElement('div');
    copy.className = 'ai-chat-copy';
    copy.textContent = text;
    bubble.appendChild(copy);
    if (meta) {
      const m = document.createElement('div');
      m.className = 'ai-chat-meta';
      m.textContent = meta;
      bubble.appendChild(m);
    }
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  function start(row) {
    busy = true;
    started = performance.now();
    ['sendAiBtn', 'testAiBtn', 'loadModelsBtn'].forEach(id => { const e = $(id); if (e) e.disabled = true; });
    if ($('chatInput')) $('chatInput').disabled = true;
    const tick = () => {
      const sec = Math.floor((performance.now() - started) / 1000);
      if ($('sendAiBtn')) $('sendAiBtn').textContent = `⏳ Working… ${sec}s`;
      status(`AI is building real wheel changes… ${sec}s`, 'working');
      const meta = row?.querySelector('.ai-chat-meta');
      if (meta) meta.textContent = `${sec}s elapsed`;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function stop() {
    busy = false;
    clearInterval(timer);
    timer = null;
    if ($('sendAiBtn')) { $('sendAiBtn').disabled = false; $('sendAiBtn').textContent = 'Send'; }
    if ($('testAiBtn')) $('testAiBtn').disabled = false;
    if ($('loadModelsBtn')) $('loadModelsBtn').disabled = false;
    if ($('chatInput')) $('chatInput').disabled = false;
  }

  function compactContext() {
    const c = M.loadConfig();
    return {
      groups: c.levels.map(g => ({ id: g.id, name: g.name, activeAtStart: g.activeAtStart })),
      forfeits: c.forfeits.map(f => ({
        id: f.id, name: f.name, levelId: f.levelId, category: f.category, weight: f.weight,
        lifetime: f.lifetime, mystery: f.mystery, enabled: f.enabled,
        requiresMode: f.requiresMode || 'all', requiresForfeitIds: f.requiresForfeitIds || [],
        unlockLevels: f.unlockLevels || []
      })),
      rules: (c.rules || []).map(r => ({
        id: r.id, name: r.name, mode: r.mode, minOccurrences: r.minOccurrences || 1,
        conditionForfeitIds: r.conditionForfeitIds || [], unlockLevels: r.unlockLevels || [], enabled: r.enabled
      }))
    };
  }

  function systemPrompt() {
    return `You are editing Fortune Engine. CURRENT CONFIG: ${JSON.stringify(compactContext())}\n\nIMPORTANT MODEL:\n- GROUPS are broad game states only (examples: Humiliation, Disgusting, Cleaning). Do NOT create a group just to enforce an order between individual forfeits.\n- FORFEIT DEPENDENCIES enforce order between individual wheel entries. A forfeit with requiresForfeitIds is absent from the wheel until its prerequisite result(s) have occurred. requiresMode is all or any.\n- To make a parent disappear after it is selected, set its lifetime to {"type":"once","spins":1}.\n- Example: Socks after Shoes = update/add Socks with requiresForfeitIds:["shoes-id"], requiresMode:"all". Shoes can be lifetime once. No Socks group is needed.\n- GROUP UNLOCK RULES are for broad states. minOccurrences allows count thresholds, e.g. Skip Turn 3 times -> unlock Humiliation.\n\nReturn ONLY strict JSON: {"reply":"short answer","actions":[]}. For ANY edit request, actions MUST contain executable changes; never claim a change if actions is empty.\nActions: add_forfeit {item}, update_forfeit {id,changes}, remove_forfeit {id}, add_group {group}, update_group {id,changes}, remove_group {id}, add_rule {rule}, update_rule {id,changes}, remove_rule {id}, update_settings {changes}, update_spin_style {changes}.\nForfeit fields include id,name,icon,color,weight,levelId,category,description,animation,lifetime,cooldown,eventType,mystery,enabled,unlockLevels,requiresMode,requiresForfeitIds.\nRule fields include id,name,mode,minOccurrences,conditionForfeitIds,unlockLevels,enabled.\nUse exact existing IDs when referencing existing things. Preserve unrelated configuration. Use the user's requested language for player-facing text. No markdown or prose outside JSON.`;
  }

  function editIntent(text) {
    return /\b(add|create|insert|remove|delete|rename|change|modify|update|make|set|move|enable|disable|attach|depend|require|unlock|hinzuf|ergänz|lösch|entfern|änder|umbenenn|verschieb|abhäng|freischalt|ajout|cré|supprim|modifi|renomm|déplac|dépend|déverrou)\w*/i.test(text);
  }

  function parseJson(text) {
    let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
    return JSON.parse(raw);
  }

  async function request(messages, maxTokens = 2600, timeoutMs = 300000) {
    if (!token()) throw new Error('Enter the API token first.');
    if (!model()) throw new Error('Choose a model first.');
    const url = chatUrl();
    if (!/^https:\/\//i.test(url)) throw new Error('Invalid chat endpoint.');
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: headers(), signal: ac.signal,
        body: JSON.stringify({ model: model(), messages, temperature: 0, max_tokens: maxTokens })
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error(`Provider returned non-JSON HTTP data (${response.status}).`); }
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) return content;
      if (Array.isArray(content)) return content.map(x => x?.text || x?.content || '').join('');
      throw new Error('Provider returned no readable answer.');
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      throw e;
    } finally { clearTimeout(timeout); }
  }

  async function structured(text) {
    const messages = [{ role: 'system', content: systemPrompt() }, ...history.slice(-4), { role: 'user', content: text }];
    let raw = await request(messages);
    let answer;
    try { answer = parseJson(raw); }
    catch (_) {
      raw = await request([
        { role: 'system', content: 'Repair the following into one strict valid JSON object with reply and actions. Preserve all requested actions. No markdown.' },
        { role: 'user', content: raw.slice(0, 14000) }
      ], 2200, 180000);
      answer = parseJson(raw);
    }

    if (editIntent(text) && (!Array.isArray(answer.actions) || !answer.actions.length)) {
      const retry = await request([
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: text },
        { role: 'assistant', content: JSON.stringify(answer) },
        { role: 'user', content: 'This is an EDIT. You described changes but returned no executable actions. Return strict JSON again with the concrete patch actions. For sequencing individual forfeits use requiresForfeitIds, NOT new groups.' }
      ], 2400, 180000);
      answer = parseJson(retry);
      if (!Array.isArray(answer.actions) || !answer.actions.length) throw new Error('The model described an edit but still returned no executable actions.');
    }
    return answer;
  }

  function resolveGroup(c, ref) {
    const v = String(ref || '').trim().toLowerCase();
    return c.levels.find(g => g.id.toLowerCase() === v) || c.levels.find(g => g.name.toLowerCase() === v);
  }
  function resolveForfeit(c, ref) {
    const v = String(ref || '').trim().toLowerCase();
    return c.forfeits.find(f => f.id.toLowerCase() === v) || c.forfeits.find(f => f.name.toLowerCase() === v);
  }
  function resolveRule(c, ref) {
    const v = String(ref || '').trim().toLowerCase();
    return (c.rules || []).find(r => r.id.toLowerCase() === v) || (c.rules || []).find(r => r.name.toLowerCase() === v);
  }
  function uniqueId(base, used) { let id = slug(base), n = 2; while (used.has(id)) id = `${slug(base)}-${n++}`; used.add(id); return id; }
  function refForfeits(c, refs, own = '') { return [...new Set((Array.isArray(refs) ? refs : []).map(v => resolveForfeit(c, v)?.id).filter(id => id && id !== own))]; }
  function refGroups(c, refs) { return [...new Set((Array.isArray(refs) ? refs : []).map(v => resolveGroup(c, v)?.id).filter(Boolean))]; }

  function apply(actions) {
    const before = M.loadConfig();
    const beforeSpin = S?.load?.() || {};
    const c = clone(before);
    c.rules = c.rules || [];
    const usedF = new Set(c.forfeits.map(x => x.id));
    const usedG = new Set(c.levels.map(x => x.id));
    const usedR = new Set(c.rules.map(x => x.id));
    let count = 0;

    for (const action of Array.isArray(actions) ? actions : []) {
      if (!action || typeof action !== 'object') continue;
      if (action.type === 'add_group') {
        const x = action.group || {};
        c.levels.push({ id: uniqueId(x.id || x.name || 'group', usedG), name: String(x.name || 'New Group').slice(0, 60), icon: String(x.icon || '◆').slice(0, 12), color: /^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : '#65d8ff', activeAtStart: !!x.activeAtStart });
        count++;
      } else if (action.type === 'update_group') {
        const x = resolveGroup(c, action.id); if (!x) throw new Error(`Unknown group ${action.id}`); Object.assign(x, action.changes || {}); count++;
      } else if (action.type === 'remove_group') {
        const x = resolveGroup(c, action.id); if (!x) throw new Error(`Unknown group ${action.id}`); if (c.forfeits.some(f => f.levelId === x.id)) throw new Error(`Group ${x.name} still contains forfeits.`); c.levels = c.levels.filter(g => g.id !== x.id); count++;
      } else if (action.type === 'add_forfeit') {
        const x = action.item || {};
        const group = resolveGroup(c, x.levelId) || c.levels[0];
        const item = {
          id: uniqueId(x.id || x.name || 'forfeit', usedF), name: String(x.name || 'New Forfeit').slice(0, 80), icon: String(x.icon || '🎯').slice(0, 12),
          color: /^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : '#65d8ff', weight: clamp(x.weight, .1, 100, 1), levelId: group.id,
          category: String(x.category || 'General').slice(0, 40), description: String(x.description || '').slice(0, 700),
          animation: ['zoom','shake','pulse','flash','confetti'].includes(x.animation) ? x.animation : 'pulse',
          lifetime: x.lifetime && ['forever','once','spins'].includes(x.lifetime.type) ? { type: x.lifetime.type, spins: Math.round(clamp(x.lifetime.spins, 1, 999, 3)) } : { type: 'forever', spins: 3 },
          cooldown: Math.round(clamp(x.cooldown, 0, 99, 0)), eventType: ['normal','spinAgain','unlock','doubleSpin','immunity','randomize'].includes(x.eventType) ? x.eventType : 'normal',
          mystery: !!x.mystery, enabled: x.enabled !== false, unlockLevels: refGroups(c, x.unlockLevels), requiresMode: x.requiresMode === 'any' ? 'any' : 'all', requiresForfeitIds: []
        };
        c.forfeits.push(item);
        item.requiresForfeitIds = refForfeits(c, x.requiresForfeitIds, item.id);
        count++;
      } else if (action.type === 'update_forfeit') {
        const item = resolveForfeit(c, action.id); if (!item) throw new Error(`Unknown forfeit ${action.id}`);
        const z = clone(action.changes || {});
        if (z.levelId != null) { const g = resolveGroup(c, z.levelId); if (!g) throw new Error(`Unknown group ${z.levelId}`); z.levelId = g.id; }
        if (z.unlockLevels != null) z.unlockLevels = refGroups(c, z.unlockLevels);
        if (z.requiresForfeitIds != null) z.requiresForfeitIds = refForfeits(c, z.requiresForfeitIds, item.id);
        if (z.requiresMode != null) z.requiresMode = z.requiresMode === 'any' ? 'any' : 'all';
        if (z.lifetime && typeof z.lifetime === 'object') z.lifetime = { type: ['forever','once','spins'].includes(z.lifetime.type) ? z.lifetime.type : item.lifetime.type, spins: Math.round(clamp(z.lifetime.spins, 1, 999, item.lifetime.spins || 3)) };
        Object.assign(item, z);
        D.setForfeit(item.id, { requiresMode: item.requiresMode || 'all', requiresForfeitIds: item.requiresForfeitIds || [] });
        count++;
      } else if (action.type === 'remove_forfeit') {
        const item = resolveForfeit(c, action.id); if (!item) throw new Error(`Unknown forfeit ${action.id}`);
        c.forfeits = c.forfeits.filter(f => f.id !== item.id);
        c.forfeits.forEach(f => { f.requiresForfeitIds = (f.requiresForfeitIds || []).filter(id => id !== item.id); D.setForfeit(f.id, f); });
        c.rules.forEach(r => { r.conditionForfeitIds = (r.conditionForfeitIds || []).filter(id => id !== item.id); });
        count++;
      } else if (action.type === 'add_rule') {
        const x = action.rule || {};
        const rule = { id: uniqueId(x.id || x.name || 'rule', usedR), name: String(x.name || 'New Rule').slice(0, 80), mode: x.mode === 'any' ? 'any' : 'all', minOccurrences: Math.round(clamp(x.minOccurrences, 1, 99, 1)), conditionForfeitIds: refForfeits(c, x.conditionForfeitIds), unlockLevels: refGroups(c, x.unlockLevels), enabled: x.enabled !== false };
        c.rules.push(rule); D.setRuleCount(rule.id, rule.minOccurrences); count++;
      } else if (action.type === 'update_rule') {
        const rule = resolveRule(c, action.id); if (!rule) throw new Error(`Unknown rule ${action.id}`);
        const z = clone(action.changes || {});
        if (z.conditionForfeitIds != null) z.conditionForfeitIds = refForfeits(c, z.conditionForfeitIds);
        if (z.unlockLevels != null) z.unlockLevels = refGroups(c, z.unlockLevels);
        if (z.minOccurrences != null) { z.minOccurrences = Math.round(clamp(z.minOccurrences, 1, 99, 1)); D.setRuleCount(rule.id, z.minOccurrences); }
        Object.assign(rule, z); count++;
      } else if (action.type === 'remove_rule') {
        const rule = resolveRule(c, action.id); if (!rule) throw new Error(`Unknown rule ${action.id}`); c.rules = c.rules.filter(r => r.id !== rule.id); count++;
      } else if (action.type === 'update_settings') {
        c.settings = { ...c.settings, ...(action.changes || {}) }; count++;
      } else if (action.type === 'update_spin_style') {
        S?.save?.({ ...beforeSpin, ...(action.changes || {}) }); count++;
      }
    }

    c.forfeits.forEach(item => D.setForfeit(item.id, { requiresMode: item.requiresMode || 'all', requiresForfeitIds: item.requiresForfeitIds || [] }));
    c.rules.forEach(rule => D.setRuleCount(rule.id, rule.minOccurrences || 1));
    if (!c.levels.some(g => g.activeAtStart) && c.levels[0]) c.levels[0].activeAtStart = true;

    if (count) {
      undo = { config: before, spin: beforeSpin };
      const saved = M.saveConfig(c);
      M.resetSession(saved);
      if ($('undoAiBtn')) $('undoAiBtn').disabled = false;
    }
    return count;
  }

  async function send(forced = '') {
    if (busy) return;
    const input = $('chatInput');
    const text = String(forced || input?.value || '').trim();
    if (!text) return;
    if (!model()) { status('Choose a model first.', 'error'); return; }
    if (!token()) { status('Enter the API token first.', 'error'); return; }
    if (input) input.value = '';
    addMessage('user', text);
    const pending = addMessage('system', '⏳ AI is working on the wheel…', 'Preparing');
    start(pending);
    try {
      const answer = await structured(text);
      const changed = apply(answer.actions || []);
      if (editIntent(text) && !changed) throw new Error('The AI returned no executable wheel changes. Nothing was saved.');
      pending?.remove();
      const reply = String(answer.reply || (changed ? 'Done.' : 'No changes needed.'));
      addMessage('assistant', reply, changed ? `✓ Applied ${changed} wheel change${changed === 1 ? '' : 's'}` : 'No wheel changes');
      history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
      history = history.slice(-6);
      status(changed ? `Applied ${changed} wheel change${changed === 1 ? '' : 's'}.` : 'Ready.', 'ok');
    } catch (e) {
      pending?.remove();
      addMessage('assistant', `I could not complete that request: ${e.message}`, 'Not applied');
      status(`Request failed: ${e.message}`, 'error');
    } finally { stop(); input?.focus(); }
  }

  function install() {
    if (!document.getElementById('sendAiBtn') || installed) return;
    installed = true;
    const replace = (id, handler) => {
      const old = $(id); if (!old) return null;
      const next = old.cloneNode(true); old.replaceWith(next); next.addEventListener('click', handler); return next;
    };
    replace('sendAiBtn', () => send());
    const input = $('chatInput');
    if (input) {
      const next = input.cloneNode(true); next.value = input.value; input.replaceWith(next);
      next.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    }
    replace('undoAiBtn', () => {
      if (!undo) return;
      D.replace(undo.config);
      const saved = M.saveConfig(undo.config); M.resetSession(saved); S?.save?.(undo.spin); undo = null;
      if ($('undoAiBtn')) $('undoAiBtn').disabled = true;
      addMessage('system', 'Last AI edit undone.');
      status('Last AI edit undone.', 'ok');
    });
    replace('clearChatBtn', () => { history = []; if ($('chatMessages')) $('chatMessages').innerHTML = ''; addMessage('system', 'Chat cleared.'); });
    document.querySelectorAll('[data-ai-command]').forEach(old => {
      const next = old.cloneNode(true); old.replaceWith(next); next.addEventListener('click', () => send(next.dataset.aiCommand || ''));
    });
    addMessage('system', 'Dependency-aware AI active: individual ordering uses forfeit dependencies; groups remain broad game states.');
  }

  function armAfterLegacyLoader() {
    const check = () => {
      const legacy = [...document.scripts].find(s => /ai-chat-fix-v3\.js/.test(s.src));
      if (legacy) {
        legacy.addEventListener('load', () => setTimeout(install, 0), { once: true });
        setTimeout(install, 1200);
        return true;
      }
      return false;
    };
    if (check()) return;
    const obs = new MutationObserver(() => { if (check()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); install(); }, 4000);
  }

  armAfterLegacyLoader();
})();
