(() => {
  'use strict';

  const provider = document.getElementById('aiProvider');
  const endpointInput = document.getElementById('aiEndpoint');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const status = document.getElementById('aiStatus');
  if (!provider || !endpointInput) return;

  // Allow the UI to accept either a provider base URL (for example /api/v1)
  // or a complete OpenAI-compatible /chat/completions endpoint.
  const originalFetch = window.fetch.bind(window);

  function normalizedChatUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return raw;
    try {
      const url = new URL(raw, location.href);
      const path = url.pathname.replace(/\/+$/, '');
      if (/\/(chat\/completions|responses)$/i.test(path)) return url.toString();
      if (/\/(?:api\/)?v\d+(?:\.\d+)?$/i.test(path)) {
        url.pathname = `${path}/chat/completions`;
        return url.toString();
      }
      return url.toString();
    } catch (_) {
      return raw;
    }
  }

  window.fetch = async function fortuneEndpointAwareFetch(input, init = {}) {
    let requestInput = input;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method === 'POST') {
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      const fixed = normalizedChatUrl(rawUrl);
      if (fixed && fixed !== rawUrl) {
        if (input instanceof Request) requestInput = new Request(fixed, input);
        else requestInput = fixed;
      }
    }

    try {
      return await originalFetch(requestInput, init);
    } catch (error) {
      const attempted = typeof requestInput === 'string' ? requestInput : requestInput?.url || '';
      if (error instanceof TypeError) {
        throw new Error(`Browser could not reach ${attempted || 'the AI endpoint'}. Check the endpoint and CORS policy. If this is NanoGPT, use https://nano-gpt.com/api/v1 (the app will add /chat/completions automatically).`);
      }
      throw error;
    }
  };

  // Add a first-class NanoGPT preset without disturbing saved/current selections.
  if (![...provider.options].some(option => option.value === 'nanogpt')) {
    const option = document.createElement('option');
    option.value = 'nanogpt';
    option.textContent = 'NanoGPT';
    provider.insertBefore(option, provider.querySelector('option[value="custom"]') || null);
  }

  const endpointLabel = endpointInput.closest('label.field');
  if (endpointLabel) {
    for (const node of endpointLabel.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = 'API base URL or chat endpoint\n          ';
        break;
      }
    }
    const hint = document.createElement('small');
    hint.className = 'endpoint-resolve-hint';
    hint.style.cssText = 'display:block;margin-top:5px;color:var(--muted2);font-size:.61rem;line-height:1.4';
    endpointLabel.appendChild(hint);

    const refreshHint = () => {
      const raw = endpointInput.value.trim();
      const resolved = normalizedChatUrl(raw);
      hint.textContent = raw && resolved !== raw ? `Chat requests → ${resolved}` : 'You may enter a full /chat/completions URL or a base URL ending in /v1.';
    };
    endpointInput.addEventListener('input', refreshHint);
    refreshHint();
  }

  function applyProviderPreset() {
    if (provider.value !== 'nanogpt') return;
    endpointInput.value = 'https://nano-gpt.com/api/v1';
    endpointInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (status) status.textContent = 'NanoGPT selected. Load models, choose one, then press Test AI.';
    setTimeout(() => loadModelsBtn?.click(), 0);
  }

  provider.addEventListener('change', applyProviderPreset);

  // Recognize a manually entered NanoGPT URL and make the provider selection clearer.
  endpointInput.addEventListener('change', () => {
    try {
      const host = new URL(endpointInput.value).hostname.toLowerCase();
      if (host === 'nano-gpt.com' || host.endsWith('.nano-gpt.com')) {
        provider.value = 'nanogpt';
      }
    } catch (_) {}
  });
})();
