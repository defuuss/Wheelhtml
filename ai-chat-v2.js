(() => {
  'use strict';

  const M = window.FortuneModel;
  const S = window.FortuneSpinStyle;
  if (!M) return;

  const $ = id => document.getElementById(id);
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));
  const state = { models: [], messages: [], pending: false, lastUndo: null };

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const slug = value => String(value || 'item')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';

  function uniqueId(base, used) {
    let id = slug(base), n = 2;
    while (used.has(id)) id = `${slug(base)}-${n++}`;
    used.add(id);
    return id;
  }

  function setStatus(text, type = '') {
    const node = $('aiStatus');
    if (!node) return;
    node.textContent = text;
    node.className = `ai-status ${type}`.trim();
  }

  function toast(text) {
    const node = $('aiToast');
    if (!node) return;
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function providerHeaders(includeJson = false) {
    const token = $('aiToken')?.value.trim() || '';
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if ($('aiProvider')?.value === 'openrouter') {
      headers['HTTP-Referer'] = location.origin + location.pathname;
      headers['X-Title'] = 'Fortune Engine AI Chat';
    }
    return headers;
  }

  function rawEndpoint() {
    return $('aiEndpoint')?.value.trim() || '';
  }

  function resolvedChatEndpoint() {
    const raw = rawEndpoint().replace(/\/+$/, '');
    if (!raw) return raw;
    try {
      const url = new URL(raw);
      const path = url.pathname.replace(/\/+$/, '');
      if (/\/chat\/completions$/i.test(path)) return url.toString();
      if (/\/(?:api\/)?v\d+(?:\.\d+)?$/i.test(path)) {
        url.pathname = `${path}/chat/completions`;
        return url.toString();
      }
      return url.toString();
    } catch (_) {
      return raw;
    }
  }

  function modelsEndpoint() {
    if ($('aiProvider')?.value === 'openrouter') return 'https://openrouter.ai/api/v1/models';
    const raw = rawEndpoint().replace(/\/+$/, '');
    if (!raw) return raw;
    try {
      const url = new URL(raw);
      let path = url.pathname.replace(/\/+$/, '');
      path = path.replace(/\/chat\/completions$/i, '').replace(/\/responses$/i, '');
      if (/\/(?:api\/)?v\d+(?:\.\d+)?$/i.test(path)) url.pathname = `${path}/models`;
      else if (/\/models$/i.test(path)) url.pathname = path;
      else url.pathname = `${path}/models`;
      return url.toString();
    } catch (_) {
      return raw + '/models';
    }
  }

  function selectedModel() {
    return $('aiModel')?.value.trim() || '';
  }

  function modelLabel(model) {
    const name = model.name || model.id || 'Unnamed model';
    const id = model.id || '';
    const ctx = Number(model.context_length || model.context_window || 0);
    const ctxText = ctx ? `${Math.round(ctx / 1000)}k ctx` : '';
    let price = '';
    const prompt = Number(model.pricing?.prompt);
    if (Number.isFinite(prompt) && prompt >= 0) {
      const perM = prompt * 1_000_000;
      price = `$${perM.toFixed(perM < 1 ? 3 : 2)}/M in`;
    }
    return [name, id && id !== name ? id : '', ctxText, price].filter(Boolean).join(' · ');
  }

  function isChatTextModel(model) {
    const outputs = model.architecture?.output_modalities || model.output_modalities;
    if (Array.isArray(outputs) && outputs.length && !outputs.includes('text')) return false;
    const id = String(model.id || '').toLowerCase();
    if (/embedding|rerank|tts|speech|transcri/.test(id)) return false;
    return !!model.id;
  }

  function renderModels(query = '') {
    const select = $('aiModel');
    if (!select) return;
    const previous = select.value;
    const q = String(query || '').trim().toLowerCase();
    const list = state.models.filter(m => !q || `${m.id} ${m.name || ''} ${m.description || ''}`.toLowerCase().includes(q));
    select.innerHTML = '';
    if (!list.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = state.models.length ? 'No models match the search' : 'Load models first';
      select.appendChild(option);
      return;
    }
    list.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = modelLabel(model);
      select.appendChild(option);
    });
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
  }

  async function fetchJson(url, init = {}) {
    try {
      const response = await fetch(url, init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
      return { response, data };
    } catch (error) {
      if (error instanceof TypeError || /NetworkError|Failed to fetch/i.test(String(error?.message))) {
        throw new Error(`Browser could not reach ${url}. Check the endpoint and its CORS policy.`);
      }
      throw error;
    }
  }

  async function loadModels() {
    const button = $('loadModelsBtn');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Loading…';
    setStatus('Loading available models…', 'working');
    try {
      const { data } = await fetchJson(modelsEndpoint(), { headers: providerHeaders(false) });
      const raw = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
      state.models = raw.filter(isChatTextModel).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
      renderModels($('modelFilter')?.value || '');
      setStatus(`Loaded ${state.models.length} text-capable models.`, 'ok');
      toast(`${state.models.length} models loaded.`);
    } catch (error) {
      setStatus(error.message || 'Could not load models.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = '↻ Load models';
    }
  }

  function extractAssistantText(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(part => part?.text || part?.content || '').join('');
    if (typeof data?.output_text === 'string') return data.output_text;
    if (Array.isArray(data?.output)) return data.output.flatMap(item => item?.content || []).map(part => part?.text || '').join('');
    throw new Error('The provider returned no readable text response.');
  }

  async function completion(messages, maxTokens = 3000) {
    const endpoint = resolvedChatEndpoint();
    const model = selectedModel();
    const token = $('aiToken')?.value.trim() || '';
    if (!/^https:\/\//i.test(endpoint)) throw new Error('Enter a valid HTTPS API base URL or /chat/completions endpoint.');
    if (!model) throw new Error('Choose a model first.');
    if (!token) throw new Error('Enter an API token for this browser session.');

    const { data } = await fetchJson(endpoint, {
      method: 'POST',
      headers: providerHeaders(true),
      body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: maxTokens })
    });
    return { text: extractAssistantText(data), data };
  }

  async function testConnection() {
    const button = $('testAiBtn');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Testing…';
    setStatus('Testing the selected model with a tiny request…', 'working');
    const started = performance.now();
    try {
      const result = await completion([{ role: 'user', content: 'Reply with exactly: OK' }], 24);
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      const actual = result.data?.model || selectedModel();
      setStatus(`Connected · ${actual} · ${elapsed}s · ${String(result.text).trim().slice(0, 40)}`, 'ok');
      addSystemMessage(`Connection test passed for ${actual} in ${elapsed}s.`);
    } catch (error) {
      setStatus(error.message || 'Connection test failed.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = '✓ Test AI';
    }
  }

  function spinStyle() {
    return S?.load?.() || {
      maxTurns: 9, dramaEnabled: true, dramaChance: 35,
      dramaCreepMinDegrees: 30, dramaCreepMaxDegrees: 80,
      showSlowIcon: true, iconPreviewStartPercent: 35
    };
  }

  function cleanSpinStyle(input, config) {
    const current = spinStyle();
    const src = { ...current, ...(input || {}) };
    const minTurns = Math.round(clamp(config.settings?.minTurns, 3, 20, 6));
    const minCreep = Math.round(clamp(src.dramaCreepMinDegrees, 5, 180, 30));
    return {
      maxTurns: Math.round(clamp(src.maxTurns, minTurns, 24, Math.max(minTurns, 9))),
      dramaEnabled: src.dramaEnabled !== false,
      dramaChance: Math.round(clamp(src.dramaChance, 0, 100, 35)),
      dramaCreepMinDegrees: minCreep,
      dramaCreepMaxDegrees: Math.round(clamp(src.dramaCreepMaxDegrees, minCreep, 240, Math.max(minCreep, 80))),
      showSlowIcon: src.showSlowIcon !== false,
      iconPreviewStartPercent: Math.round(clamp(src.iconPreviewStartPercent, 5, 90, 35))
    };
  }

  function localLogicReport(config) {
    const issues = [];
    const levelIds = new Set(config.levels.map(l => l.id));
    const forfeitIds = new Set(config.forfeits.map(f => f.id));
    const start = new Set(config.levels.filter(l => l.activeAtStart).map(l => l.id));
    if (!start.size) issues.push('No group is active at the start.');
    config.forfeits.forEach(item => {
      if (!levelIds.has(item.levelId)) issues.push(`Forfeit “${item.name}” points to missing group ${item.levelId}.`);
      (item.unlockLevels || []).forEach(id => { if (!levelIds.has(id)) issues.push(`Forfeit “${item.name}” unlocks missing group ${id}.`); });
      if (item.mystery && /^(mystery|mystery challenge|mystery forfeit)$/i.test(String(item.name).trim())) issues.push(`Mystery forfeit “${item.name}” looks like a placeholder rather than a real hidden result.`);
    });
    (config.rules || []).forEach(rule => {
      (rule.conditionForfeitIds || []).forEach(id => { if (!forfeitIds.has(id)) issues.push(`Rule “${rule.name}” references missing forfeit ${id}.`); });
      (rule.unlockLevels || []).forEach(id => { if (!levelIds.has(id)) issues.push(`Rule “${rule.name}” unlocks missing group ${id}.`); });
    });
    const reachable = new Set(start);
    let changed = true;
    while (changed) {
      changed = false;
      config.forfeits.forEach(item => {
        if (!item.enabled || !reachable.has(item.levelId)) return;
        (item.unlockLevels || []).forEach(id => { if (!reachable.has(id) && levelIds.has(id)) { reachable.add(id); changed = true; } });
      });
      (config.rules || []).forEach(rule => {
        if (!rule.enabled || !rule.conditionForfeitIds?.length) return;
        const possibleConditions = rule.conditionForfeitIds.map(id => {
          const item = config.forfeits.find(f => f.id === id);
          return !!item && item.enabled && reachable.has(item.levelId);
        });
        const possible = rule.mode === 'any' ? possibleConditions.some(Boolean) : possibleConditions.every(Boolean);
        if (!possible) return;
        (rule.unlockLevels || []).forEach(id => { if (!reachable.has(id) && levelIds.has(id)) { reachable.add(id); changed = true; } });
      });
    }
    config.levels.forEach(level => {
      if (!reachable.has(level.id)) issues.push(`Group “${level.name}” has no reachable unlock path.`);
      if (!config.forfeits.some(f => f.enabled && f.levelId === level.id)) issues.push(`Group “${level.name}” has no enabled forfeits.`);
    });
    return [...new Set(issues)];
  }

  function compactWheelContext() {
    const config = M.loadConfig();
    return {
      settings: config.settings,
      groups: config.levels.map(l => ({ id: l.id, name: l.name, icon: l.icon, activeAtStart: l.activeAtStart })),
      forfeits: config.forfeits.map(f => ({ id: f.id, name: f.name, icon: f.icon, levelId: f.levelId, category: f.category, weight: f.weight, cooldown: f.cooldown, mystery: f.mystery, enabled: f.enabled, lifetime: f.lifetime, eventType: f.eventType, unlockLevels: f.unlockLevels, description: f.description })),
      rules: config.rules,
      spinStyle: spinStyle(),
      localLogicIssues: localLogicReport(config)
    };
  }

  function systemPrompt() {
    return `You are the interactive configuration assistant for Fortune Engine, a weighted wheel game. You are in an ongoing CHAT. The user may ask you to add, remove, rename, modify or inspect wheel content.\n\nIMPORTANT: NEVER return the complete wheel configuration. Return only SMALL PATCH ACTIONS. This avoids large/truncated responses.\n\nCURRENT WHEEL\n${JSON.stringify(compactWheelContext())}\n\nSUPPORTED ACTIONS\n- {"type":"add_forfeit","item":{...}}\n- {"type":"update_forfeit","id":"existing-forfeit-id","changes":{...}}\n- {"type":"remove_forfeit","id":"existing-forfeit-id"}\n- {"type":"add_group","group":{...}}\n- {"type":"update_group","id":"existing-group-id","changes":{...}}\n- {"type":"remove_group","id":"existing-group-id"}\n- {"type":"add_rule","rule":{...}}\n- {"type":"update_rule","id":"existing-rule-id","changes":{...}}\n- {"type":"remove_rule","id":"existing-rule-id"}\n- {"type":"update_settings","changes":{...}}\n- {"type":"update_spin_style","changes":{...}}\n\nFORFEIT FIELDS\nid, name, icon, color, weight, levelId, category, description, animation (zoom|shake|pulse|flash|confetti), lifetime {type: forever|once|spins, spins:number}, cooldown, eventType (normal|spinAgain|unlock|doubleSpin|immunity|randomize), mystery, enabled, unlockLevels[].\n\nGROUP FIELDS\nid, name, icon, color, activeAtStart.\n\nRULE FIELDS\nid, name, mode (all|any), conditionForfeitIds[], unlockLevels[], enabled.\n\nRULES OF BEHAVIOR\n1. If the user only asks a question/check, return actions: [] and answer normally.\n2. If the user asks for edits, return only the minimum actions needed. Preserve unrelated content.\n3. Existing items MUST be referenced by their exact current id.\n4. New ids should be short kebab-case.\n5. Every forfeit belongs to exactly one existing/new group via levelId.\n6. Mystery is display-only: name/icon/description contain the REAL hidden result.\n7. Groups are independent unlock switches, not a linear ladder.\n8. Direct unlocks use unlockLevels; multi-result AND/OR conditions use rules.\n9. If the user asks for a language, use that language for player-facing names/descriptions.\n10. Keep descriptions concise and practical.\n11. Do not modify anything the user did not ask to modify.\n12. Output MUST be strict JSON. No markdown, comments, trailing commas or prose outside JSON. Keep the response compact.\n\nRETURN EXACTLY\n{"reply":"short conversational answer","actions":[],"logic":{"status":"ok|warning|error","findings":[]}}`;
  }

  function parseJson(text) {
    let raw = String(text || '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    return JSON.parse(raw);
  }

  async function structuredCompletion(messages) {
    const first = await completion(messages, 3200);
    try {
      return { answer: parseJson(first.text), repaired: false };
    } catch (_) {
      setStatus('The model returned malformed JSON. Repairing automatically…', 'working');
      const repairPrompt = `Your previous response was invalid or truncated JSON. Return a corrected COMPLETE response now. Use ONLY the compact patch format from the system message. Do NOT return the full wheel. Keep it under 1800 tokens. No markdown.\n\nMalformed response:\n${String(first.text).slice(0, 12000)}`;
      const repaired = await completion([...messages, { role: 'assistant', content: String(first.text).slice(0, 12000) }, { role: 'user', content: repairPrompt }], 2400);
      try {
        return { answer: parseJson(repaired.text), repaired: true };
      } catch (secondError) {
        throw new Error(`The selected model returned malformed JSON twice. Try a non-thinking/instruct model for configuration edits. Last parser error: ${secondError.message}`);
      }
    }
  }

  function resolveForfeit(config, id) { return config.forfeits.find(f => f.id === id) || config.forfeits.find(f => f.name.toLowerCase() === String(id || '').toLowerCase()); }
  function resolveGroup(config, id) { return config.levels.find(g => g.id === id) || config.levels.find(g => g.name.toLowerCase() === String(id || '').toLowerCase()); }
  function resolveRule(config, id) { return (config.rules || []).find(r => r.id === id) || (config.rules || []).find(r => r.name.toLowerCase() === String(id || '').toLowerCase()); }

  function normalizeLifetime(value, current = { type: 'forever', spins: 1 }) {
    if (!value || typeof value !== 'object') return current;
    const type = ['forever', 'once', 'spins'].includes(value.type) ? value.type : current.type;
    return { type, spins: Math.round(clamp(value.spins, 1, 999, current.spins || 1)) };
  }

  function defaultForfeit(item, config, used) {
    return { id: uniqueId(item.id || item.name || 'forfeit', used), name: String(item.name || 'New forfeit').slice(0, 60), icon: String(item.icon || '🎯').slice(0, 12), color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#65d8ff', weight: clamp(item.weight, 0.1, 100, 1), levelId: item.levelId || config.levels[0]?.id, category: String(item.category || 'General').slice(0, 30), description: String(item.description || '').slice(0, 240), animation: ['zoom','shake','pulse','flash','confetti'].includes(item.animation) ? item.animation : 'pulse', lifetime: normalizeLifetime(item.lifetime), cooldown: Math.round(clamp(item.cooldown, 0, 99, 0)), eventType: ['normal','spinAgain','unlock','doubleSpin','immunity','randomize'].includes(item.eventType) ? item.eventType : 'normal', mystery: !!item.mystery, enabled: item.enabled !== false, unlockLevels: Array.isArray(item.unlockLevels) ? [...new Set(item.unlockLevels)] : [] };
  }
  function defaultGroup(group, used) { return { id: uniqueId(group.id || group.name || 'group', used), name: String(group.name || 'New group').slice(0, 40), icon: String(group.icon || '◆').slice(0, 10), color: /^#[0-9a-f]{6}$/i.test(group.color || '') ? group.color : '#65d8ff', activeAtStart: !!group.activeAtStart }; }
  function defaultRule(rule, used) { return { id: uniqueId(rule.id || rule.name || 'rule', used), name: String(rule.name || 'New rule').slice(0, 60), mode: rule.mode === 'any' ? 'any' : 'all', conditionForfeitIds: Array.isArray(rule.conditionForfeitIds) ? [...new Set(rule.conditionForfeitIds)] : [], unlockLevels: Array.isArray(rule.unlockLevels) ? [...new Set(rule.unlockLevels)] : [], enabled: rule.enabled !== false };

  function validateConfig(config) {
    if (!config.levels.length) throw new Error('The wheel must contain at least one group.');
    if (!config.levels.some(g => g.activeAtStart)) throw new Error('At least one group must be active at start.');
    const levelIds = new Set(config.levels.map(g => g.id));
    const forfeitIds = new Set(config.forfeits.map(f => f.id));
    if (levelIds.size !== config.levels.length) throw new Error('Duplicate group IDs were produced.');
    if (forfeitIds.size !== config.forfeits.length) throw new Error('Duplicate forfeit IDs were produced.');
    config.forfeits.forEach(item => { if (!levelIds.has(item.levelId)) throw new Error(`Forfeit “${item.name}” references missing group ${item.levelId}.`); (item.unlockLevels || []).forEach(id => { if (!levelIds.has(id)) throw new Error(`Forfeit “${item.name}” unlocks missing group ${id}.`); }); });
    (config.rules || []).forEach(rule => { (rule.conditionForfeitIds || []).forEach(id => { if (!forfeitIds.has(id)) throw new Error(`Rule “${rule.name}” references missing forfeit ${id}.`); }); (rule.unlockLevels || []).forEach(id => { if (!levelIds.has(id)) throw new Error(`Rule “${rule.name}” unlocks missing group ${id}.`); }); });
  }

  function applyActions(actions) {
    const before = M.loadConfig(), beforeStyle = spinStyle(), next = clone(before);
    let nextStyle = clone(beforeStyle);
    next.rules = next.rules || [];
    const usedGroups = new Set(next.levels.map(x => x.id)), usedForfeits = new Set(next.forfeits.map(x => x.id)), usedRules = new Set(next.rules.map(x => x.id));
    const summary = [];
    (Array.isArray(actions) ? actions : []).forEach(action => {
      if (!action || typeof action !== 'object') return;
      const type = action.type;
      if (type === 'add_group') { const group = defaultGroup(action.group || {}, usedGroups); next.levels.push(group); summary.push(`+ group ${group.name}`); }
      else if (type === 'update_group') { const group = resolveGroup(next, action.id); if (!group) throw new Error(`Cannot find group ${action.id}.`); const c = action.changes || {}; if (c.name != null) group.name = String(c.name).slice(0,40); if (c.icon != null) group.icon = String(c.icon).slice(0,10); if (/^#[0-9a-f]{6}$/i.test(c.color || '')) group.color = c.color; if (c.activeAtStart != null) group.activeAtStart = !!c.activeAtStart; summary.push(`~ group ${group.name}`); }
      else if (type === 'remove_group') { const group = resolveGroup(next, action.id); if (!group) throw new Error(`Cannot find group ${action.id}.`); if (next.forfeits.some(f => f.levelId === group.id)) throw new Error(`Cannot remove group “${group.name}” while forfeits still belong to it. Move/remove them first.`); next.levels = next.levels.filter(g => g.id !== group.id); next.forfeits.forEach(f => { f.unlockLevels = (f.unlockLevels || []).filter(id => id !== group.id); }); next.rules.forEach(r => { r.unlockLevels = (r.unlockLevels || []).filter(id => id !== group.id); }); summary.push(`− group ${group.name}`); }
      else if (type === 'add_forfeit') { const item = defaultForfeit(action.item || {}, next, usedForfeits); next.forfeits.push(item); summary.push(`+ ${item.name}`); }
      else if (type === 'update_forfeit') { const item = resolveForfeit(next, action.id); if (!item) throw new Error(`Cannot find forfeit ${action.id}.`); const c = action.changes || {}; if (c.name != null) item.name = String(c.name).slice(0,60); if (c.icon != null) item.icon = String(c.icon).slice(0,12); if (/^#[0-9a-f]{6}$/i.test(c.color || '')) item.color = c.color; if (c.weight != null) item.weight = clamp(c.weight,0.1,100,item.weight); if (c.levelId != null) item.levelId = c.levelId; if (c.category != null) item.category = String(c.category).slice(0,30); if (c.description != null) item.description = String(c.description).slice(0,240); if (['zoom','shake','pulse','flash','confetti'].includes(c.animation)) item.animation = c.animation; if (c.lifetime != null) item.lifetime = normalizeLifetime(c.lifetime, item.lifetime); if (c.cooldown != null) item.cooldown = Math.round(clamp(c.cooldown,0,99,item.cooldown)); if (['normal','spinAgain','unlock','doubleSpin','immunity','randomize'].includes(c.eventType)) item.eventType = c.eventType; if (c.mystery != null) item.mystery = !!c.mystery; if (c.enabled != null) item.enabled = !!c.enabled; if (Array.isArray(c.unlockLevels)) item.unlockLevels = [...new Set(c.unlockLevels)]; summary.push(`~ ${item.name}`); }
      else if (type === 'remove_forfeit') { const item = resolveForfeit(next, action.id); if (!item) throw new Error(`Cannot find forfeit ${action.id}.`); next.forfeits = next.forfeits.filter(f => f.id !== item.id); next.rules.forEach(r => { r.conditionForfeitIds = (r.conditionForfeitIds || []).filter(id => id !== item.id); }); summary.push(`− ${item.name}`); }
      else if (type === 'add_rule') { const rule = defaultRule(action.rule || {}, usedRules); next.rules.push(rule); summary.push(`+ rule ${rule.name}`); }
      else if (type === 'update_rule') { const rule = resolveRule(next, action.id); if (!rule) throw new Error(`Cannot find rule ${action.id}.`); const c = action.changes || {}; if (c.name != null) rule.name = String(c.name).slice(0,60); if (c.mode === 'all' || c.mode === 'any') rule.mode = c.mode; if (Array.isArray(c.conditionForfeitIds)) rule.conditionForfeitIds = [...new Set(c.conditionForfeitIds)]; if (Array.isArray(c.unlockLevels)) rule.unlockLevels = [...new Set(c.unlockLevels)]; if (c.enabled != null) rule.enabled = !!c.enabled; summary.push(`~ rule ${rule.name}`); }
      else if (type === 'remove_rule') { const rule = resolveRule(next, action.id); if (!rule) throw new Error(`Cannot find rule ${action.id}.`); next.rules = next.rules.filter(r => r.id !== rule.id); summary.push(`− rule ${rule.name}`); }
      else if (type === 'update_settings') { const c = action.changes || {}; if (c.title != null) next.settings.title = String(c.title).slice(0,60); if (c.minSpinSeconds != null) next.settings.minSpinSeconds = clamp(c.minSpinSeconds,3,20,next.settings.minSpinSeconds); if (c.maxSpinSeconds != null) next.settings.maxSpinSeconds = clamp(c.maxSpinSeconds,3,25,next.settings.maxSpinSeconds); if (c.minTurns != null) next.settings.minTurns = Math.round(clamp(c.minTurns,3,20,next.settings.minTurns)); if (c.soundEnabled != null) next.settings.soundEnabled = !!c.soundEnabled; if (c.showTextOnWheel != null) next.settings.showTextOnWheel = !!c.showTextOnWheel; if (c.showProbabilities != null) next.settings.showProbabilities = !!c.showProbabilities; summary.push('~ game settings'); }
      else if (type === 'update_spin_style') { nextStyle = { ...nextStyle, ...(action.changes || {}) }; summary.push('~ spin style'); }
    });
    if (next.settings.minSpinSeconds > next.settings.maxSpinSeconds) [next.settings.minSpinSeconds, next.settings.maxSpinSeconds] = [next.settings.maxSpinSeconds, next.settings.minSpinSeconds];
    validateConfig(next);
    const clean = M.xmlToConfig(M.configToXml(next));
    nextStyle = cleanSpinStyle(nextStyle, clean);
    return { before, beforeStyle, next: clean, nextStyle, summary };
  }

  function addMessage(role, text, meta = '') {
    const row = document.createElement('div'); row.className = `ai-chat-message ${role}`;
    const bubble = document.createElement('div'); bubble.className = 'ai-chat-bubble';
    const copy = document.createElement('div'); copy.className = 'ai-chat-copy'; copy.textContent = text; bubble.appendChild(copy);
    if (meta) { const tag = document.createElement('div'); tag.className = 'ai-chat-meta'; tag.textContent = meta; bubble.appendChild(tag); }
    row.appendChild(bubble); $('chatMessages')?.appendChild(row); if ($('chatMessages')) $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  }
  function addSystemMessage(text) { addMessage('system', text); }
  function setBusy(busy) { state.pending = busy; ['sendAiBtn','testAiBtn','loadModelsBtn'].forEach(id => { if ($(id)) $(id).disabled = busy; }); if ($('chatInput')) $('chatInput').disabled = busy; if ($('sendAiBtn')) $('sendAiBtn').textContent = busy ? 'Thinking…' : 'Send'; }

  async function sendChat(forcedText = '') {
    if (state.pending) return;
    const input = $('chatInput'), text = String(forcedText || input?.value || '').trim();
    if (!text) return;
    if (input) input.value = '';
    addMessage('user', text); state.messages.push({ role: 'user', content: text }); if (state.messages.length > 12) state.messages = state.messages.slice(-12);
    setBusy(true); setStatus('AI is reading the current wheel…', 'working');
    try {
      const { answer, repaired } = await structuredCompletion([{ role: 'system', content: systemPrompt() }, ...state.messages]);
      const reply = String(answer?.reply || 'Done.'), actions = Array.isArray(answer?.actions) ? answer.actions : [];
      let meta = repaired ? 'JSON auto-repaired' : '';
      if (actions.length) {
        const applied = applyActions(actions);
        state.lastUndo = { config: applied.before, spinStyle: applied.beforeStyle };
        M.saveConfig(applied.next); M.resetSession(applied.next); S?.save?.(applied.nextStyle);
        if ($('undoAiBtn')) $('undoAiBtn').disabled = false;
        meta = [meta, `${actions.length} edit${actions.length === 1 ? '' : 's'} applied${applied.summary.length ? ' · ' + applied.summary.slice(0,6).join(' · ') : ''}`].filter(Boolean).join(' · ');
        refreshWheelStats();
      } else meta = [meta, 'No wheel changes'].filter(Boolean).join(' · ');
      if (answer?.logic?.findings?.length) meta += ` · logic: ${answer.logic.findings.length} finding${answer.logic.findings.length === 1 ? '' : 's'}`;
      addMessage('assistant', reply, meta); state.messages.push({ role: 'assistant', content: reply }); if (state.messages.length > 12) state.messages = state.messages.slice(-12);
      setStatus(repaired ? 'Ready · malformed model output was repaired automatically.' : 'Ready.', 'ok');
    } catch (error) {
      addMessage('assistant', `I could not complete that request: ${error.message || 'unknown error'}`, 'Not applied'); setStatus(error.message || 'AI request failed.', 'error');
    } finally { setBusy(false); input?.focus(); }
  }

  function undoLastAiEdit() { if (!state.lastUndo) return; const config = M.saveConfig(state.lastUndo.config); M.resetSession(config); S?.save?.(state.lastUndo.spinStyle); state.lastUndo = null; if ($('undoAiBtn')) $('undoAiBtn').disabled = true; refreshWheelStats(); addSystemMessage('Last AI edit was undone.'); toast('AI edit undone.'); }
  function clearChat() { state.messages = []; if ($('chatMessages')) $('chatMessages').innerHTML = ''; addSystemMessage('Chat cleared. I will continue from the wheel configuration currently saved in your browser.'); }
  function refreshWheelStats() { const config = M.loadConfig(), issues = localLogicReport(config); if ($('chatGroupCount')) $('chatGroupCount').textContent = config.levels.length; if ($('chatForfeitCount')) $('chatForfeitCount').textContent = config.forfeits.length; if ($('chatRuleCount')) $('chatRuleCount').textContent = config.rules.length; if ($('logicBadge')) { $('logicBadge').textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Logic OK'; $('logicBadge').classList.toggle('warn', !!issues.length); } }
  function providerChanged() { const provider = $('aiProvider')?.value; if (provider === 'openrouter') $('aiEndpoint').value = 'https://openrouter.ai/api/v1/chat/completions'; if (provider === 'nanogpt') $('aiEndpoint').value = 'https://nano-gpt.com/api/v1'; state.models = []; renderModels(); setStatus('Provider changed. Load its model list.', ''); }

  function init() {
    $('aiProvider')?.addEventListener('change', providerChanged); $('loadModelsBtn')?.addEventListener('click', loadModels); $('modelFilter')?.addEventListener('input', e => renderModels(e.target.value)); $('testAiBtn')?.addEventListener('click', testConnection);
    $('toggleToken')?.addEventListener('click', () => { const input = $('aiToken'); if (!input) return; const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password'; $('toggleToken').textContent = reveal ? 'Hide' : 'Show'; });
    $('sendAiBtn')?.addEventListener('click', () => sendChat()); $('chatInput')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } });
    $('clearChatBtn')?.addEventListener('click', clearChat); $('undoAiBtn')?.addEventListener('click', undoLastAiEdit); document.querySelectorAll('[data-ai-command]').forEach(button => button.addEventListener('click', () => sendChat(button.dataset.aiCommand)));
    refreshWheelStats(); renderModels(); addSystemMessage('Ready. AI edits now use compact patches instead of returning the full wheel, which is much more reliable with smaller/local/uncensored models.'); loadModels();
  }
  init();
})();