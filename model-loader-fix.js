(() => {
  'use strict';

  const provider = document.getElementById('aiProvider');
  const endpoint = document.getElementById('aiEndpoint');
  const modelSelect = document.getElementById('aiModel');
  const oldLoadButton = document.getElementById('loadModelsBtn');
  const oldFilter = document.getElementById('modelFilter');
  const status = document.getElementById('aiStatus');
  const token = document.getElementById('aiToken');
  if (!provider || !endpoint || !modelSelect || !oldLoadButton || !oldFilter) return;

  // Replace these two controls so the older loader/filter listeners cannot run in parallel.
  const loadButton = oldLoadButton.cloneNode(true);
  oldLoadButton.replaceWith(loadButton);
  const filter = oldFilter.cloneNode(true);
  oldFilter.replaceWith(filter);

  let models = [];

  function setStatus(text, type = '') {
    if (!status) return;
    status.textContent = text;
    status.className = `ai-status ${type}`.trim();
  }

  function modelsUrl() {
    if (provider.value === 'nanogpt') return 'https://nano-gpt.com/api/v1/models?detailed=true';
    if (provider.value === 'openrouter') return 'https://openrouter.ai/api/v1/models';

    const raw = endpoint.value.trim().replace(/\/+$/, '');
    if (!raw) return '';
    try {
      const url = new URL(raw);
      let path = url.pathname.replace(/\/+$/, '');
      path = path.replace(/\/chat\/completions$/i, '').replace(/\/responses$/i, '').replace(/\/models$/i, '');
      url.pathname = `${path}/models`.replace(/\/+/g, '/');
      return url.toString();
    } catch (_) {
      return raw + '/models';
    }
  }

  function normalizeRaw(data) {
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.data)) raw = data.data;
    else if (Array.isArray(data?.models)) raw = data.models;
    else if (data?.data && typeof data.data === 'object') raw = Object.values(data.data);
    else if (data?.models && typeof data.models === 'object') raw = Object.values(data.models);

    return raw.map(entry => {
      if (typeof entry === 'string') return { id: entry, name: entry };
      if (!entry || typeof entry !== 'object') return null;
      const id = entry.id || entry.model || entry.slug || entry.name;
      if (!id) return null;
      return { ...entry, id: String(id), name: entry.name || entry.display_name || entry.displayName || String(id) };
    }).filter(Boolean);
  }

  function isTextModel(model) {
    const id = String(model.id || '').toLowerCase();
    if (!id || /embedding|rerank|tts|speech|transcri|image|video/.test(id)) return false;
    const outputs = model.architecture?.output_modalities || model.output_modalities || model.modalities?.output;
    if (Array.isArray(outputs) && outputs.length && !outputs.includes('text')) return false;
    return true;
  }

  function labelFor(model) {
    const name = model.name || model.id;
    const pieces = [name];
    if (model.id && model.id !== name) pieces.push(model.id);
    const ctx = Number(model.context_length || model.context_window || model.contextLength || 0);
    if (ctx) pieces.push(`${Math.round(ctx / 1000)}k ctx`);
    return pieces.filter(Boolean).join(' · ');
  }

  function render() {
    const previous = modelSelect.value;
    const q = filter.value.trim().toLowerCase();
    const visible = models.filter(model => !q || `${model.id} ${model.name || ''} ${model.description || ''}`.toLowerCase().includes(q));
    modelSelect.innerHTML = '';

    if (!visible.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = models.length ? `No models match “${filter.value.trim()}”` : 'No models loaded';
      modelSelect.appendChild(option);
      return;
    }

    visible.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = labelFor(model);
      modelSelect.appendChild(option);
    });
    if ([...modelSelect.options].some(option => option.value === previous)) modelSelect.value = previous;
  }

  async function requestCatalog(url, withAuth) {
    const headers = {};
    if (withAuth && token?.value.trim()) headers.Authorization = `Bearer ${token.value.trim()}`;
    const response = await fetch(url, { method: 'GET', headers });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {
      throw new Error(`Model endpoint returned non-JSON data (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `Model endpoint returned HTTP ${response.status}.`);
    return data;
  }

  async function loadModels() {
    const url = modelsUrl();
    if (!/^https:\/\//i.test(url)) {
      setStatus('Enter a valid HTTPS API base URL first.', 'error');
      return;
    }

    loadButton.disabled = true;
    loadButton.textContent = 'Loading…';
    setStatus(`Loading models from ${url.replace(/\?.*$/, '')}…`, 'working');

    try {
      let data;
      // NanoGPT and OpenRouter publish public catalogs. Avoid Authorization/CORS preflight there.
      if (provider.value === 'nanogpt' || provider.value === 'openrouter') {
        data = await requestCatalog(url, false);
      } else {
        try {
          data = await requestCatalog(url, !!token?.value.trim());
        } catch (firstError) {
          // Some custom providers expose /models publicly even when chat requires a key.
          if (token?.value.trim()) data = await requestCatalog(url, false);
          else throw firstError;
        }
      }

      const normalized = normalizeRaw(data);
      models = normalized.filter(isTextModel).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
      render();

      if (!models.length) {
        setStatus('The model endpoint answered, but no text models were recognized. Send me this message and I can adapt the response parser.', 'error');
      } else {
        const shown = [...modelSelect.options].filter(option => option.value).length;
        setStatus(`Loaded ${models.length} text models${filter.value.trim() ? ` · ${shown} match the search` : ''}.`, 'ok');
      }
    } catch (error) {
      console.error('Model catalog load failed:', error);
      setStatus(`Could not load models: ${error.message || 'unknown error'}`, 'error');
    } finally {
      loadButton.disabled = false;
      loadButton.textContent = '↻ Load models';
    }
  }

  filter.addEventListener('input', render);
  loadButton.addEventListener('click', loadModels);
  provider.addEventListener('change', () => {
    models = [];
    filter.value = '';
    render();
  });

  // Expose for debugging in the browser console without exposing the token.
  window.FortuneModelCatalog = { reload: loadModels, get count() { return models.length; }, get url() { return modelsUrl(); } };
})();