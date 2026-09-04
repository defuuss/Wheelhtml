(() => {
  'use strict';

  const M = window.FortuneModel;
  const S = window.FortuneSpinStyle;
  if (!M) return;

  const $ = id => document.getElementById(id);
  const state = {
    models: [],
    messages: [],
    pending: false,
    lastUndo: null
  };

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function providerHeaders(includeJson = false) {
    const token = $('aiToken').value.trim();
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if ($('aiProvider').value === 'openrouter') {
      headers['HTTP-Referer'] = location.origin + location.pathname;
      headers['X-Title'] = 'Fortune Engine AI Chat';
    }
    return headers;
  }

  function setStatus(text, type = '') {
    const node = $('aiStatus');
    node.textContent = text;
    node.className = `ai-status ${type}`.trim();
  }

  function toast(text) {
    const node = $('aiToast');
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function chatEndpoint() {
    return $('aiEndpoint').value.trim();
  }

  function modelsEndpoint() {
    if ($('aiProvider').value === 'openrouter') return 'https://openrouter.ai/api/v1/models';
    const endpoint = chatEndpoint().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(endpoint)) return endpoint.replace(/\/chat\/completions$/i, '/models');
    if (/\/responses$/i.test(endpoint)) return endpoint.replace(/\/responses$/i, '/models');
    return endpoint.replace(/\/+$/, '') + '/models';
  }

  function selectedModel() {
    return $('aiModel').value.trim();
  }

  function modelLabel(model) {
    const name = model.name || model.id || 'Unnamed model';
    const id = model.id || '';
    const ctx = Number(model.context_length || model.context_window || 0);
    const ctxText = ctx ? `${Math.round(ctx / 1000)}k ctx` : '';
    let price = '';
    const prompt = Number(model.pricing?.prompt);
    if (Number.isFinite(prompt) && prompt >= 0) price = `$${(prompt * 1_000_000).toFixed(prompt * 1_000_000 < 1 ? 3 : 2)}/M in`;
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
    const previous = select.value;
    const q = query.trim().toLowerCase();
    const list = state.models.filter(m => !q || `${m.id} ${m.name || ''} ${m.description || ''}`.toLowerCase().includes(q));
    select.innerHTML = '';
    if (!list.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = state.models.length ? 'No models match the filter' : 'Load models first';
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

  async function loadModels() {
    const button = $('loadModelsBtn');
    button.disabled = true;
    button.textContent = 'Loading…';
    setStatus('Loading available models…', 'working');
    try {
      const response = await fetch(modelsEndpoint(), { headers: providerHeaders(false) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `Model list returned HTTP ${response.status}.`);
      const raw = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
      state.models = raw.filter(isChatTextModel).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
      renderModels($('modelFilter').value);
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

  async function completion(messages, maxTokens = 6000) {
    const endpoint = chatEndpoint();
    const model = selectedModel();
    const token = $('aiToken').value.trim();
    if (!/^https:\/\//i.test(endpoint)) throw new Error('Enter a valid HTTPS chat-completions endpoint.');
    if (!model) throw new Error('Choose a model first.');
    if (!token) throw new Error('Enter an API token for this browser session.');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: providerHeaders(true),
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `AI request returned HTTP ${response.status}.`);
    return { text: extractAssistantText(data), data };
  }

  async function testConnection() {
    const button = $('testAiBtn');
    button.disabled = true;
    button.textContent = 'Testing…';
    setStatus('Testing the selected model with a tiny request…', 'working');
    const started = performance.now();
    try {
      const result = await completion([{ role: 'user', content: 'Reply with exactly: OK' }], 16);
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
    return S?.load?.() || { maxTurns: 9, dramaEnabled: true, dramaChance: 35, dramaExtraMinTurns: 1, dramaExtraMaxTurns: 2, showSlowIcon: true };
  }

  function localLogicReport(config) {
    const issues = [];
    const start = new Set(config.levels.filter(l => l.activeAtStart).map(l => l.id));
    if (!start.size) issues.push('No group is active at the start.');
    const reachable = new Set(start);
    let changed = true;
    while (changed) {
      changed = false;
      config.forfeits.forEach(item => {
        if (!item.enabled || !reachable.has(item.levelId)) return;
        (item.unlockLevels || []).forEach(id => {
          if (!reachable.has(id)) { reachable.add(id); changed = true; }
        });
      });
      (config.rules || []).forEach(rule => {
        if (!rule.enabled || !rule.conditionForfeitIds?.length) return;
        const accessible = rule.conditionForfeitIds.map(id => {
          const item = config.forfeits.find(f => f.id === id);
          return !!item && item.enabled && reachable.has(item.levelId);
        });
        const possible = rule.mode === 'any' ? accessible.some(Boolean) : accessible.every(Boolean);
        if (!possible) return;
        (rule.unlockLevels || []).forEach(id => {
          if (!reachable.has(id)) { reachable.add(id); changed = true; }
        });
      });
    }
    config.levels.forEach(level => {
      if (!reachable.has(level.id)) issues.push(`Group “${level.name}” has no reachable unlock path from the starting groups.`);
      const count = config.forfeits.filter(f => f.levelId === level.id && f.enabled).length;
      if (!count) issues.push(`Group “${level.name}” has no enabled forfeits.`);
    });
    config.forfeits.filter(f => f.mystery).forEach(item => {
      const generic = /^(mystery|mystery challenge|mystery forfeit)$/i.test(item.name.trim());
      if (generic) issues.push(`Mystery forfeit “${item.name}” appears to be a placeholder instead of a real hidden result.`);
    });
    return issues;
  }

  function systemPrompt() {
    const config = M.loadConfig();
    const style = spinStyle();
    const localIssues = localLogicReport(config);
    return `You are the interactive configuration assistant inside Fortune Engine, a browser-based weighted wheel game. You are in an ongoing CHAT, not a one-shot generator.

Your job is to understand short natural-language instructions, answer questions about the current wheel, check its logic, and when asked, modify ONLY what the user requested.

CURRENT CONFIGURATION
${JSON.stringify(config)}

CURRENT SPIN STYLE
${JSON.stringify(style)}

LOCAL STATIC LOGIC CHECK
${JSON.stringify(localIssues)}

DATA MODEL RULES
- levels are independent unlock groups, not a linear ladder. Multiple groups can be active together.
- every forfeit belongs to exactly one levelId.
- weight controls actual probability and visual segment size.
- cooldown means unavailable for that many subsequent spins after being selected.
- lifetime.type is forever, once, or spins.
- direct unlocks belong in forfeit.unlockLevels.
- multi-result conditions use rules with mode all/any and conditionForfeitIds.
- mystery=true is only a display mode. The forfeit name, icon and description MUST contain the real hidden result. Before selection the UI hides them as ❓; after selection it reveals the real values.
- animations: zoom, shake, pulse, flash, confetti.
- eventType: normal, spinAgain, unlock, doubleSpin, immunity, randomize.
- at least one group must be activeAtStart=true.
- preserve existing IDs whenever you modify existing items. Create new kebab-case IDs only for new items.
- keep all references valid.
- minSpinSeconds <= maxSpinSeconds; settings.minTurns <= spinStyle.maxTurns.

BEHAVIOR
- If the user asks a question, requests a logic check, or asks for advice, DO NOT modify the wheel unless they also ask for a change.
- If the user asks to add/remove/change something, return the complete updated config and spin style while preserving everything unrelated.
- If a request is ambiguous, ask a concise clarification and use operation "none".
- Explain what you changed in normal conversational language.
- When checking logic, explicitly identify unreachable groups, impossible rules, placeholder mysteries, empty groups, or suspicious weight/cooldown interactions.
- Do not invent changes that were not requested.

RETURN ONLY VALID JSON, no markdown fences, in exactly this shape:
{
  "reply": "normal conversational answer to the user",
  "operation": "none" | "replace",
  "config": null | { complete Fortune Engine config },
  "spinStyle": null | {"maxTurns":9,"dramaEnabled":true,"dramaChance":35,"dramaExtraMinTurns":1,"dramaExtraMaxTurns":2,"showSlowIcon":true},
  "logic": {"status":"ok"|"warning"|"error","findings":["optional finding"]}
}
`;
  }

  function parseJson(text) {
    let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    return JSON.parse(raw);
  }

  function cleanSpinStyle(input, config) {
    const current = spinStyle();
    const src = input || current;
    const minTurns = Math.round(clamp(config.settings?.minTurns, 3, 20, 6));
    const minExtra = Math.round(clamp(src.dramaExtraMinTurns, 1, 3, 1));
    return {
      maxTurns: Math.round(clamp(src.maxTurns, minTurns, 24, Math.max(minTurns, 9))),
      dramaEnabled: src.dramaEnabled !== false,
      dramaChance: Math.round(clamp(src.dramaChance, 0, 100, 35)),
      dramaExtraMinTurns: minExtra,
      dramaExtraMaxTurns: Math.round(clamp(src.dramaExtraMaxTurns, minExtra, 4, Math.max(minExtra, 2))),
      showSlowIcon: src.showSlowIcon !== false
    };
  }

  function sanitizeConfig(raw) {
    if (!raw || !Array.isArray(raw.levels) || !Array.isArray(raw.forfeits)) throw new Error('AI returned an invalid configuration.');
    return M.xmlToConfig(M.configToXml(raw));
  }

  function diff(before, after) {
    const beforeGroups = new Map(before.levels.map(x => [x.id, x]));
    const afterGroups = new Map(after.levels.map(x => [x.id, x]));
    const beforeItems = new Map(before.forfeits.map(x => [x.id, x]));
    const afterItems = new Map(after.forfeits.map(x => [x.id, x]));
    const addedGroups = [...afterGroups.keys()].filter(id => !beforeGroups.has(id)).length;
    const removedGroups = [...beforeGroups.keys()].filter(id => !afterGroups.has(id)).length;
    const addedItems = [...afterItems.keys()].filter(id => !beforeItems.has(id)).length;
    const removedItems = [...beforeItems.keys()].filter(id => !afterItems.has(id)).length;
    const changedItems = [...afterItems.keys()].filter(id => beforeItems.has(id) && JSON.stringify(afterItems.get(id)) !== JSON.stringify(beforeItems.get(id))).length;
    return { addedGroups, removedGroups, addedItems, removedItems, changedItems };
  }

  function addMessage(role, text, meta = '') {
    const row = document.createElement('div');
    row.className = `ai-chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';
    const copy = document.createElement('div');
    copy.className = 'ai-chat-copy';
    copy.textContent = text;
    bubble.appendChild(copy);
    if (meta) {
      const tag = document.createElement('div');
      tag.className = 'ai-chat-meta';
      tag.textContent = meta;
      bubble.appendChild(tag);
    }
    row.appendChild(bubble);
    $('chatMessages').appendChild(row);
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  }

  function addSystemMessage(text) {
    addMessage('system', text);
  }

  function setBusy(busy) {
    state.pending = busy;
    $('sendAiBtn').disabled = busy;
    $('testAiBtn').disabled = busy;
    $('loadModelsBtn').disabled = busy;
    $('chatInput').disabled = busy;
    $('sendAiBtn').textContent = busy ? 'Thinking…' : 'Send';
  }

  async function sendChat(forcedText = '') {
    if (state.pending) return;
    const input = $('chatInput');
    const text = (forcedText || input.value).trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    state.messages.push({ role: 'user', content: text });
    if (state.messages.length > 16) state.messages = state.messages.slice(-16);
    setBusy(true);
    setStatus('AI is reading the current wheel…', 'working');

    try {
      const messages = [
        { role: 'system', content: systemPrompt() },
        ...state.messages
      ];
      const result = await completion(messages, 7000);
      const answer = parseJson(result.text);
      const reply = String(answer.reply || 'Done.');
      let meta = '';

      if (answer.operation === 'replace' && answer.config) {
        const before = M.loadConfig();
        const beforeStyle = spinStyle();
        const next = sanitizeConfig(answer.config);
        const nextStyle = cleanSpinStyle(answer.spinStyle, next);
        const changes = diff(before, next);
        state.lastUndo = { config: before, spinStyle: beforeStyle };
        M.saveConfig(next);
        M.resetSession(next);
        S?.save?.(nextStyle);
        $('undoAiBtn').disabled = false;
        meta = `Applied · +${changes.addedItems} / −${changes.removedItems} forfeits · ${changes.changedItems} changed · +${changes.addedGroups} / −${changes.removedGroups} groups`;
        refreshWheelStats();
      } else {
        meta = 'No wheel changes';
      }

      if (answer.logic?.findings?.length) meta += ` · logic: ${answer.logic.findings.length} finding${answer.logic.findings.length === 1 ? '' : 's'}`;
      addMessage('assistant', reply, meta);
      state.messages.push({ role: 'assistant', content: reply });
      if (state.messages.length > 16) state.messages = state.messages.slice(-16);
      setStatus('Ready.', 'ok');
    } catch (error) {
      addMessage('assistant', `I could not complete that request: ${error.message || 'unknown error'}`, 'Not applied');
      setStatus(error.message || 'AI request failed.', 'error');
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  function undoLastAiEdit() {
    if (!state.lastUndo) return;
    const config = M.saveConfig(state.lastUndo.config);
    M.resetSession(config);
    S?.save?.(state.lastUndo.spinStyle);
    state.lastUndo = null;
    $('undoAiBtn').disabled = true;
    refreshWheelStats();
    addSystemMessage('Last AI edit was undone.');
    toast('AI edit undone.');
  }

  function clearChat() {
    state.messages = [];
    $('chatMessages').innerHTML = '';
    addSystemMessage('Chat cleared. I will continue from the wheel configuration currently saved in your browser.');
  }

  function refreshWheelStats() {
    const config = M.loadConfig();
    const issues = localLogicReport(config);
    $('chatGroupCount').textContent = config.levels.length;
    $('chatForfeitCount').textContent = config.forfeits.length;
    $('chatRuleCount').textContent = config.rules.length;
    $('logicBadge').textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Logic OK';
    $('logicBadge').classList.toggle('warn', !!issues.length);
  }

  function providerChanged() {
    if ($('aiProvider').value === 'openrouter') {
      $('aiEndpoint').value = 'https://openrouter.ai/api/v1/chat/completions';
    }
    state.models = [];
    renderModels();
    setStatus('Provider changed. Load its model list.', '');
  }

  function init() {
    $('aiProvider').addEventListener('change', providerChanged);
    $('loadModelsBtn').addEventListener('click', loadModels);
    $('modelFilter').addEventListener('input', e => renderModels(e.target.value));
    $('testAiBtn').addEventListener('click', testConnection);
    $('toggleToken').addEventListener('click', () => {
      const input = $('aiToken');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      $('toggleToken').textContent = reveal ? 'Hide' : 'Show';
    });
    $('sendAiBtn').addEventListener('click', () => sendChat());
    $('chatInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
    $('clearChatBtn').addEventListener('click', clearChat);
    $('undoAiBtn').addEventListener('click', undoLastAiEdit);
    document.querySelectorAll('[data-ai-command]').forEach(button => button.addEventListener('click', () => sendChat(button.dataset.aiCommand)));
    refreshWheelStats();
    renderModels();
    addSystemMessage('Ready. Load models, choose one, test the connection, then tell me exactly what to add, remove, change, or check.');
    loadModels();
  }

  init();
})();
