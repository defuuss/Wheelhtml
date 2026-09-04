(() => {
  'use strict';

  const M = window.FortuneModel;
  const D = window.FortuneDependencyState;
  const S = window.FortuneSpinStyle;
  if (!M || !D || window.__fortuneAiEditorEngine) return;
  window.__fortuneAiEditorEngine = true;

  const $ = id => document.getElementById(id);
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));
  const state = {
    models: [], history: [], busy: false, timer: null, started: 0,
    phase: 'Ready', undo: null, lastFailed: null, lastBudget: ''
  };

  const provider = () => $('aiProvider')?.value || 'custom';
  const token = () => $('aiToken')?.value.trim() || '';
  const selectedModel = () => $('aiModel')?.value || '';
  const endpoint = () => $('aiEndpoint')?.value.trim().replace(/\/+$/, '') || '';

  function injectStyles() {
    if ($('aiEditorEngineStyles')) return;
    const style = document.createElement('style');
    style.id = 'aiEditorEngineStyles';
    style.textContent = `
      .ai-retry-row{display:flex;gap:7px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}
      .ai-retry-btn{min-height:29px;padding:0 10px;border:1px solid rgba(101,216,255,.2);border-radius:8px;background:rgba(101,216,255,.06);color:#c9f5ff;font-size:.64rem;font-weight:850;cursor:pointer}
      .ai-retry-btn:hover{background:rgba(101,216,255,.12);border-color:rgba(101,216,255,.38)}
      .ai-engine-note{margin-top:7px;color:var(--muted2);font-size:.61rem;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function setStatus(text, type = '') {
    const node = $('aiStatus');
    if (!node) return;
    node.textContent = text;
    node.className = `ai-status ${type}`.trim();
  }

  function addMessage(role, text, meta = '', retryText = '') {
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
    if (retryText) {
      const wrap = document.createElement('div');
      wrap.className = 'ai-retry-row';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'ai-retry-btn';
      retry.textContent = '↻ Retry request';
      retry.dataset.retryText = retryText;
      wrap.appendChild(retry);
      bubble.appendChild(wrap);
    }
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  function setPhase(phase) { state.phase = phase; updateHeartbeat(); }
  function updateHeartbeat() {
    if (!state.busy) return;
    const seconds = Math.floor((performance.now() - state.started) / 1000);
    if ($('sendAiBtn')) $('sendAiBtn').textContent = `⏳ Working… ${seconds}s`;
    const budget = state.lastBudget ? ` · ${state.lastBudget}` : '';
    setStatus(`${state.phase}… ${seconds}s${budget}`, 'working');
    const pending = $('chatMessages')?.querySelector('.ai-chat-message.system:last-child .ai-chat-meta');
    if (pending) pending.textContent = `${state.phase} · ${seconds}s elapsed${budget}`;
  }
  function startWork(phase) {
    state.busy = true;
    state.started = performance.now();
    state.phase = phase;
    state.lastBudget = '';
    ['sendAiBtn', 'testAiBtn', 'loadModelsBtn'].forEach(id => { const node = $(id); if (node) node.disabled = true; });
    if ($('chatInput')) $('chatInput').disabled = true;
    clearInterval(state.timer);
    updateHeartbeat();
    state.timer = setInterval(updateHeartbeat, 1000);
  }
  function stopWork() {
    state.busy = false;
    state.lastBudget = '';
    clearInterval(state.timer);
    state.timer = null;
    if ($('sendAiBtn')) { $('sendAiBtn').disabled = false; $('sendAiBtn').textContent = 'Send'; }
    if ($('testAiBtn')) { $('testAiBtn').disabled = false; $('testAiBtn').textContent = '✓ Test AI'; }
    if ($('loadModelsBtn')) { $('loadModelsBtn').disabled = false; $('loadModelsBtn').textContent = '↻ Load models'; }
    if ($('chatInput')) $('chatInput').disabled = false;
  }

  function providerDefaults(kind) {
    if (kind === 'nanogpt') return 'https://nano-gpt.com/api/v1';
    if (kind === 'openrouter') return 'https://openrouter.ai/api/v1';
    return '';
  }
  function modelsUrl() {
    if (provider() === 'nanogpt') return 'https://nano-gpt.com/api/v1/models?detailed=true';
    if (provider() === 'openrouter') return 'https://openrouter.ai/api/v1/models';
    const raw = endpoint();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      let path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
      url.pathname = `${path}/models`.replace(/\/+/g, '/');
      return url.toString();
    } catch (_) { return `${raw}/models`; }
  }
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
  function headers(json = false, auth = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (auth && token()) h.Authorization = `Bearer ${token()}`;
    if (provider() === 'openrouter') {
      h['HTTP-Referer'] = location.origin + location.pathname;
      h['X-Title'] = 'Fortune Engine AI Editor';
    }
    return h;
  }
  async function fetchJson(url, init = {}, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch (_) { throw new Error(`Provider returned non-JSON data (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      if (error instanceof TypeError || /NetworkError|Failed to fetch/i.test(String(error?.message))) {
        throw new Error(`Browser could not reach ${url}. Check the endpoint or CORS settings.`);
      }
      throw error;
    } finally { clearTimeout(timer); }
  }

  function normalizeModels(data) {
    const list = Array.isArray(data) ? data
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.models) ? data.models
      : data?.data && typeof data.data === 'object' ? Object.values(data.data)
      : data?.models && typeof data.models === 'object' ? Object.values(data.models) : [];
    return list.map(value => {
      if (typeof value === 'string') return { id: value, name: value };
      if (!value || typeof value !== 'object') return null;
      const id = String(value.id || value.model || value.slug || value.name || '');
      return id ? { ...value, id, name: value.name || value.display_name || value.displayName || id } : null;
    }).filter(item => item?.id && !/embedding|rerank|tts|speech|transcri|image|video/i.test(item.id));
  }
  function renderModels() {
    const select = $('aiModel');
    if (!select) return;
    const old = select.value || select.dataset.restoreModel || '';
    const query = ($('modelFilter')?.value || '').trim().toLowerCase();
    const visible = state.models.filter(item => !query || `${item.id} ${item.name || ''} ${item.description || ''}`.toLowerCase().includes(query));
    select.innerHTML = '';
    if (!visible.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = state.models.length ? 'No models match search' : 'Load models first';
      select.appendChild(option);
      return;
    }
    visible.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name && item.name !== item.id ? `${item.name} · ${item.id}` : item.id;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === old)) select.value = old;
    if (select.dataset.restoreModel && select.value === select.dataset.restoreModel) delete select.dataset.restoreModel;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function loadModels() {
    if (state.busy) return;
    startWork('Loading models');
    try {
      const url = modelsUrl();
      if (!/^https:\/\//i.test(url)) throw new Error('Enter a valid HTTPS API base URL.');
      let data;
      if (provider() === 'nanogpt' || provider() === 'openrouter') data = await fetchJson(url, { method: 'GET' }, 45000);
      else {
        try { data = await fetchJson(url, { method: 'GET', headers: headers(false, true) }, 45000); }
        catch (_) { data = await fetchJson(url, { method: 'GET' }, 45000); }
      }
      state.models = normalizeModels(data).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
      renderModels();
      setStatus(`Loaded ${state.models.length} models.`, 'ok');
    } catch (error) {
      setStatus(`Could not load models: ${error.message}`, 'error');
    } finally { stopWork(); }
  }

  function selectedModelInfo() {
    const id = selectedModel();
    return state.models.find(item => item.id === id) || null;
  }
  function contextLimit(info = selectedModelInfo()) {
    if (!info) return 0;
    const candidates = [
      info.context_length, info.context_window, info.max_context_length, info.max_context_tokens,
      info.context, info.limits?.context, info.limits?.context_length, info.architecture?.context_length
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 2048) return n;
    }
    return 0;
  }
  const estimateTokens = text => Math.max(1, Math.ceil(String(text || '').length / 3.5));
  function outputBudgetForXml(xml) {
    const xmlTokens = estimateTokens(xml);
    return Math.min(24000, Math.max(7000, Math.ceil(xmlTokens * 1.45) + 1800));
  }
  function contextCheck(systemText, userText, maxOutput) {
    const estimatedInput = estimateTokens(systemText) + estimateTokens(userText) + 200;
    const limit = contextLimit();
    if (limit && estimatedInput + maxOutput > limit * 0.92) {
      throw new Error(`Selected model context looks too small for a full-XML edit. Estimated input ${estimatedInput.toLocaleString()} tokens + output budget ${maxOutput.toLocaleString()} exceeds its advertised ${limit.toLocaleString()} token context. Choose a larger-context model.`);
    }
    return { estimatedInput, limit };
  }

  function extractText(data) {
    const message = data?.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = content.map(item => item?.text || item?.content || '').join('');
      if (text.trim()) return text;
    }
    if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
    if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) return message.reasoning_content;
    throw new Error('Provider returned no readable assistant text.');
  }
  async function complete(messages, options = {}) {
    const maxTokens = options.maxTokens ?? 7000;
    const temperature = options.temperature ?? 0;
    const timeoutMs = options.timeoutMs ?? 300000;
    if (!selectedModel()) throw new Error('Choose a model first.');
    if (!token()) throw new Error('Enter the API token first.');
    const url = chatUrl();
    if (!/^https:\/\//i.test(url)) throw new Error('Invalid chat endpoint.');
    const data = await fetchJson(url, {
      method: 'POST',
      headers: headers(true, true),
      body: JSON.stringify({ model: selectedModel(), messages, temperature, max_tokens: maxTokens })
    }, timeoutMs);
    return { data, text: extractText(data) };
  }
  async function testApi() {
    if (state.busy) return;
    startWork('Testing API');
    try {
      const started = performance.now();
      const result = await complete([{ role: 'user', content: 'Reply with exactly OK and nothing else.' }], { maxTokens: 64, timeoutMs: 60000 });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const used = result.data?.model || selectedModel();
      const limit = contextLimit();
      setStatus(`Connected · ${used} · ${seconds}s${limit ? ` · context ${limit.toLocaleString()}` : ''}`, 'ok');
      addMessage('system', `✓ API test passed in ${seconds}s with ${used}${limit ? ` · advertised context ${limit.toLocaleString()} tokens` : ''}.`);
    } catch (error) {
      setStatus(`Test failed: ${error.message}`, 'error');
      addMessage('system', `✕ API test failed: ${error.message}`);
    } finally { stopWork(); }
  }

  function requestMode(text) {
    const value = String(text || '');
    const edit = /\b(add|create|insert|remove|delete|rename|change|modify|update|make|set|move|put|place|assign|adapt|fix|correct|organize|organise|sort|reorder|restructure|ensure|enable|disable|attach|depend|require|unlock|hinzuf|ergänz|lösch|entfern|änder|umbenenn|verschieb|zuord|anpass|korrig|sortier|abhäng|freischalt|ajout|cré|supprim|modifi|renomm|déplac|adapt|corrig|organis|tri|dépend|déverrou)\w*/i.test(value);
    const analysisOnly = /\b(do not change|don't change|without changing|no changes|only check|just check|check only|only review|only explain|nur prüfen|nichts ändern|ohne zu ändern|ne rien modifier|sans modifier)\b/i.test(value);
    if (analysisOnly) return 'analysis';
    if (edit) return 'edit';
    if (/\b(check|review|inspect|explain|why|logic|odds|reachable|progression|prüf|erklär|warum|vérif|explique|pourquoi)\b/i.test(value)) return 'analysis';
    return 'edit';
  }

  function currentConfig() { return clone(window.FortuneEditor?.getDraft?.() || M.loadConfig()); }
  function addSpinToXml(xmlText, spin = S?.load?.() || {}) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.querySelector('parsererror')) return String(xmlText);
    const node = doc.querySelector('settings');
    if (!node) return String(xmlText);
    const attrs = {
      maxTurns: spin.maxTurns, spinUpMinSeconds: spin.spinUpMinSeconds, spinUpMaxSeconds: spin.spinUpMaxSeconds,
      spinDownMinSeconds: spin.spinDownMinSeconds, spinDownMaxSeconds: spin.spinDownMaxSeconds,
      dramaEnabled: spin.dramaEnabled, dramaChance: spin.dramaChance,
      dramaCreepMinDegrees: spin.dramaCreepMinDegrees, dramaCreepMaxDegrees: spin.dramaCreepMaxDegrees,
      showSlowIcon: spin.showSlowIcon, iconPreviewStartPercent: spin.iconPreviewStartPercent
    };
    Object.entries(attrs).forEach(([key, value]) => { if (value != null) node.setAttribute(key, String(value)); });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc.documentElement);
  }
  function currentXml(config = currentConfig(), spin = S?.load?.() || {}) { return addSpinToXml(M.configToXml(config), spin); }
  function readSpinFromXml(xmlText, fallback = S?.load?.() || {}) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    const node = doc.querySelector('settings');
    if (!node) return clone(fallback);
    const number = (name, old) => node.hasAttribute(name) ? Number(node.getAttribute(name)) : old;
    const bool = (name, old) => node.hasAttribute(name) ? node.getAttribute(name) === 'true' : old;
    return {
      ...clone(fallback), maxTurns: number('maxTurns', fallback.maxTurns),
      spinUpMinSeconds: number('spinUpMinSeconds', fallback.spinUpMinSeconds), spinUpMaxSeconds: number('spinUpMaxSeconds', fallback.spinUpMaxSeconds),
      spinDownMinSeconds: number('spinDownMinSeconds', fallback.spinDownMinSeconds), spinDownMaxSeconds: number('spinDownMaxSeconds', fallback.spinDownMaxSeconds),
      dramaEnabled: bool('dramaEnabled', fallback.dramaEnabled), dramaChance: number('dramaChance', fallback.dramaChance),
      dramaCreepMinDegrees: number('dramaCreepMinDegrees', fallback.dramaCreepMinDegrees), dramaCreepMaxDegrees: number('dramaCreepMaxDegrees', fallback.dramaCreepMaxDegrees),
      showSlowIcon: bool('showSlowIcon', fallback.showSlowIcon), iconPreviewStartPercent: number('iconPreviewStartPercent', fallback.iconPreviewStartPercent)
    };
  }

  const ENGINE_GUIDE = `FORTUNE ENGINE XML EDITOR
The supplied <fortuneEngine> XML is the complete wheel configuration. For EDIT requests, return the complete corrected XML and nothing else.

GROUPS: <group> is a broad thematic/game-state container. A forfeit belongs to the group named by its group="GROUP_ID" attribute. Category text is not group membership. If the user says something belongs under another group, change group="..." to the exact target group id. For plural requests, inspect every semantically matching forfeit.

DEPENDENCIES: <requires mode="all|any"><forfeit ref="ID"/></requires> controls individual availability. A -> B means B requires A. If Shoes Off must happen before both Socks Off and Pants Off, but Socks and Pants can otherwise happen in either order, then BOTH Socks Off and Pants Off require Shoes Off; they do not require each other. For a chain A -> B -> C, B normally requires A and C requires B. Never create self/circular dependencies. Omit <requires> when none is needed.

GROUP UNLOCKS: <unlocks><group ref="ID"/></unlocks> and <rules> activate broad groups. Do not use groups merely to sequence ordinary individual forfeits.

LIFETIME/COOLDOWN: preserve lifetime, lifetimeSpins and cooldown unless the request requires changing them. MYSTERY: mystery="true" hides the real result until selected; preserve the real name/icon/description. SPECIAL EVENTS: preserve eventType unless requested. SPIN SETTINGS: preserve all <settings> values unless requested.

EDITING RULES: read the entire XML; preserve unrelated data exactly; reuse existing IDs; add missing forfeits when explicitly or clearly requested; use unique lowercase ASCII IDs for new items; prefer existing appropriate groups; fix all items in a requested semantic set, not just one; do not merely describe changes; do not return a fragment or markdown fence.`;

  function extractXml(text) {
    let raw = String(text || '').trim().replace(/^```(?:xml)?\s*/i, '').replace(/\s*```$/i, '');
    const start = raw.indexOf('<fortuneEngine');
    const declaration = raw.indexOf('<?xml');
    const from = declaration >= 0 && declaration < start ? declaration : start;
    const endTag = '</fortuneEngine>';
    const end = raw.lastIndexOf(endTag);
    if (start < 0 || end < 0 || end < start) throw new Error('The model did not return one complete Fortune Engine XML document.');
    return raw.slice(from >= 0 ? from : start, end + endTag.length).trim();
  }

  function validateRawXml(xmlText) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('The model returned malformed XML.');
    if (doc.documentElement?.tagName !== 'fortuneEngine') throw new Error('Returned XML root must be <fortuneEngine>.');
    if (!doc.querySelector('fortuneEngine > settings')) throw new Error('Returned XML has no <settings> element.');
    const groups = [...doc.querySelectorAll('groups > group')];
    const forfeits = [...doc.querySelectorAll('forfeits > forfeit')];
    const groupIds = groups.map(n => n.getAttribute('id')).filter(Boolean);
    const forfeitIds = forfeits.map(n => n.getAttribute('id')).filter(Boolean);
    if (!groups.length) throw new Error('Returned XML must contain at least one group.');
    if (groupIds.length !== groups.length || new Set(groupIds).size !== groupIds.length) throw new Error('Returned XML contains missing or duplicate group IDs.');
    if (forfeitIds.length !== forfeits.length || new Set(forfeitIds).size !== forfeitIds.length) throw new Error('Returned XML contains missing or duplicate forfeit IDs.');
    const groupSet = new Set(groupIds), forfeitSet = new Set(forfeitIds);
    const graph = new Map(forfeitIds.map(id => [id, []]));
    forfeits.forEach(node => {
      const id = node.getAttribute('id'), group = node.getAttribute('group');
      if (!groupSet.has(group)) throw new Error(`Forfeit ${id} references missing group ${group || '(empty)'}.`);
      [...node.querySelectorAll(':scope > unlocks > group')].forEach(x => {
        const ref = x.getAttribute('ref');
        if (!groupSet.has(ref)) throw new Error(`Forfeit ${id} unlocks missing group ${ref}.`);
      });
      const req = node.querySelector(':scope > requires');
      if (req && !['all', 'any'].includes(req.getAttribute('mode') || 'all')) throw new Error(`Forfeit ${id} has invalid requires mode.`);
      [...(req?.querySelectorAll(':scope > forfeit') || [])].forEach(x => {
        const ref = x.getAttribute('ref');
        if (!forfeitSet.has(ref)) throw new Error(`Forfeit ${id} requires missing forfeit ${ref}.`);
        if (ref === id) throw new Error(`Forfeit ${id} cannot require itself.`);
        graph.get(id).push(ref);
      });
    });
    [...doc.querySelectorAll('rules > rule')].forEach(rule => {
      const id = rule.getAttribute('id') || '(unnamed rule)';
      [...rule.querySelectorAll(':scope > conditions > forfeit')].forEach(x => {
        const ref = x.getAttribute('ref'); if (!forfeitSet.has(ref)) throw new Error(`Rule ${id} references missing forfeit ${ref}.`);
      });
      [...rule.querySelectorAll(':scope > unlocks > group')].forEach(x => {
        const ref = x.getAttribute('ref'); if (!groupSet.has(ref)) throw new Error(`Rule ${id} references missing group ${ref}.`);
      });
    });
    const visiting = new Set(), visited = new Set();
    function walk(id, trail = []) {
      if (visiting.has(id)) throw new Error(`Circular dependency detected: ${[...trail, id].join(' → ')}`);
      if (visited.has(id)) return;
      visiting.add(id);
      (graph.get(id) || []).forEach(next => walk(next, [...trail, id]));
      visiting.delete(id);
      visited.add(id);
    }
    forfeitIds.forEach(id => walk(id));
    return doc;
  }

  function stableConfig(config) { return JSON.stringify(M.sanitizeConfig(clone(config))); }
  function restoreSidecar(config) { try { D.replace(config); } catch (_) {} }
  function parseReturnedConfig(xmlText, fallbackSpin, restoreConfig) {
    validateRawXml(xmlText);
    let config;
    try { config = clone(M.xmlToConfig(xmlText)); }
    catch (error) { restoreSidecar(restoreConfig); throw new Error(`Could not import returned XML: ${error.message}`); }
    const spin = readSpinFromXml(xmlText, fallbackSpin);
    restoreSidecar(restoreConfig);
    return { config, spin };
  }

  function groupNameMap(config) { return new Map(config.levels.map(g => [g.id, g.name])); }
  function diffSummary(before, after, beforeSpin, afterSpin) {
    const oldF = new Map(before.forfeits.map(x => [x.id, x])), newF = new Map(after.forfeits.map(x => [x.id, x]));
    const oldG = new Map(before.levels.map(x => [x.id, x])), newG = new Map(after.levels.map(x => [x.id, x]));
    const oldR = new Map((before.rules || []).map(x => [x.id, x])), newR = new Map((after.rules || []).map(x => [x.id, x]));
    const oldGN = groupNameMap(before), newGN = groupNameMap(after);
    const addedIds = [...newF.keys()].filter(id => !oldF.has(id));
    const removedIds = [...oldF.keys()].filter(id => !newF.has(id));
    const changedIds = [...newF.keys()].filter(id => oldF.has(id) && JSON.stringify(oldF.get(id)) !== JSON.stringify(newF.get(id)));
    const addedG = [...newG.keys()].filter(id => !oldG.has(id)).length;
    const removedG = [...oldG.keys()].filter(id => !newG.has(id)).length;
    const changedG = [...newG.keys()].filter(id => oldG.has(id) && JSON.stringify(oldG.get(id)) !== JSON.stringify(newG.get(id))).length;
    const changedR = [...new Set([...oldR.keys(), ...newR.keys()])].filter(id => JSON.stringify(oldR.get(id)) !== JSON.stringify(newR.get(id))).length;
    const spinChanged = JSON.stringify(beforeSpin || {}) !== JSON.stringify(afterSpin || {});
    const details = [];
    addedIds.forEach(id => { const f = newF.get(id); details.push(`Added ${f.name} → ${newGN.get(f.levelId) || f.levelId}`); });
    removedIds.forEach(id => { const f = oldF.get(id); details.push(`Removed ${f.name}`); });
    changedIds.forEach(id => {
      const a = oldF.get(id), b = newF.get(id);
      if (a.levelId !== b.levelId) details.push(`${b.name}: ${oldGN.get(a.levelId) || a.levelId} → ${newGN.get(b.levelId) || b.levelId}`);
      const aReq = JSON.stringify([a.requiresMode || 'all', a.requiresForfeitIds || []]);
      const bReq = JSON.stringify([b.requiresMode || 'all', b.requiresForfeitIds || []]);
      if (aReq !== bReq) details.push(`${b.name}: availability updated`);
      if (a.levelId === b.levelId && aReq === bReq) details.push(`${b.name}: details updated`);
    });
    const total = addedIds.length + removedIds.length + changedIds.length + addedG + removedG + changedG + changedR + (spinChanged ? 1 : 0);
    const parts = [];
    if (addedIds.length) parts.push(`${addedIds.length} forfeit${addedIds.length === 1 ? '' : 's'} added`);
    if (changedIds.length) parts.push(`${changedIds.length} forfeit${changedIds.length === 1 ? '' : 's'} updated`);
    if (removedIds.length) parts.push(`${removedIds.length} forfeit${removedIds.length === 1 ? '' : 's'} removed`);
    if (addedG || changedG || removedG) parts.push(`${addedG + changedG + removedG} group change${addedG + changedG + removedG === 1 ? '' : 's'}`);
    if (changedR) parts.push(`${changedR} rule change${changedR === 1 ? '' : 's'}`);
    if (spinChanged) parts.push('spin settings updated');
    return { total, text: parts.join(' · ') || 'no configuration differences', details };
  }

  function xmlSystemPrompt(strict = false, failures = []) {
    const extra = failures.length
      ? `\nCORRECTION REQUIREMENTS:\n${failures.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nFix every listed requirement in the XML.`
      : '';
    return `${ENGINE_GUIDE}\n${strict ? '\nSTRICT MODE: The previous attempt was unchanged or incomplete. Make concrete edits that satisfy every part of the user request.' : ''}${extra}\nReturn only the complete corrected XML.`;
  }

  async function requestEditedXml(text, sourceXml, { strict = false, failures = [] } = {}) {
    const system = xmlSystemPrompt(strict, failures);
    const user = `USER REQUEST\n${text}\n\nCURRENT COMPLETE WHEEL XML\n${sourceXml}`;
    const maxTokens = outputBudgetForXml(sourceXml);
    const budget = contextCheck(system, user, maxTokens);
    state.lastBudget = `XML ~${estimateTokens(sourceXml).toLocaleString()} tok${budget.limit ? ` / context ${budget.limit.toLocaleString()}` : ''}`;
    setPhase(failures.length ? 'Correcting failed requirements' : strict ? 'Retrying full XML edit' : 'Editing complete XML');
    const result = await complete([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { maxTokens, temperature: 0, timeoutMs: 300000 });
    return extractXml(result.text);
  }

  function parseAuditJson(text) {
    let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    const parsed = JSON.parse(raw);
    return {
      pass: parsed?.pass === true,
      problems: Array.isArray(parsed?.problems) ? parsed.problems.map(x => String(x)).filter(Boolean).slice(0, 12) : []
    };
  }

  async function auditCandidate(text, candidateXml) {
    setPhase('Checking requested result');
    const system = `You are a strict QA checker for Fortune Engine. Check whether the CANDIDATE XML satisfies the USER REQUEST. Do not edit XML.\nRules: group membership is the forfeit group attribute, not category. For plural semantic requests inspect all matching items. For missing-item requests verify each requested item exists. For dependency/order requests inspect <requires> and apply the user's stated logic literally. Do not invent extra requirements.\nReturn ONLY JSON: {"pass":true,"problems":[]} or {"pass":false,"problems":["specific failed requirement", ...]}.`;
    const user = `USER REQUEST\n${text}\n\nCANDIDATE COMPLETE WHEEL XML\n${candidateXml}`;
    const budget = contextCheck(system, user, 1200);
    state.lastBudget = `audit ~${budget.estimatedInput.toLocaleString()} tok${budget.limit ? ` / context ${budget.limit.toLocaleString()}` : ''}`;
    const result = await complete([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { maxTokens: 1200, temperature: 0, timeoutMs: 180000 });
    try { return parseAuditJson(result.text); }
    catch (_) { return { pass: false, problems: ['The QA response was unreadable; verify the requested edit again.'] }; }
  }

  async function getValidCandidate(text, sourceXml, before, beforeSpin, strict = false, failures = []) {
    let xml = await requestEditedXml(text, sourceXml, { strict, failures });
    try {
      return { xml, parsed: parseReturnedConfig(xml, beforeSpin, before) };
    } catch (error) {
      if (strict) throw error;
      setPhase('Repairing XML structure');
      xml = await requestEditedXml(text, xml, { strict: true, failures: [`Returned XML was structurally invalid: ${error.message}`] });
      return { xml, parsed: parseReturnedConfig(xml, beforeSpin, before) };
    }
  }

  async function editUsingXml(text, strictRetry = false) {
    const before = currentConfig();
    const beforeSpin = clone(S?.load?.() || {});
    const sourceXml = currentXml(before, beforeSpin);
    const snapshot = stableConfig(before);

    let candidate = await getValidCandidate(text, sourceXml, before, beforeSpin, strictRetry);
    let diff = diffSummary(before, candidate.parsed.config, beforeSpin, candidate.parsed.spin);

    if (!diff.total) {
      if (strictRetry) throw new Error('The selected model returned the same XML again. No configuration change was produced.');
      candidate = await getValidCandidate(text, sourceXml, before, beforeSpin, true, ['The previous response was effectively identical to the input XML. Make the concrete requested edits now.']);
      diff = diffSummary(before, candidate.parsed.config, beforeSpin, candidate.parsed.spin);
      if (!diff.total) throw new Error('The selected model returned unchanged XML twice. This is a model-following problem, not an XML parser problem. Try Retry once or choose a stronger instruction-following model.');
    }

    let audit = await auditCandidate(text, candidate.xml);
    if (!audit.pass) {
      candidate = await getValidCandidate(text, candidate.xml, before, beforeSpin, true, audit.problems);
      diff = diffSummary(before, candidate.parsed.config, beforeSpin, candidate.parsed.spin);
      if (!diff.total) throw new Error(`The correction did not change the wheel. Failed requirements: ${audit.problems.join('; ')}`);
      audit = await auditCandidate(text, candidate.xml);
      if (!audit.pass) {
        throw new Error(`The XML changed, but these requested requirements are still not satisfied: ${audit.problems.join('; ')}`);
      }
    }

    return applyXmlResult(before, beforeSpin, snapshot, candidate.parsed.config, candidate.parsed.spin, diff);
  }

  function applyXmlResult(before, beforeSpin, snapshot, nextConfig, nextSpin, diff) {
    const liveDraft = currentConfig();
    if (stableConfig(liveDraft) !== snapshot) {
      restoreSidecar(liveDraft);
      throw new Error('The wheel was manually changed while the AI was working. Nothing was overwritten. Retry to use the newest editor state.');
    }
    setPhase('Applying verified XML');
    state.undo = { config: before, spin: beforeSpin };
    D.replace(nextConfig);
    const saved = M.saveConfig(nextConfig);
    M.resetSession(saved);
    S?.save?.(nextSpin);
    if ($('undoAiBtn')) $('undoAiBtn').disabled = false;
    refreshStats();
    window.dispatchEvent(new CustomEvent('fortune-ai-applied', { detail: { count: diff.total, xml: true } }));
    return diff;
  }

  async function analyzeUsingXml(text) {
    const xml = currentXml();
    setPhase('Analyzing complete wheel XML');
    const system = `${ENGINE_GUIDE}\nANALYSIS MODE: do not modify anything and do not return XML. Answer the user clearly from the supplied current XML.`;
    const user = `USER QUESTION\n${text}\n\nCURRENT COMPLETE WHEEL XML\n${xml}`;
    const budget = contextCheck(system, user, 4000);
    state.lastBudget = `XML ~${estimateTokens(xml).toLocaleString()} tok${budget.limit ? ` / context ${budget.limit.toLocaleString()}` : ''}`;
    const result = await complete([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { maxTokens: 4000, temperature: 0.1, timeoutMs: 240000 });
    return result.text.trim();
  }

  function refreshStats() {
    const c = M.loadConfig();
    if ($('chatGroupCount')) $('chatGroupCount').textContent = c.levels.length;
    if ($('chatForfeitCount')) $('chatForfeitCount').textContent = c.forfeits.length;
    if ($('chatRuleCount')) $('chatRuleCount').textContent = (c.rules || []).length;
    const badge = $('logicBadge');
    if (!badge) return;
    try { validateRawXml(currentXml(c)); badge.textContent = 'Logic OK'; badge.classList.remove('warn'); }
    catch (_) { badge.textContent = 'Logic warning'; badge.classList.add('warn'); }
  }

  async function sendMessage(forced = '', options = {}) {
    if (state.busy) return;
    const input = $('chatInput');
    const text = String(forced || input?.value || '').trim();
    if (!text) return;
    if (!selectedModel()) { setStatus('Choose a model first.', 'error'); addMessage('system', 'Choose a model before sending.'); return; }
    if (!token()) { setStatus('Enter API token first.', 'error'); addMessage('system', 'Enter your API token before sending.'); return; }
    if (input && !forced) input.value = '';

    addMessage('user', options.retry ? `↻ Retry: ${text}` : text);
    const pending = addMessage('system', '⏳ AI is editing the complete wheel XML…', 'Preparing XML · 0s elapsed');
    const mode = requestMode(text);
    startWork(mode === 'edit' ? 'Preparing complete wheel XML' : 'Preparing complete XML for analysis');
    try {
      if (mode === 'analysis') {
        const reply = await analyzeUsingXml(text);
        pending?.remove();
        addMessage('assistant', reply, '✓ Checked · no wheel changes');
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        state.history = state.history.slice(-8);
        state.lastFailed = null;
        setStatus('Check completed.', 'ok');
      } else {
        const diff = await editUsingXml(text, !!options.strict);
        pending?.remove();
        const detail = diff.details?.length ? diff.details.slice(0, 12).join(' · ') : diff.text;
        const reply = `Applied the corrected wheel XML. ${detail}.`;
        addMessage('assistant', reply, `✓ XML applied · ${diff.text}`);
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        state.history = state.history.slice(-8);
        state.lastFailed = null;
        setStatus(`XML applied · ${diff.text}.`, 'ok');
      }
    } catch (error) {
      pending?.remove();
      state.lastFailed = text;
      addMessage('assistant', `I could not complete that request: ${error.message}`, 'Not applied', text);
      setStatus(`Request failed: ${error.message}`, 'error');
    } finally {
      stopWork();
      input?.focus();
    }
  }

  function undoLast() {
    if (!state.undo) return;
    D.replace(state.undo.config);
    const saved = M.saveConfig(state.undo.config);
    M.resetSession(saved);
    S?.save?.(state.undo.spin);
    state.undo = null;
    if ($('undoAiBtn')) $('undoAiBtn').disabled = true;
    refreshStats();
    addMessage('system', 'Last AI XML edit undone.');
    setStatus('Last AI edit undone.', 'ok');
    window.dispatchEvent(new CustomEvent('fortune-ai-applied', { detail: { count: 0, undo: true } }));
  }
  function clearChat() {
    state.history = [];
    const box = $('chatMessages');
    if (box) box.innerHTML = '';
    addMessage('system', 'Chat cleared. Every edit still receives the complete current wheel XML.');
  }

  function install() {
    injectStyles();
    refreshStats();
    $('loadModelsBtn')?.addEventListener('click', loadModels);
    $('modelFilter')?.addEventListener('input', renderModels);
    $('testAiBtn')?.addEventListener('click', testApi);
    $('sendAiBtn')?.addEventListener('click', () => sendMessage());
    $('undoAiBtn')?.addEventListener('click', undoLast);
    $('clearChatBtn')?.addEventListener('click', clearChat);
    $('chatInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    });
    $('chatMessages')?.addEventListener('click', event => {
      const button = event.target.closest('.ai-retry-btn');
      if (!button) return;
      const text = button.dataset.retryText || state.lastFailed || '';
      if (text) sendMessage(text, { retry: true, strict: true });
    });
    $('aiProvider')?.addEventListener('change', () => {
      const suggested = providerDefaults(provider());
      if (suggested && $('aiEndpoint')) $('aiEndpoint').value = suggested;
      state.models = [];
      renderModels();
    });
    $('toggleToken')?.addEventListener('click', () => {
      const field = $('aiToken');
      if (!field) return;
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      $('toggleToken').textContent = show ? 'Hide' : 'Show';
    });
    document.querySelectorAll('[data-ai-command]').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.aiCommand || '')));

    addMessage('system', 'AI XML mode ready. Edit requests now use one full-XML edit, a small JSON QA check, and only one targeted XML correction if something is missing. Previous full-XML-vs-full-XML verification has been removed.');
    if ($('aiModel')?.dataset.restoreModel) setTimeout(loadModels, 120);
    if ($('aiStatus')?.parentElement && !$('aiStatus').parentElement.querySelector('.ai-engine-note')) {
      const note = document.createElement('div');
      note.className = 'ai-engine-note';
      note.textContent = 'Edit flow: full XML → edit → local structural validation → compact QA → optional targeted correction → save. The status also shows an estimated XML/context token budget when available.';
      $('aiStatus').insertAdjacentElement('afterend', note);
    }
  }

  window.FortuneAiEditorEngine = {
    loadModels, testApi, sendMessage, refreshStats, requestMode,
    engineGuide: ENGINE_GUIDE, currentXml, estimateTokens, contextLimit
  };
  install();
})();