(() => {
  'use strict';

  if (window.__fortuneEditorAiIntegrated) return;
  window.__fortuneEditorAiIntegrated = true;

  const TOKEN_KEY = 'fortune-editor-ai-token-1h-v1';
  const PREF_KEY = 'fortune-editor-ai-prefs-v2';
  const OPEN_KEY = 'fortune-editor-ai-open-v1';
  const CHAT_KEY = 'fortune-editor-ai-chat-v2';
  const TTL = 60 * 60 * 1000;
  const $ = id => document.getElementById(id);

  function addStyles() {
    if (!document.querySelector('link[data-editor-ai-chat-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'ai-chat.css?v=3';
      link.dataset.editorAiChatCss = '1';
      document.head.appendChild(link);
    }
    if ($('editorAiIntegratedStyles')) return;
    const style = document.createElement('style');
    style.id = 'editorAiIntegratedStyles';
    style.textContent = `.editor-ai-overlay{position:fixed;inset:0;background:rgba(2,5,12,.52);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:.2s;z-index:1180}.editor-ai-overlay.open{opacity:1;pointer-events:auto}.editor-ai-panel{position:fixed;top:0;right:0;width:min(760px,98vw);height:100dvh;background:linear-gradient(180deg,#0b1020,#070a12);border-left:1px solid rgba(101,216,255,.18);box-shadow:-24px 0 70px rgba(0,0,0,.48);z-index:1190;transform:translateX(102%);transition:transform .24s ease;display:flex;flex-direction:column;overflow:hidden}.editor-ai-panel.open{transform:translateX(0)}.editor-ai-panel-head{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid rgba(255,255,255,.07)}.editor-ai-panel-head h2{margin:3px 0 0;font-size:1.05rem}.editor-ai-panel-scroll{overflow:auto;flex:1;padding:12px}.editor-ai-panel .ai-connect-panel,.editor-ai-panel .ai-chat-panel{position:static;border-radius:16px;box-shadow:none}.editor-ai-panel .ai-connect-panel{margin-bottom:10px;padding:14px}.editor-ai-panel .ai-chat-messages{min-height:320px;max-height:44vh}.editor-ai-panel .ai-chat-head{padding:13px 15px}.editor-ai-panel .ai-chat-head h1{font-size:1rem}.editor-ai-panel .ai-composer{padding:11px}.editor-ai-panel .model-catalog-box{margin-top:8px;padding:10px;border:1px solid rgba(101,216,255,.14);border-radius:12px;background:rgba(101,216,255,.025)}.editor-ai-panel .model-catalog-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}.editor-ai-panel .model-search-field{margin-bottom:7px}.editor-ai-panel .token-persistence-note{display:block;margin-top:6px;color:#8ff4cf;font-size:.63rem;font-weight:700}.editor-ai-inline-note{margin-top:8px;color:var(--muted2);font-size:.62rem;line-height:1.4}@media(max-width:650px){.editor-ai-panel{width:100vw}.editor-ai-panel-scroll{padding:7px}.editor-ai-panel .ai-connect-actions{grid-template-columns:1fr 1fr}}`;
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
    panel.innerHTML = `<div class="editor-ai-panel-head"><div><div class="section-kicker">AI EDITOR</div><h2>Chat directly with this wheel</h2></div><button id="editorAiClose" class="icon-btn" type="button" title="Close">×</button></div><div class="editor-ai-panel-scroll"><section class="ai-connect-panel"><div class="ai-connect-head"><div><div class="section-kicker">CONNECTION</div><h2>AI provider</h2></div><span class="tiny-pill">1H KEY</span></div><div class="ai-connect-form"><label class="field">Provider<select id="aiProvider"><option value="nanogpt">NanoGPT</option><option value="openrouter">OpenRouter</option><option value="custom">Custom OpenAI-compatible API</option></select></label><label class="field">API base URL or chat endpoint<input id="aiEndpoint" type="url" value="https://nano-gpt.com/api/v1" autocomplete="off" spellcheck="false"></label><label class="field">API token<div class="token-field"><input id="aiToken" type="password" autocomplete="off" placeholder="Stored in this tab for up to 1 hour"><button id="toggleToken" type="button">Show</button></div><span id="editorAiTokenNote" class="token-persistence-note">Not stored yet.</span></label><div class="model-catalog-box"><div class="model-catalog-head"><strong>MODEL CATALOG</strong><small>Search provider models</small></div><label class="field model-search-field">Search models<input id="modelFilter" type="search" placeholder="qwen, glm, claude, gemini…" autocomplete="off"></label><label class="field">Choose model<div class="model-row"><select id="aiModel"><option value="">Load models first</option></select><button id="loadModelsBtn" class="btn ghost" type="button">↻ Load models</button></div></label></div></div><div class="ai-connect-actions"><button id="testAiBtn" class="btn primary" type="button">✓ Test AI</button><button id="undoAiBtn" class="btn ghost" type="button" disabled>Undo AI edit</button></div><div id="aiStatus" class="ai-status">Ready.</div><div class="editor-ai-inline-note">The key is stored only in this browser tab and expires automatically after 1 hour. It is never written to the wheel XML or GitHub.</div><div class="ai-wheel-summary"><div class="section-kicker">CURRENT WHEEL</div><div class="ai-summary-grid"><div><span>GROUPS</span><strong id="chatGroupCount">0</strong></div><div><span>FORFEITS</span><strong id="chatForfeitCount">0</strong></div><div><span>RULES</span><strong id="chatRuleCount">0</strong></div></div><span id="logicBadge" class="logic-badge">Logic OK</span></div></section><section class="ai-chat-panel"><div class="ai-chat-head"><div><div class="section-kicker">CONFIGURATION CHAT</div><h1>Tell the AI exactly what to add, remove, fix or check.</h1></div><div class="ai-chat-actions"><button id="clearChatBtn" class="btn ghost" type="button">Clear chat</button></div></div><div id="chatMessages" class="ai-chat-messages"></div><div class="ai-quick-commands"><button type="button" data-ai-command="Check my complete wheel logic. Do not change anything.">Check logic</button><button type="button" data-ai-command="Check whether any prerequisite or unlock order is impossible. Do not change anything.">Check order</button><button type="button" data-ai-command="Inspect all mystery forfeits. Do not change anything.">Check mysteries</button></div><div class="ai-composer"><textarea id="chatInput" maxlength="12000" placeholder="Example: Check the Clothing cut forfeits, put each one in the correct broad group and correct their prerequisite order. Apply the fixes directly."></textarea><button id="sendAiBtn" class="btn primary large" type="button">Send</button><div class="ai-chat-hint">Enter sends · Shift+Enter adds a line. The AI receives the complete current wheel model on every request. Failed edits get a Retry button.</div></div></section></div><div id="aiToast" class="toast" role="status"></div>`;
    document.body.append(overlay, panel);
  }

  function openPanel() { $('editorAiPanel')?.classList.add('open'); $('editorAiOverlay')?.classList.add('open'); sessionStorage.setItem(OPEN_KEY, '1'); setTimeout(() => $('chatInput')?.focus(), 80); }
  function closePanel() { $('editorAiPanel')?.classList.remove('open'); $('editorAiOverlay')?.classList.remove('open'); sessionStorage.removeItem(OPEN_KEY); }
  function tokenRecord() { try { const record = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (!record?.token || !record?.expiresAt || Date.now() >= record.expiresAt) { sessionStorage.removeItem(TOKEN_KEY); return null; } return record; } catch (_) { sessionStorage.removeItem(TOKEN_KEY); return null; } }
  function saveToken() { const value = $('aiToken')?.value.trim(); if (!value) return; sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token:value, expiresAt:Date.now()+TTL })); updateTokenNote(); }
  function restoreToken() { const record = tokenRecord(); if (record && $('aiToken')) $('aiToken').value = record.token; updateTokenNote(); }
  function updateTokenNote() { const note = $('editorAiTokenNote'); if (!note) return; const record = tokenRecord(); if (!record) { note.textContent = 'Not stored yet. It will be kept in this tab for 1 hour after use.'; return; } const minutes = Math.max(1, Math.ceil((record.expiresAt-Date.now())/60000)); note.textContent = `Stored only in this tab · expires in ${minutes} min.`; }
  function savePrefs() { sessionStorage.setItem(PREF_KEY, JSON.stringify({ provider:$('aiProvider')?.value||'nanogpt', endpoint:$('aiEndpoint')?.value||'', model:$('aiModel')?.value||'' })); }
  function loadPrefs() { try { return JSON.parse(sessionStorage.getItem(PREF_KEY) || '{}'); } catch (_) { return {}; } }
  function restorePrefs() { const p = loadPrefs(); if (p.provider && $('aiProvider')) $('aiProvider').value = p.provider; if (p.endpoint && $('aiEndpoint')) $('aiEndpoint').value = p.endpoint; if (p.model && $('aiModel')) $('aiModel').dataset.restoreModel = p.model; }
  function restoreDesiredModel() { const select = $('aiModel'); if (!select) return; const desired = select.dataset.restoreModel || loadPrefs().model; if (desired && [...select.options].some(option => option.value === desired)) { select.value = desired; delete select.dataset.restoreModel; savePrefs(); } }
  function restoreChat() { const box = $('chatMessages'), saved = sessionStorage.getItem(CHAT_KEY); if (box && saved) { box.innerHTML = saved; box.scrollTop = box.scrollHeight; } }
  function saveChat() { const box = $('chatMessages'); if (box) sessionStorage.setItem(CHAT_KEY, box.innerHTML); }
  function flushManualChanges() { if (document.body.classList.contains('dirty')) $('applyBtn')?.click(); saveToken(); savePrefs(); }

  function installPersistence() {
    restorePrefs(); restoreToken(); restoreChat();
    $('sendAiBtn')?.addEventListener('click', flushManualChanges, true);
    $('testAiBtn')?.addEventListener('click', () => { saveToken(); savePrefs(); }, true);
    $('chatInput')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) flushManualChanges(); }, true);
    $('aiToken')?.addEventListener('change', saveToken); $('aiToken')?.addEventListener('blur', saveToken); $('aiProvider')?.addEventListener('change', savePrefs); $('aiEndpoint')?.addEventListener('change', savePrefs); $('aiModel')?.addEventListener('change', savePrefs);
    const select = $('aiModel'); if (select) new MutationObserver(restoreDesiredModel).observe(select, { childList:true });
    const chat = $('chatMessages'); if (chat) new MutationObserver(saveChat).observe(chat, { childList:true, subtree:true, characterData:true });
    setInterval(updateTokenNote, 30000);
    window.addEventListener('fortune-ai-applied', () => { saveToken(); savePrefs(); saveChat(); sessionStorage.setItem(OPEN_KEY, '1'); const status=$('aiStatus'); if(status){status.textContent='Changes saved. Refreshing editor so you can see them…';status.className='ai-status ok';} setTimeout(()=>location.reload(),650); });
  }

  function bindPanel() {
    const opener = $('editorAiOpen') || document.querySelector('a[href="ai.html"]');
    if (opener) { if (opener.tagName === 'A') opener.href = '#'; opener.textContent = '✦ AI'; opener.addEventListener('click', event => { event.preventDefault(); openPanel(); }); }
    $('editorAiClose')?.addEventListener('click', closePanel); $('editorAiOverlay')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('editorAiPanel')?.classList.contains('open')) closePanel(); });
  }

  function boot() {
    addStyles(); injectPanel(); bindPanel(); installPersistence();
    const prefs = loadPrefs();
    if (prefs.model && $('aiModel')) $('aiModel').dataset.restoreModel = prefs.model;
    if (sessionStorage.getItem(OPEN_KEY) === '1') openPanel();
  }

  boot();
})();