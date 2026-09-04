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
    phase: 'Ready', undo: null, lastFailed: null
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

  function setPhase(phase) {
    state.phase = phase;
    updateHeartbeat();
  }

  function updateHeartbeat() {
    if (!state.busy) return;
    const seconds = Math.floor((performance.now() - state.started) / 1000);
    if ($('sendAiBtn')) $('sendAiBtn').textContent = `⏳ Working… ${seconds}s`;
    setStatus(`${state.phase}… ${seconds}s`, 'working');
    const pending = $('chatMessages')?.querySelector('.ai-chat-message.system:last-child .ai-chat-meta');
    if (pending) pending.textContent = `${state.phase} · ${seconds}s elapsed`;
  }

  function startWork(phase) {
    state.busy = true;
    state.started = performance.now();
    state.phase = phase;
    ['sendAiBtn', 'testAiBtn', 'loadModelsBtn'].forEach(id => {
      const node = $(id);
      if (node) node.disabled = true;
    });
    if ($('chatInput')) $('chatInput').disabled = true;
    clearInterval(state.timer);
    updateHeartbeat();
    state.timer = setInterval(updateHeartbeat, 1000);
  }

  function stopWork() {
    state.busy = false;
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
    } catch (_) {
      return `${raw}/models`;
    }
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
    } catch (_) {
      return raw;
    }
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
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeModels(data) {
    let list = Array.isArray(data) ? data
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.models) ? data.models
      : data?.data && typeof data.data === 'object' ? Object.values(data.data)
      : data?.models && typeof data.models === 'object' ? Object.values(data.models)
      : [];
    return list.map(value => {
      if (typeof value === 'string') return { id: value, name: value };
      if (!value || typeof value !== 'object') return null;
      const id = String(value.id || value.model || value.slug || value.name || '');
      if (!id) return null;
      return { ...value, id, name: value.name || value.display_name || value.displayName || id };
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
      if (provider() === 'nanogpt' || provider() === 'openrouter') {
        data = await fetchJson(url, { method: 'GET' }, 45000);
      } else {
        try { data = await fetchJson(url, { method: 'GET', headers: headers(false, true) }, 45000); }
        catch (_) { data = await fetchJson(url, { method: 'GET' }, 45000); }
      }
      state.models = normalizeModels(data).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
      renderModels();
      setStatus(`Loaded ${state.models.length} models.`, 'ok');
    } catch (error) {
      setStatus(`Could not load models: ${error.message}`, 'error');
    } finally {
      stopWork();
    }
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
    const maxTokens = options.maxTokens ?? 6000;
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
      setStatus(`Connected · ${used} · ${seconds}s · ${result.text.trim().slice(0, 50)}`, 'ok');
      addMessage('system', `✓ API test passed in ${seconds}s with ${used}.`);
    } catch (error) {
      setStatus(`Test failed: ${error.message}`, 'error');
      addMessage('system', `✕ API test failed: ${error.message}`);
    } finally {
      stopWork();
    }
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

  function currentConfig() {
    return clone(window.FortuneEditor?.getDraft?.() || M.loadConfig());
  }

  function addSpinToXml(xmlText, spin = S?.load?.() || {}) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.querySelector('parsererror')) return String(xmlText);
    const node = doc.querySelector('settings');
    if (!node) return String(xmlText);
    const attrs = {
      maxTurns: spin.maxTurns,
      spinUpMinSeconds: spin.spinUpMinSeconds,
      spinUpMaxSeconds: spin.spinUpMaxSeconds,
      spinDownMinSeconds: spin.spinDownMinSeconds,
      spinDownMaxSeconds: spin.spinDownMaxSeconds,
      dramaEnabled: spin.dramaEnabled,
      dramaChance: spin.dramaChance,
      dramaCreepMinDegrees: spin.dramaCreepMinDegrees,
      dramaCreepMaxDegrees: spin.dramaCreepMaxDegrees,
      showSlowIcon: spin.showSlowIcon,
      iconPreviewStartPercent: spin.iconPreviewStartPercent
    };
    Object.entries(attrs).forEach(([key, value]) => {
      if (value != null) node.setAttribute(key, String(value));
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc.documentElement);
  }

  function currentXml(config = currentConfig(), spin = S?.load?.() || {}) {
    return addSpinToXml(M.configToXml(config), spin);
  }

  function readSpinFromXml(xmlText, fallback = S?.load?.() || {}) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    const node = doc.querySelector('settings');
    if (!node) return clone(fallback);
    const number = (name, old) => node.hasAttribute(name) ? Number(node.getAttribute(name)) : old;
    const bool = (name, old) => node.hasAttribute(name) ? node.getAttribute(name) === 'true' : old;
    return {
      ...clone(fallback),
      maxTurns: number('maxTurns', fallback.maxTurns),
      spinUpMinSeconds: number('spinUpMinSeconds', fallback.spinUpMinSeconds),
      spinUpMaxSeconds: number('spinUpMaxSeconds', fallback.spinUpMaxSeconds),
      spinDownMinSeconds: number('spinDownMinSeconds', fallback.spinDownMinSeconds),
      spinDownMaxSeconds: number('spinDownMaxSeconds', fallback.spinDownMaxSeconds),
      dramaEnabled: bool('dramaEnabled', fallback.dramaEnabled),
      dramaChance: number('dramaChance', fallback.dramaChance),
      dramaCreepMinDegrees: number('dramaCreepMinDegrees', fallback.dramaCreepMinDegrees),
      dramaCreepMaxDegrees: number('dramaCreepMaxDegrees', fallback.dramaCreepMaxDegrees),
      showSlowIcon: bool('showSlowIcon', fallback.showSlowIcon),
      iconPreviewStartPercent: number('iconPreviewStartPercent', fallback.iconPreviewStartPercent)
    };
  }

  const ENGINE_GUIDE = `FORTUNE ENGINE — COMPLETE XML EDITING MODEL

The XML document is the complete source of truth for the wheel configuration. For EDIT requests you receive the whole current XML and must return the whole corrected XML.

1. ELIGIBILITY
A forfeit can appear only when its group is active, enabled=true, its <requires> condition is satisfied, it has not been removed by lifetime behavior, cooldown is zero, and any spin lifetime is still active. Weight is relative only among currently eligible entries.

2. GROUPS
<group> is a broad thematic/game-state container such as Start, Clothing, Humiliation, Disgusting, Cleaning or Strip Show. A forfeit's group="..." attribute assigns it to one broad group. Do not create groups merely to express simple ordering between individual forfeits.

3. AVAILABILITY / DEPENDENCIES
Inside a <forfeit>, <requires mode="all|any"> contains <forfeit ref="ID"/> prerequisites. Those referenced results must have happened earlier in the current play session before this forfeit can appear.
- A -> B means B requires A.
- If A must happen before BOTH B and C, but B and C may happen in either order or independently, then B requires A and C requires A. Do NOT make B require C or C require B.
- For a simple sequence A -> B -> C, B requires A and C normally requires B only.
- mode="all" means all listed prerequisites; mode="any" means at least one.
- Never create self or circular dependencies.
- If no prerequisite is needed, omit <requires> entirely.

Example for the user's clothing logic: if Shoes Off must happen before Socks Off and Trousers Off, while socks and trousers can otherwise happen in either order, configure BOTH Socks Off and Trousers Off with a prerequisite on Shoes Off, and no dependency between Socks Off and Trousers Off.

4. LIFETIME / COOLDOWN
lifetime="once" removes a result after it is selected once. lifetime="forever" keeps it. lifetime="spins" uses lifetimeSpins. cooldown temporarily suppresses a previously selected item for N completed spins. Do not change these unless requested or needed for the intended progression.

5. GROUP UNLOCKS
<unlocks><group ref="ID"/></unlocks> on a forfeit activates broad groups when that result is selected. <rules> are for broad group activation after ALL/ANY result conditions, not ordinary item-to-item ordering. minOccurrences may require repeated hits.

6. MYSTERY
mystery="true" only hides the real item on the wheel. The real hidden result must still be stored in that forfeit's name, icon and description. It is revealed after selection.

7. SPECIAL EVENTS
Preserve eventType unless the user asks to change it. Valid values include normal, spinAgain, unlock, doubleSpin, immunity and randomize.

8. SPIN SETTINGS
The <settings> element also contains maxTurns, spinUpMinSeconds, spinUpMaxSeconds, spinDownMinSeconds, spinDownMaxSeconds, dramaEnabled, dramaChance, dramaCreepMinDegrees, dramaCreepMaxDegrees, showSlowIcon and iconPreviewStartPercent. Preserve them unless the user asks to change spin behavior.

9. EDITING RULES
- Read the entire XML before editing.
- Preserve every unrelated group, forfeit, rule, attribute and description.
- Reuse exact existing IDs for existing objects.
- You MAY add a missing forfeit when the user says something is missing. Give it a unique lowercase ASCII id using letters, numbers and hyphens.
- When adding a missing item, infer its broad group from the user's request and existing groups. Prefer an existing appropriate group.
- When the user says 'check ... and fix/adapt/make right', this is an EDIT request.
- If an existing dependency contradicts the user's stated logic, correct the <requires> element.
- Never merely describe what should change. The returned XML itself must contain the changes.
- Do not omit unchanged XML just to save space.
- Do not return a partial fragment.

10. OUTPUT FOR EDIT MODE
Return ONLY one complete XML document beginning with <fortuneEngine or an XML declaration and ending with </fortuneEngine>. No markdown fences. No explanation before or after it.`;

  function extractXml(text) {
    let raw = String(text || '').trim();
    raw = raw.replace(/^```(?:xml)?\s*/i, '').replace(/\s*```$/i, '');
    const start = raw.indexOf('<fortuneEngine');
    const declaration = raw.indexOf('<?xml');
    const from = declaration >= 0 && declaration < start ? declaration : start;
    const endTag = '</fortuneEngine>';
    const end = raw.lastIndexOf(endTag);
    if (start < 0 || end < 0 || end < start) throw new Error('The AI did not return a complete Fortune Engine XML document.');
    return raw.slice(from >= 0 ? from : start, end + endTag.length).trim();
  }

  function validateRawXml(xmlText) {
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('The AI returned malformed XML.');
    if (doc.documentElement?.tagName !== 'fortuneEngine') throw new Error('Returned XML root must be <fortuneEngine>.');
    if (!doc.querySelector('fortuneEngine > settings')) throw new Error('Returned XML has no <settings> element.');

    const groups = [...doc.querySelectorAll('groups > group')];
    const forfeits = [...doc.querySelectorAll('forfeits > forfeit')];
    const groupIds = groups.map(node => node.getAttribute('id')).filter(Boolean);
    const forfeitIds = forfeits.map(node => node.getAttribute('id')).filter(Boolean);
    if (!groups.length) throw new Error('Returned XML must contain at least one group.');
    if (groupIds.length !== groups.length || new Set(groupIds).size !== groupIds.length) throw new Error('Returned XML contains missing or duplicate group IDs.');
    if (forfeitIds.length !== forfeits.length || new Set(forfeitIds).size !== forfeitIds.length) throw new Error('Returned XML contains missing or duplicate forfeit IDs.');

    const groupSet = new Set(groupIds);
    const forfeitSet = new Set(forfeitIds);
    const graph = new Map(forfeitIds.map(id => [id, []]));

    forfeits.forEach(node => {
      const id = node.getAttribute('id');
      const group = node.getAttribute('group');
      if (!groupSet.has(group)) throw new Error(`Forfeit ${id} references missing group ${group || '(empty)'}.`);
      [...node.querySelectorAll(':scope > unlocks > group')].forEach(refNode => {
        const ref = refNode.getAttribute('ref');
        if (!groupSet.has(ref)) throw new Error(`Forfeit ${id} unlocks missing group ${ref}.`);
      });
      const req = node.querySelector(':scope > requires');
      if (req && !['all', 'any'].includes(req.getAttribute('mode') || 'all')) throw new Error(`Forfeit ${id} has invalid requires mode.`);
      [...(req?.querySelectorAll(':scope > forfeit') || [])].forEach(refNode => {
        const ref = refNode.getAttribute('ref');
        if (!forfeitSet.has(ref)) throw new Error(`Forfeit ${id} requires missing forfeit ${ref}.`);
        if (ref === id) throw new Error(`Forfeit ${id} cannot require itself.`);
        graph.get(id).push(ref);
      });
    });

    [...doc.querySelectorAll('rules > rule')].forEach(rule => {
      const id = rule.getAttribute('id') || '(unnamed rule)';
      [...rule.querySelectorAll(':scope > conditions > forfeit')].forEach(node => {
        const ref = node.getAttribute('ref');
        if (!forfeitSet.has(ref)) throw new Error(`Rule ${id} references missing forfeit ${ref}.`);
      });
      [...rule.querySelectorAll(':scope > unlocks > group')].forEach(node => {
        const ref = node.getAttribute('ref');
        if (!groupSet.has(ref)) throw new Error(`Rule ${id} references missing group ${ref}.`);
      });
    });

    const visiting = new Set();
    const visited = new Set();
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

  function stableConfig(config) {
    return JSON.stringify(M.sanitizeConfig(clone(config)));
  }

  function diffSummary(before, after, beforeSpin, afterSpin) {
    const oldF = new Map(before.forfeits.map(x => [x.id, x]));
    const newF = new Map(after.forfeits.map(x => [x.id, x]));
    const oldG = new Map(before.levels.map(x => [x.id, x]));
    const newG = new Map(after.levels.map(x => [x.id, x]));
    const oldR = new Map((before.rules || []).map(x => [x.id, x]));
    const newR = new Map((after.rules || []).map(x => [x.id, x]));
    const addedF = [...newF.keys()].filter(id => !oldF.has(id)).length;
    const removedF = [...oldF.keys()].filter(id => !newF.has(id)).length;
    const changedF = [...newF.keys()].filter(id => oldF.has(id) && JSON.stringify(oldF.get(id)) !== JSON.stringify(newF.get(id))).length;
    const addedG = [...newG.keys()].filter(id => !oldG.has(id)).length;
    const removedG = [...oldG.keys()].filter(id => !newG.has(id)).length;
    const changedG = [...newG.keys()].filter(id => oldG.has(id) && JSON.stringify(oldG.get(id)) !== JSON.stringify(newG.get(id))).length;
    const changedR = [...new Set([...oldR.keys(), ...newR.keys()])].filter(id => JSON.stringify(oldR.get(id)) !== JSON.stringify(newR.get(id))).length;
    const spinChanged = JSON.stringify(beforeSpin || {}) !== JSON.stringify(afterSpin || {});
    const total = addedF + removedF + changedF + addedG + removedG + changedG + changedR + (spinChanged ? 1 : 0);
    const parts = [];
    if (addedF) parts.push(`${addedF} forfeit${addedF === 1 ? '' : 's'} added`);
    if (changedF) parts.push(`${changedF} forfeit${changedF === 1 ? '' : 's'} updated`);
    if (removedF) parts.push(`${removedF} forfeit${removedF === 1 ? '' : 's'} removed`);
    if (addedG || changedG || removedG) parts.push(`${addedG + changedG + removedG} group change${addedG + changedG + removedG === 1 ? '' : 's'}`);
    if (changedR) parts.push(`${changedR} rule change${changedR === 1 ? '' : 's'}`);
    if (spinChanged) parts.push('spin settings updated');
    return { total, text: parts.join(' · ') || 'no configuration differences' };
  }

  function restoreSidecar(config) {
    try { D.replace(config); } catch (_) {}
  }

  function parseReturnedConfig(xmlText, fallbackSpin) {
    validateRawXml(xmlText);
    let config;
    try { config = M.xmlToConfig(xmlText); }
    catch (error) { throw new Error(`Could not import returned XML: ${error.message}`); }
    const spin = readSpinFromXml(xmlText, fallbackSpin);
    return { config, spin };
  }

  function xmlSystemPrompt(strict = false) {
    return `${ENGINE_GUIDE}\n\n${strict ? 'STRICT RETRY: The previous attempt was invalid, incomplete, or unchanged. You MUST actually perform the requested edits in the returned full XML.\n' : ''}Preserve the complete XML schema. Return only the full corrected XML.`;
  }

  async function requestEditedXml(text, sourceXml, strict = false) {
    setPhase(strict ? 'Retrying full XML edit' : 'Sending complete XML to AI');
    const recent = state.history.slice(-4);
    const messages = [
      { role: 'system', content: xmlSystemPrompt(strict) },
      ...recent,
      {
        role: 'user',
        content: `USER REQUEST\n${text}\n\nCURRENT COMPLETE WHEEL XML\n${sourceXml}`
      }
    ];
    const result = await complete(messages, { maxTokens: 14000, temperature: 0, timeoutMs: 300000 });
    return extractXml(result.text);
  }

  async function editUsingXml(text, strictRetry = false) {
    const before = currentConfig();
    const beforeSpin = clone(S?.load?.() || {});
    const sourceXml = currentXml(before, beforeSpin);
    const snapshot = stableConfig(before);

    let returnedXml;
    try {
      returnedXml = await requestEditedXml(text, sourceXml, strictRetry);
    } catch (error) {
      if (strictRetry) throw error;
      setPhase('Automatic XML retry');
      returnedXml = await requestEditedXml(text, sourceXml, true);
    }

    setPhase('Validating complete returned XML');
    let parsed;
    try {
      parsed = parseReturnedConfig(returnedXml, beforeSpin);
    } catch (error) {
      restoreSidecar(before);
      if (strictRetry) throw error;
      setPhase('Repairing invalid XML with AI');
      const repair = await complete([
        { role: 'system', content: xmlSystemPrompt(true) },
        { role: 'user', content: `The XML below failed validation with this error: ${error.message}\n\nUSER REQUEST\n${text}\n\nORIGINAL XML\n${sourceXml}\n\nBAD XML\n${returnedXml}\n\nReturn one complete corrected valid XML document only.` }
      ], { maxTokens: 14000, temperature: 0, timeoutMs: 300000 });
      returnedXml = extractXml(repair.text);
      parsed = parseReturnedConfig(returnedXml, beforeSpin);
    }

    const diff = diffSummary(before, parsed.config, beforeSpin, parsed.spin);
    if (!diff.total) {
      restoreSidecar(before);
      if (strictRetry) throw new Error('The AI returned valid XML but made no changes.');
      setPhase('AI returned unchanged XML — retrying');
      returnedXml = await requestEditedXml(text, sourceXml, true);
      parsed = parseReturnedConfig(returnedXml, beforeSpin);
      const retryDiff = diffSummary(before, parsed.config, beforeSpin, parsed.spin);
      if (!retryDiff.total) {
        restoreSidecar(before);
        throw new Error('The AI returned the complete XML but still made no changes.');
      }
      return applyXmlResult(before, beforeSpin, snapshot, parsed.config, parsed.spin, retryDiff);
    }

    return applyXmlResult(before, beforeSpin, snapshot, parsed.config, parsed.spin, diff);
  }

  function applyXmlResult(before, beforeSpin, snapshot, nextConfig, nextSpin, diff) {
    const liveDraft = currentConfig();
    if (stableConfig(liveDraft) !== snapshot) {
      restoreSidecar(liveDraft);
      throw new Error('The wheel was manually changed while the AI was working. Nothing was overwritten. Retry the request to use the newest editor state.');
    }

    setPhase('Applying complete corrected XML');
    state.undo = { config: before, spin: beforeSpin };
    D.replace(nextConfig);
    const saved = M.saveConfig(nextConfig);
    M.resetSession(saved);
    if (S?.save) S.save(nextSpin);
    if ($('undoAiBtn')) $('undoAiBtn').disabled = false;
    refreshStats();
    window.dispatchEvent(new CustomEvent('fortune-ai-applied', { detail: { count: diff.total, xml: true } }));
    return diff;
  }

  async function analyzeUsingXml(text) {
    const xml = currentXml();
    setPhase('Analyzing complete wheel XML');
    const result = await complete([
      {
        role: 'system',
        content: `${ENGINE_GUIDE}\n\nANALYSIS MODE: Do not modify anything and do not return XML. Answer the user's question clearly and concretely based only on the supplied complete wheel XML. Mention exact forfeit/group names when useful.`
      },
      ...state.history.slice(-4),
      { role: 'user', content: `USER QUESTION\n${text}\n\nCURRENT COMPLETE WHEEL XML\n${xml}` }
    ], { maxTokens: 3500, temperature: 0.1, timeoutMs: 240000 });
    return result.text.trim();
  }

  function refreshStats() {
    const c = M.loadConfig();
    if ($('chatGroupCount')) $('chatGroupCount').textContent = c.levels.length;
    if ($('chatForfeitCount')) $('chatForfeitCount').textContent = c.forfeits.length;
    if ($('chatRuleCount')) $('chatRuleCount').textContent = (c.rules || []).length;
    const badge = $('logicBadge');
    if (!badge) return;
    try {
      validateRawXml(currentXml(c));
      badge.textContent = 'Logic OK';
      badge.classList.remove('warn');
    } catch (_) {
      badge.textContent = 'Logic warning';
      badge.classList.add('warn');
    }
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
    const pending = addMessage('system', '⏳ AI is working with the complete wheel XML…', 'Preparing XML · 0s elapsed');
    const mode = requestMode(text);
    startWork(mode === 'edit' ? 'Preparing complete wheel XML' : 'Preparing complete XML for analysis');

    try {
      if (mode === 'analysis') {
        const reply = await analyzeUsingXml(text);
        pending?.remove();
        addMessage('assistant', reply, '✓ Checked · no wheel changes');
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        state.history = state.history.slice(-6);
        state.lastFailed = null;
        setStatus('Check completed.', 'ok');
      } else {
        const diff = await editUsingXml(text, !!options.strict);
        pending?.remove();
        const reply = `Applied the corrected full wheel XML. ${diff.text}.`;
        addMessage('assistant', reply, `✓ XML applied · ${diff.text}`);
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        state.history = state.history.slice(-6);
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
    addMessage('system', 'Chat cleared. Every new request still receives the complete current wheel XML.');
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
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
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
    document.querySelectorAll('[data-ai-command]').forEach(button => {
      button.addEventListener('click', () => sendMessage(button.dataset.aiCommand || ''));
    });

    addMessage('system', 'AI XML mode ready. Edit requests send the complete current wheel XML to the model, validate the complete returned XML, then refresh the editor immediately.');
    if ($('aiModel')?.dataset.restoreModel) setTimeout(loadModels, 120);
    if ($('aiStatus')?.parentElement && !$('aiStatus').parentElement.querySelector('.ai-engine-note')) {
      const note = document.createElement('div');
      note.className = 'ai-engine-note';
      note.textContent = 'Edit flow: full XML → AI correction → XML validation → save → immediate editor refresh. Retry sends the full XML again with stricter instructions.';
      $('aiStatus').insertAdjacentElement('afterend', note);
    }
  }

  window.FortuneAiEditorEngine = {
    loadModels, testApi, sendMessage, refreshStats, requestMode,
    engineGuide: ENGINE_GUIDE, currentXml
  };
  install();
})();