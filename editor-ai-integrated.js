(() => {
  'use strict';

  if (window.__fortuneEditorAiIntegrated) return;
  window.__fortuneEditorAiIntegrated = true;

  const TOKEN_KEY = 'fortune-editor-ai-token-1h-v1';
  const PREF_KEY = 'fortune-editor-ai-prefs-v1';
  const OPEN_KEY = 'fortune-editor-ai-open-v1';
  const CHAT_KEY = 'fortune-editor-ai-chat-v1';
  const TTL = 60 * 60 * 1000;
  const $ = id => document.getElementById(id);

  function addStyles() {
    if (!document.querySelector('link[data-editor-ai-chat-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'ai-chat.css?v=2';
      link.dataset.editorAiChatCss = '1';
      document.head.appendChild(link);
    }
    const style = document.createElement('style');
    style.textContent = `
      .editor-ai-overlay{position:fixed;inset:0;background:rgba(2,5,12,.52);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:.2s;z-index:1180}
      .editor-ai-overlay.open{opacity:1;pointer-events:auto}
      .editor-ai-panel{position:fixed;top:0;right:0;width:min(720px,97vw);height:100dvh;background:linear-gradient(180deg,#0b1020,#070a12);border-left:1px solid rgba(101,216,255,.18);box-shadow:-24px 0 70px rgba(0,0,0,.48);z-index:1190;transform:translateX(102%);transition:transform .24s ease;display:flex;flex-direction:column;overflow:hidden}
      .editor-ai-panel.open{transform:translateX(0)}
      .editor-ai-panel-head{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid rgba(255,255,255,.07)}
      .editor-ai-panel-head h2{margin:3px 0 0;font-size:1.05rem}
      .editor-ai-panel-scroll{overflow:auto;flex:1;padding:12px}
      .editor-ai-panel .ai-connect-panel,.editor-ai-panel .ai-chat-panel{position:static;border-radius:16px;box-shadow:none}
      .editor-ai-panel .ai-connect-panel{margin-bottom:10px;padding:14px}
      .editor-ai-panel .ai-chat-messages{min-height:300px;max-height:44vh}
      .editor-ai-panel .ai-chat-head{padding:13px 15px}
      .editor-ai-panel .ai-chat-head h1{font-size:1rem}
      .editor-ai-panel .ai-composer{padding:11px}
      .editor-ai-panel .model-catalog-box{margin-top:8px;padding:10px;border:1px solid rgba(101,216,255,.14);border-radius:12px;background:rgba(101,216,255,.025)}
      .editor-ai-panel .model-catalog-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}
      .editor-ai-panel .model-search-field{margin-bottom:7px}
      .editor-ai-panel .token-persistence-note{display:block;margin-top:6px;color:#8ff4cf;font-size:.63rem;font-weight:700}
      .editor-ai-inline-note{margin-top:8px;color:var(--muted2);font-size:.62rem;line-height:1.4}
      @media(max-width:650px){.editor-ai-panel{width:100vw}.editor-ai-panel-scroll{padding:7px}.editor-ai-panel .ai-connect-actions{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectPanel() {
    if ($('editorAiPanel')) return;

    const overlay = document.createElement('div');
    overlay.id = 'editorAiOverlay';
    overlay.className = 'editor-ai-overlay';

    const panel = document.createElement('aside');
    panel.id = 'editorAiPanel';
    panel.className = 'editor-ai-panel';
    panel.innerHTML = `
      <div class="editor-ai-panel-head">
        <div><div class="section-kicker">AI EDITOR</div><h2>Chat directly with this wheel</h2></div>
        <button id="editorAiClose" class="icon-btn" type="button" title="Close">×</button>
      </div>
      <div class="editor-ai-panel-scroll">
        <section class="ai-connect-panel">
          <div class="ai-connect-head">
            <div><div class="section-kicker">CONNECTION</div><h2>AI provider</h2></div>
            <span class="tiny-pill">1H KEY</span>
          </div>
          <div class="ai-connect-form">
            <label class="field">Provider
              <select id="aiProvider">
                <option value="nanogpt">NanoGPT</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom OpenAI-compatible API</option>
              </select>
            </label>
            <label class="field">API base URL or chat endpoint
              <input id="aiEndpoint" type="url" value="https://nano-gpt.com/api/v1" autocomplete="off" spellcheck="false">
            </label>
            <label class="field">API token
              <div class="token-field">
                <input id="aiToken" type="password" autocomplete="off" placeholder="Stored in this tab for up to 1 hour">
                <button id="toggleToken" type="button">Show</button>
              </div>
              <span id="editorAiTokenNote" class="token-persistence-note">Not stored yet.</span>
            </label>
            <div class="model-catalog-box">
              <div class="model-catalog-head"><strong>MODEL CATALOG</strong><small>Search provider models</small></div>
              <label class="field model-search-field">Search models
                <input id="modelFilter" type="search" placeholder="qwen, glm, claude, gemini…" autocomplete="off">
              </label>
              <label class="field">Choose model
                <div class="model-row">
                  <select id="aiModel"><option value="">Load models first</option></select>
                  <button id="loadModelsBtn" class="btn ghost" type="button">↻ Load models</button>
                </div>
              </label>
            </div>
          </div>
          <div class="ai-connect-actions">
            <button id="testAiBtn" class="btn primary" type="button">✓ Test AI</button>
            <button id="undoAiBtn" class="btn ghost" type="button" disabled>Undo AI edit</button>
          </div>
          <div id="aiStatus" class="ai-status">Ready.</div>
          <div class="editor-ai-inline-note">The API key is stored only in this browser tab and automatically expires after 1 hour. AI edits are saved to the wheel and the editor refreshes to show them.</div>
          <div class="ai-wheel-summary">
            <div class="section-kicker">CURRENT WHEEL</div>
            <div class="ai-summary-grid">
              <div><span>GROUPS</span><strong id="chatGroupCount">0</strong></div>
              <div><span>FORFEITS</span><strong id="chatForfeitCount">0</strong></div>
              <div><span>RULES</span><strong id="chatRuleCount">0</strong></div>
            </div>
            <span id="logicBadge" class="logic-badge">Logic OK</span>
          </div>
        </section>

        <section class="ai-chat-panel">
          <div class="ai-chat-head">
            <div><div class="section-kicker">CONFIGURATION CHAT</div><h1>Tell the AI what to add, remove, change or check.</h1></div>
            <div class="ai-chat-actions"><button id="clearChatBtn" class="btn ghost" type="button">Clear chat</button></div>
          </div>
          <div id="chatMessages" class="ai-chat-messages"></div>
          <div class="ai-quick-commands">
            <button type="button" data-ai-command="Check my complete wheel logic. Do not change anything.">Check logic</button>
            <button type="button" data-ai-command="Check whether any prerequisite or unlock order is impossible. Do not change anything.">Check order</button>
            <button type="button" data-ai-command="Inspect all mystery forfeits. Do not change anything.">Check mysteries</button>
          </div>
          <div class="ai-composer">
            <textarea id="chatInput" maxlength="12000" placeholder="Example: Add German clothing-cutting forfeits. Socks must not become available before shoes. Put them in the correct groups and create the needed unlock logic."></textarea>
            <button id="sendAiBtn" class="btn primary large" type="button">Send</button>
            <div class="ai-chat-hint">Enter sends · Shift+Enter adds a line. Manual unsaved editor changes are saved before an AI edit runs.</div>
          </div>
        </section>
      </div>
      <div id="aiToast" class="toast" role="status"></div>
    `;
    document.body.append(overlay, panel);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.body.appendChild(s);
    });
  }

  function openPanel() {
    $('editorAiPanel')?.classList.add('open');
    $('editorAiOverlay')?.classList.add('open');
    sessionStorage.setItem(OPEN_KEY, '1');
    setTimeout(() => $('chatInput')?.focus(), 80);
  }

  function closePanel() {
    $('editorAiPanel')?.classList.remove('open');
    $('editorAiOverlay')?.classList.remove('open');
    sessionStorage.removeItem(OPEN_KEY);
  }

  function tokenRecord() {
    try {
      const r = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (!r?.token || !r?.expiresAt || Date.now() >= r.expiresAt) {
        sessionStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return r;
    } catch (_) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

  function saveToken() {
    const value = $('aiToken')?.value.trim();
    if (!value) return;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: value, expiresAt: Date.now() + TTL }));
    updateTokenNote();
  }

  function restoreToken() {
    const r = tokenRecord();
    if (r && $('aiToken')) $('aiToken').value = r.token;
    updateTokenNote();
  }

  function updateTokenNote() {
    const note = $('editorAiTokenNote');
    if (!note) return;
    const r = tokenRecord();
    if (!r) {
      note.textContent = 'Not stored. It will be kept in this tab for 1 hour after use.';
      return;
    }
    const mins = Math.max(1, Math.ceil((r.expiresAt - Date.now()) / 60000));
    note.textContent = `Stored only in this tab · expires in ${mins} min.`;
  }

  function savePrefs() {
    const p = {
      provider: $('aiProvider')?.value || 'nanogpt',
      endpoint: $('aiEndpoint')?.value || '',
      model: $('aiModel')?.value || ''
    };
    sessionStorage.setItem(PREF_KEY, JSON.stringify(p));
  }

  function restorePrefs() {
    let p = {};
    try { p = JSON.parse(sessionStorage.getItem(PREF_KEY) || '{}'); } catch (_) {}
    if (p.provider && $('aiProvider')) $('aiProvider').value = p.provider;
    if (p.endpoint && $('aiEndpoint')) $('aiEndpoint').value = p.endpoint;
    if (p.model && $('aiModel')) $('aiModel').dataset.restoreModel = p.model;
  }

  function restoreModelWhenLoaded() {
    const select = $('aiModel');
    if (!select) return;
    const desired = select.dataset.restoreModel;
    if (desired && [...select.options].some(o => o.value === desired)) {
      select.value = desired;
      delete select.dataset.restoreModel;
      savePrefs();
    }
  }

  function restoreChat() {
    const box = $('chatMessages');
    const saved = sessionStorage.getItem(CHAT_KEY);
    if (box && saved) {
      box.innerHTML = saved;
      box.scrollTop = box.scrollHeight;
    }
  }

  function saveChat() {
    const box = $('chatMessages');
    if (box) sessionStorage.setItem(CHAT_KEY, box.innerHTML);
  }

  function flushManualChanges() {
    if (document.body.classList.contains('dirty')) {
      $('applyBtn')?.click();
    }
    saveToken();
    savePrefs();
  }

  function observeAppliedChanges() {
    const box = $('chatMessages');
    if (!box) return;
    let reloading = false;
    new MutationObserver(() => {
      if (reloading) return;
      const metas = [...box.querySelectorAll('.ai-chat-meta')];
      const applied = metas.find(m => /^✓ Applied \d+ wheel change/i.test(m.textContent.trim()));
      if (!applied) return;
      reloading = true;
      saveChat();
      savePrefs();
      saveToken();
      sessionStorage.setItem(OPEN_KEY, '1');
      const status = $('aiStatus');
      if (status) {
        status.textContent = 'Changes saved. Refreshing editor so you can see them…';
        status.className = 'ai-status ok';
      }
      setTimeout(() => location.reload(), 700);
    }).observe(box, { childList: true, subtree: true, characterData: true });
  }

  function installSessionLayer() {
    restorePrefs();
    restoreToken();
    restoreChat();

    const send = $('sendAiBtn');
    const input = $('chatInput');
    const test = $('testAiBtn');
    send?.addEventListener('click', flushManualChanges, true);
    test?.addEventListener('click', () => { saveToken(); savePrefs(); }, true);
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) flushManualChanges();
    }, true);
    $('aiToken')?.addEventListener('change', saveToken);
    $('aiToken')?.addEventListener('blur', saveToken);
    $('aiProvider')?.addEventListener('change', savePrefs);
    $('aiEndpoint')?.addEventListener('change', savePrefs);
    $('aiModel')?.addEventListener('change', savePrefs);
    $('clearChatBtn')?.addEventListener('click', () => sessionStorage.removeItem(CHAT_KEY));

    const select = $('aiModel');
    if (select) new MutationObserver(restoreModelWhenLoaded).observe(select, { childList: true });

    observeAppliedChanges();
    setInterval(updateTokenNote, 30000);

    const pref = (() => { try { return JSON.parse(sessionStorage.getItem(PREF_KEY) || '{}'); } catch (_) { return {}; } })();
    if ((sessionStorage.getItem(OPEN_KEY) === '1' || pref.model) && $('loadModelsBtn')) {
      setTimeout(() => $('loadModelsBtn').click(), 250);
    }
    if (sessionStorage.getItem(OPEN_KEY) === '1') openPanel();
  }

  async function bootAi() {
    addStyles();
    injectPanel();

    const oldLink = document.querySelector('a[href="ai.html"]');
    if (oldLink) {
      oldLink.textContent = '✦ AI';
      oldLink.href = '#';
      oldLink.addEventListener('click', event => {
        event.preventDefault();
        openPanel();
      });
    }
    $('editorAiClose')?.addEventListener('click', closePanel);
    $('editorAiOverlay')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('editorAiPanel')?.classList.contains('open')) closePanel();
    });

    try {
      await loadScript('ai-core.js?v=4');
      await loadScript('ai-chat-fix-v3.js?v=6');
      installSessionLayer();
    } catch (error) {
      console.error(error);
      const status = $('aiStatus');
      if (status) {
        status.textContent = error.message;
        status.className = 'ai-status error';
      }
    }
  }

  bootAi();
})();