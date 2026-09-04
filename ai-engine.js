(() => {
  'use strict';

  const M = window.FortuneModel;
  const D = window.FortuneDependencyState;
  const S = window.FortuneSpinStyle;
  if (!M || !D || window.__fortuneAiEditorEngine) return;
  window.__fortuneAiEditorEngine = true;

  const $ = id => document.getElementById(id);
  const state = { models: [], history: [], busy: false, timer: null, started: 0, phase: 'Ready', undo: null, lastFailed: null };
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  const slug = value => String(value || 'item').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';
  const provider = () => $('aiProvider')?.value || 'custom';
  const token = () => $('aiToken')?.value.trim() || '';
  const selectedModel = () => $('aiModel')?.value || '';
  const endpoint = () => $('aiEndpoint')?.value.trim().replace(/\/+$/, '') || '';

  function injectStyles() {
    if ($('aiEditorEngineStyles')) return;
    const style = document.createElement('style');
    style.id = 'aiEditorEngineStyles';
    style.textContent = `.ai-retry-row{display:flex;gap:7px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}.ai-retry-btn{min-height:29px;padding:0 10px;border:1px solid rgba(101,216,255,.2);border-radius:8px;background:rgba(101,216,255,.06);color:#c9f5ff;font-size:.64rem;font-weight:850;cursor:pointer}.ai-retry-btn:hover{background:rgba(101,216,255,.12);border-color:rgba(101,216,255,.38)}.ai-engine-note{margin-top:7px;color:var(--muted2);font-size:.61rem;line-height:1.4}`;
    document.head.appendChild(style);
  }

  function setStatus(text, type = '') { const node = $('aiStatus'); if (node) { node.textContent = text; node.className = `ai-status ${type}`.trim(); } }
  function addMessage(role, text, meta = '', retryText = '') {
    const box = $('chatMessages'); if (!box) return null;
    const row = document.createElement('div'); row.className = `ai-chat-message ${role}`;
    const bubble = document.createElement('div'); bubble.className = 'ai-chat-bubble';
    const copy = document.createElement('div'); copy.className = 'ai-chat-copy'; copy.textContent = text; bubble.appendChild(copy);
    if (meta) { const m = document.createElement('div'); m.className = 'ai-chat-meta'; m.textContent = meta; bubble.appendChild(m); }
    if (retryText) { const wrap = document.createElement('div'); wrap.className = 'ai-retry-row'; const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'ai-retry-btn'; retry.textContent = '↻ Retry request'; retry.dataset.retryText = retryText; wrap.appendChild(retry); bubble.appendChild(wrap); }
    row.appendChild(bubble); box.appendChild(row); box.scrollTop = box.scrollHeight; return row;
  }
  function setPhase(phase) { state.phase = phase; updateHeartbeat(); }
  function updateHeartbeat() {
    if (!state.busy) return;
    const seconds = Math.floor((performance.now() - state.started) / 1000);
    if ($('sendAiBtn')) $('sendAiBtn').textContent = `⏳ Working… ${seconds}s`;
    setStatus(`${state.phase}… ${seconds}s`, 'working');
    const pending = $('chatMessages')?.querySelector('.ai-chat-message.system:last-child .ai-chat-meta');
    if (pending) pending.textContent = `${state.phase} · ${seconds}s elapsed`;
  }
  function startWork(phase) { state.busy = true; state.started = performance.now(); state.phase = phase; ['sendAiBtn','testAiBtn','loadModelsBtn'].forEach(id => { const node = $(id); if (node) node.disabled = true; }); if ($('chatInput')) $('chatInput').disabled = true; clearInterval(state.timer); updateHeartbeat(); state.timer = setInterval(updateHeartbeat, 1000); }
  function stopWork() { state.busy = false; clearInterval(state.timer); state.timer = null; if ($('sendAiBtn')) { $('sendAiBtn').disabled = false; $('sendAiBtn').textContent = 'Send'; } if ($('testAiBtn')) { $('testAiBtn').disabled = false; $('testAiBtn').textContent = '✓ Test AI'; } if ($('loadModelsBtn')) { $('loadModelsBtn').disabled = false; $('loadModelsBtn').textContent = '↻ Load models'; } if ($('chatInput')) $('chatInput').disabled = false; }

  function providerDefaults(kind) { if (kind === 'nanogpt') return 'https://nano-gpt.com/api/v1'; if (kind === 'openrouter') return 'https://openrouter.ai/api/v1'; return ''; }
  function modelsUrl() {
    if (provider() === 'nanogpt') return 'https://nano-gpt.com/api/v1/models?detailed=true';
    if (provider() === 'openrouter') return 'https://openrouter.ai/api/v1/models';
    const raw = endpoint(); if (!raw) return '';
    try { const url = new URL(raw); let path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/models$/i, ''); url.pathname = `${path}/models`.replace(/\/+/g, '/'); return url.toString(); } catch (_) { return `${raw}/models`; }
  }
  function chatUrl() {
    const raw = endpoint(); if (!raw) return '';
    try { const url = new URL(raw); let path = url.pathname.replace(/\/+$/, ''); if (/\/chat\/completions$/i.test(path)) return url.toString(); path = path.replace(/\/models$/i, ''); url.pathname = `${path}/chat/completions`.replace(/\/+/g, '/'); return url.toString(); } catch (_) { return raw; }
  }
  function headers(json = false, auth = true) { const h = {}; if (json) h['Content-Type'] = 'application/json'; if (auth && token()) h.Authorization = `Bearer ${token()}`; if (provider() === 'openrouter') { h['HTTP-Referer'] = location.origin + location.pathname; h['X-Title'] = 'Fortune Engine AI Editor'; } return h; }
  async function fetchJson(url, init = {}, timeoutMs = 120000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try { const response = await fetch(url, { ...init, signal: controller.signal }); const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch (_) { throw new Error(`Provider returned non-JSON data (HTTP ${response.status}).`); } if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`); return data; }
    catch (error) { if (error?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`); if (error instanceof TypeError || /NetworkError|Failed to fetch/i.test(String(error?.message))) throw new Error(`Browser could not reach ${url}. Check the endpoint or CORS settings.`); throw error; }
    finally { clearTimeout(timer); }
  }
  function normalizeModels(data) {
    let list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : data?.data && typeof data.data === 'object' ? Object.values(data.data) : data?.models && typeof data.models === 'object' ? Object.values(data.models) : [];
    return list.map(value => { if (typeof value === 'string') return { id:value, name:value }; if (!value || typeof value !== 'object') return null; const id = String(value.id || value.model || value.slug || value.name || ''); if (!id) return null; return { ...value, id, name:value.name || value.display_name || value.displayName || id }; }).filter(item => item?.id && !/embedding|rerank|tts|speech|transcri|image|video/i.test(item.id));
  }
  function renderModels() {
    const select = $('aiModel'); if (!select) return;
    const old = select.value || select.dataset.restoreModel || '', query = ($('modelFilter')?.value || '').trim().toLowerCase();
    const visible = state.models.filter(item => !query || `${item.id} ${item.name || ''} ${item.description || ''}`.toLowerCase().includes(query));
    select.innerHTML = '';
    if (!visible.length) { const option = document.createElement('option'); option.value = ''; option.textContent = state.models.length ? 'No models match search' : 'Load models first'; select.appendChild(option); return; }
    visible.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name && item.name !== item.id ? `${item.name} · ${item.id}` : item.id; select.appendChild(option); });
    if ([...select.options].some(option => option.value === old)) select.value = old;
    if (select.dataset.restoreModel && select.value === select.dataset.restoreModel) delete select.dataset.restoreModel;
    select.dispatchEvent(new Event('change', { bubbles:true }));
  }
  async function loadModels() {
    if (state.busy) return; startWork('Loading models');
    try { const url = modelsUrl(); if (!/^https:\/\//i.test(url)) throw new Error('Enter a valid HTTPS API base URL.'); let data; if (provider() === 'nanogpt' || provider() === 'openrouter') data = await fetchJson(url,{method:'GET'},45000); else { try { data = await fetchJson(url,{method:'GET',headers:headers(false,true)},45000); } catch (_) { data = await fetchJson(url,{method:'GET'},45000); } } state.models = normalizeModels(data).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),undefined,{sensitivity:'base'})); renderModels(); setStatus(`Loaded ${state.models.length} models.`,'ok'); }
    catch (error) { setStatus(`Could not load models: ${error.message}`,'error'); }
    finally { stopWork(); }
  }
  function extractText(data) { const message=data?.choices?.[0]?.message, content=message?.content; if(typeof content==='string'&&content.trim())return content; if(Array.isArray(content)){const text=content.map(item=>item?.text||item?.content||'').join('');if(text.trim())return text;} if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text; if(typeof message?.reasoning_content==='string'&&message.reasoning_content.trim())return message.reasoning_content; throw new Error('Provider returned no readable assistant text.'); }
  async function complete(messages, options={}) { const maxTokens=options.maxTokens??3600, temperature=options.temperature??0, timeoutMs=options.timeoutMs??300000; if(!selectedModel())throw new Error('Choose a model first.'); if(!token())throw new Error('Enter the API token first.'); const url=chatUrl(); if(!/^https:\/\//i.test(url))throw new Error('Invalid chat endpoint.'); const data=await fetchJson(url,{method:'POST',headers:headers(true,true),body:JSON.stringify({model:selectedModel(),messages,temperature,max_tokens:maxTokens})},timeoutMs); return {data,text:extractText(data)}; }
  async function testApi() { if(state.busy)return; startWork('Testing API'); try{const started=performance.now();const result=await complete([{role:'user',content:'Reply with exactly OK and nothing else.'}],{maxTokens:64,timeoutMs:60000});const seconds=((performance.now()-started)/1000).toFixed(1),used=result.data?.model||selectedModel();setStatus(`Connected · ${used} · ${seconds}s · ${result.text.trim().slice(0,50)}`,'ok');addMessage('system',`✓ API test passed in ${seconds}s with ${used}.`);}catch(error){setStatus(`Test failed: ${error.message}`,'error');addMessage('system',`✕ API test failed: ${error.message}`);}finally{stopWork();} }

  function requestMode(text) {
    const value=String(text||'');
    const edit=/\b(add|create|insert|remove|delete|rename|change|modify|update|make|set|move|put|place|assign|adapt|fix|correct|organize|organise|sort|reorder|restructure|ensure|enable|disable|attach|depend|require|unlock|hinzuf|ergänz|lösch|entfern|änder|umbenenn|verschieb|zuord|anpass|korrig|sortier|abhäng|freischalt|ajout|cré|supprim|modifi|renomm|déplac|adapt|corrig|organis|tri|dépend|déverrou)\w*/i.test(value);
    const analysisOnly=/\b(do not change|don't change|without changing|no changes|only check|just check|check only|only review|only explain|nur prüfen|nichts ändern|ohne zu ändern|ne rien modifier|sans modifier)\b/i.test(value);
    if(edit)return'edit'; if(analysisOnly)return'analysis'; if(/\b(check|review|inspect|explain|why|logic|odds|reachable|progression|prüf|erklär|warum|vérif|explique|pourquoi)\b/i.test(value))return'analysis'; return'edit';
  }
  function isComplexEdit(text) { return requestMode(text)==='edit' && (/\b(check|review|all|every|group|depend|order|logic|organ|sort|restruct|adapt|fix|correct|prüf|gruppe|abhäng|reihen|korrig|vérif|groupe|dépend|ordre|corrig)\w*/i.test(text) || String(text).length>180); }

  function currentContext() {
    const c=M.loadConfig(), groups=new Map(c.levels.map(g=>[g.id,g])), forfeits=new Map(c.forfeits.map(f=>[f.id,f]));
    const dependents=new Map(c.forfeits.map(f=>[f.id,[]]));
    c.forfeits.forEach(f=>(f.requiresForfeitIds||[]).forEach(id=>{if(dependents.has(id))dependents.get(id).push(f.id);}));
    return {
      settings:clone(c.settings), spinStyle:clone(S?.load?.()||{}),
      groups:c.levels.map(g=>({id:g.id,name:g.name,icon:g.icon,color:g.color,activeAtStart:g.activeAtStart,forfeitIds:c.forfeits.filter(f=>f.levelId===g.id).map(f=>f.id)})),
      forfeits:c.forfeits.map(f=>({
        id:f.id,name:f.name,icon:f.icon,color:f.color,weight:f.weight,levelId:f.levelId,groupName:groups.get(f.levelId)?.name||'',category:f.category,description:f.description,animation:f.animation,lifetime:clone(f.lifetime),cooldown:f.cooldown,eventType:f.eventType,mystery:f.mystery,enabled:f.enabled,
        unlockLevels:[...(f.unlockLevels||[])],unlockGroupNames:(f.unlockLevels||[]).map(id=>groups.get(id)?.name||id),
        requiresMode:f.requiresMode||'all',requiresForfeitIds:[...(f.requiresForfeitIds||[])],prerequisiteNames:(f.requiresForfeitIds||[]).map(id=>forfeits.get(id)?.name||id),
        dependentForfeitIds:[...(dependents.get(f.id)||[])],dependentNames:(dependents.get(f.id)||[]).map(id=>forfeits.get(id)?.name||id)
      })),
      rules:(c.rules||[]).map(r=>({id:r.id,name:r.name,mode:r.mode,minOccurrences:r.minOccurrences||1,conditionForfeitIds:[...(r.conditionForfeitIds||[])],conditionNames:(r.conditionForfeitIds||[]).map(id=>forfeits.get(id)?.name||id),unlockLevels:[...(r.unlockLevels||[])],unlockGroupNames:(r.unlockLevels||[]).map(id=>groups.get(id)?.name||id),enabled:r.enabled}))
    };
  }

  function humanMap(context) {
    const lines=[];
    context.groups.forEach(g=>{
      lines.push(`GROUP ${g.id} = ${g.name} | activeAtStart=${g.activeAtStart}`);
      context.forfeits.filter(f=>f.levelId===g.id).forEach(f=>{
        const req=f.requiresForfeitIds.length?`${f.requiresMode.toUpperCase()}(${f.requiresForfeitIds.join(',')})`:'none';
        const unlock=f.unlockLevels.length?f.unlockLevels.join(','):'none';
        lines.push(`  - ${f.id} | ${f.name} | category=${f.category||'-'} | prereq=${req} | unlocks=${unlock} | lifetime=${f.lifetime?.type||'forever'} | cooldown=${f.cooldown||0} | weight=${f.weight} | mystery=${!!f.mystery} | enabled=${f.enabled!==false}`);
      });
    });
    if(context.rules.length){lines.push('GROUP RULES');context.rules.forEach(r=>lines.push(`  - ${r.id} | ${r.name} | ${r.mode.toUpperCase()}(${r.conditionForfeitIds.join(',')}) x${r.minOccurrences||1} -> ${r.unlockLevels.join(',')} | enabled=${r.enabled!==false}`));}
    return lines.join('\n');
  }

  const ENGINE_GUIDE=`FORTUNE ENGINE — COMPLETE BEHAVIOR MODEL\n\nA. WHAT THE PLAYER SEES / ELIGIBILITY PIPELINE\nA wheel entry is selectable only when ALL applicable gates pass, in this conceptual order:\n1) its broad group is active; 2) the forfeit is enabled; 3) its availability prerequisites are satisfied; 4) it has not been removed by lifetime/once behavior; 5) cooldown is zero; 6) any spin-lifetime still has time remaining.\nOnly eligible entries participate in the weighted draw. Weight is RELATIVE among currently eligible entries, not a fixed percentage.\n\nB. GROUPS ARE BROAD STATES, NOT SEQUENCE STEPS\nGroups represent broad game states/themes such as Start, Clothing, Humiliation, Disgusting or Cleaning. levelId decides which broad group owns a forfeit. A group can be active at start or unlocked later.\nUse existing broad groups whenever semantically appropriate. Do not create duplicate groups that mean the same thing. Do not create a group merely to enforce A -> B ordering.\nWhen the user says 'put them in the right group', infer the thematic group from the forfeit's name/category/description and the existing group names. Example: clothing cutting/removal belongs in Clothing; cleaning tasks in Cleaning; humiliation-focused tasks in Humiliation; gross/disgust-focused tasks in Disgusting. Preserve the current group when there is no clearly better existing broad group.\n\nC. FORFEIT AVAILABILITY / ORDERING\nrequiresForfeitIds references FORFEIT IDs that must have occurred in the current play-session history before the dependent item can appear. requiresMode='all' means every listed prerequisite; 'any' means at least one.\nFor a simple chain A -> B -> C, normally B requires A and C requires B. Do NOT make C require A+B unless the user explicitly wants all earlier events required. This keeps dependencies minimal and understandable.\nFor alternative paths, use requiresMode='any'. Never make circular/self dependencies.\nDependencies are about future play-session history, not editor-time state. The editor config defines what will happen when a new play session runs.\n\nD. LIFETIME AND COOLDOWN\nlifetime.type='forever' keeps an entry indefinitely. 'once' removes it after the first time it is selected. 'spins' keeps it for the configured number of spins after activation. cooldown=N makes a selected item temporarily unavailable for N completed spins.\nIf a progression step should disappear after it has done its job, 'once' is usually appropriate. Do not change lifetime unless requested or logically necessary to enforce the requested progression.\n\nE. UNLOCKING BROAD GROUPS\nA forfeit's unlockLevels activates broad groups immediately when that result is selected.\nConditional rules activate broad groups after ALL/ANY named result conditions are met; minOccurrences allows thresholds such as a result needing to happen 3 times.\nUse group unlock rules for broad state transitions. Use forfeit prerequisites for ordinary individual-entry sequencing.\n\nF. MYSTERY\nmystery=true is DISPLAY ONLY. The real hidden result remains in name/icon/description. On the wheel it is hidden; after selection it is revealed. Never create a placeholder called only 'Mystery Challenge' unless that is genuinely the intended hidden result.\n\nG. SPECIAL EVENTS\neventType may be normal, spinAgain, unlock, doubleSpin, immunity or randomize. Keep special-event behavior unless the user asks to change it.\n\nH. SPIN BEHAVIOR\nGeneral settings hold total spin min/max and minimum turns. Spin style holds maxTurns, random spinUpMinSeconds/spinUpMaxSeconds, random spinDownMinSeconds/spinDownMaxSeconds, dramaEnabled, dramaChance, dramaCreepMinDegrees/maxDegrees, showSlowIcon and iconPreviewStartPercent. Drama is a small continuation/creep after an almost-stop, never another full re-spin.\n\nI. EDITING PRINCIPLES\n- Preserve unrelated data exactly.\n- Use exact existing IDs for existing objects and references.\n- Prefer update_* to delete/recreate.\n- If the user asks to 'check and fix/adapt/put/move', that is an EDIT, not analysis-only.\n- Inspect names, descriptions, categories, current groups, prerequisite names, reverse dependents and unlock relationships before deciding.\n- Make the smallest coherent patch that achieves the intended game behavior.\n- If a request is ambiguous but a strong interpretation follows from the current wheel structure, use that interpretation and state it briefly in reply. Ask no question unless two materially different configurations are equally plausible.\n\nJ. PATCH ACTIONS\nadd_forfeit {item}; update_forfeit {id,changes}; remove_forfeit {id}; add_group {group}; update_group {id,changes}; remove_group {id}; add_rule {rule}; update_rule {id,changes}; remove_rule {id}; update_settings {changes}; update_spin_style {changes}.\nNew forfeit fields: id,name,icon,color,weight,levelId,category,description,animation,lifetime,cooldown,eventType,mystery,enabled,unlockLevels,requiresMode,requiresForfeitIds.\nRule fields: id,name,mode,minOccurrences,conditionForfeitIds,unlockLevels,enabled.\n\nK. EXAMPLE — CHECK CLOTHING CUTS AND FIX ORDER\nIf existing entries are Shoes Off, Cut Shoes, Socks Off, Cut Socks, Cut Trousers, and the user asks to put clothing cuts in the right group and adapt dependencies:\n- move the relevant items to the existing Clothing group if they are elsewhere;\n- derive the intended chain from names/descriptions, e.g. Socks Off may require Shoes Off, Cut Socks may require Socks Off, Cut Trousers may require a prerequisite only when the wheel design implies one;\n- keep prerequisites minimal;\n- do not invent a Socks group;\n- return concrete update_forfeit actions using exact IDs.`;

  function systemPrompt(mode, planning='') {
    const context=currentContext();
    return `You are the configuration engineer inside Fortune Engine. REQUEST MODE: ${mode.toUpperCase()}\n\n${ENGINE_GUIDE}\n\nCURRENT WHEEL — HUMAN MAP\n${humanMap(context)}\n\nCURRENT CONFIGURATION JSON\n${JSON.stringify(context)}\n${planning?`\nAPPROVED PLANNING NOTES FROM YOUR FIRST PASS\n${planning}\n`:''}\nOUTPUT CONTRACT\nReturn ONLY one strict JSON object, no markdown or prose outside it:\n{\"mode\":\"${mode}\",\"reply\":\"short user-facing summary\",\"actions\":[],\"assessment\":{\"alreadySatisfied\":false,\"findings\":[]}}\nFor EDIT mode, actions must contain every concrete patch needed. Empty actions are allowed only when assessment.alreadySatisfied=true with specific evidence from CURRENT CONFIGURATION. Never claim something was changed with actions:[].\nFor ANALYSIS mode, actions must be empty unless the user explicitly asks to fix something.\nUse the user's requested language for player-facing names/descriptions. JSON must be valid.`;
  }

  function parseJson(text) { let raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'');const first=raw.indexOf('{'),last=raw.lastIndexOf('}');if(first>=0&&last>first)raw=raw.slice(first,last+1);return JSON.parse(raw); }
  async function repairJson(raw) { setPhase('Repairing JSON');const result=await complete([{role:'system',content:'Repair the supplied text into exactly one strict valid JSON object. Preserve all intended actions. No markdown or explanation.'},{role:'user',content:String(raw).slice(0,18000)}],{maxTokens:3000,timeoutMs:180000});return parseJson(result.text); }
  async function planningPass(text) {
    const context=currentContext();
    setPhase('Understanding wheel and planning changes');
    const prompt=`You are planning a Fortune Engine edit before producing patches. ${ENGINE_GUIDE}\n\nCURRENT WHEEL HUMAN MAP\n${humanMap(context)}\n\nUSER REQUEST\n${text}\n\nReturn strict JSON only: {\"understanding\":\"what the user is trying to achieve\",\"targets\":[{\"id\":\"existing id\",\"current\":\"current role/state\",\"desired\":\"intended role/state\",\"reason\":\"why\"}],\"dependencyPlan\":[{\"forfeitId\":\"id\",\"requiresMode\":\"all|any\",\"requiresForfeitIds\":[\"id\"],\"reason\":\"why\"}],\"groupPlan\":[{\"forfeitId\":\"id\",\"levelId\":\"existing group id\",\"reason\":\"why\"}],\"notes\":[]}. Do not invent IDs. Do not emit final patch actions yet.`;
    try { const result=await complete([{role:'system',content:prompt},{role:'user',content:text}],{maxTokens:2200,temperature:0,timeoutMs:180000});return JSON.stringify(parseJson(result.text)); }
    catch (_) { return ''; }
  }
  async function getStructured(text, mode, strictRetry=false) {
    let plan='';
    if(mode==='edit'&&isComplexEdit(text)&&!strictRetry) plan=await planningPass(text);
    setPhase(strictRetry?'Retrying with strict edit contract':'Building concrete patch');
    const messages=[{role:'system',content:systemPrompt(mode,plan)},...state.history.slice(-4),{role:'user',content:text}];
    let result=await complete(messages,{maxTokens:4600,timeoutMs:300000}),answer;
    try{answer=parseJson(result.text);}catch(_){answer=await repairJson(result.text);}
    const actions=Array.isArray(answer?.actions)?answer.actions:[],satisfied=answer?.assessment?.alreadySatisfied===true,returnedMode=String(answer?.mode||'').toLowerCase();
    if(mode==='edit'&&(returnedMode==='analysis'||(!actions.length&&!satisfied))){
      if(strictRetry)throw new Error('The AI still returned no executable edit actions.');
      setPhase('Requesting missing concrete patch actions');
      const correction=await complete([{role:'system',content:systemPrompt('edit',plan)},{role:'user',content:text},{role:'assistant',content:JSON.stringify(answer)},{role:'user',content:'STRICT CORRECTION: This is an EDIT. Return the concrete patch actions required by the request. Use exact IDs from the current wheel. If and only if it is already exactly correct, return actions:[] with assessment.alreadySatisfied:true and specific evidence.'}],{maxTokens:4600,timeoutMs:240000});
      try{answer=parseJson(correction.text);}catch(_){answer=await repairJson(correction.text);}
      if(!Array.isArray(answer?.actions)||(!answer.actions.length&&answer?.assessment?.alreadySatisfied!==true))throw new Error('The AI returned no executable wheel changes after an automatic retry.');
    }
    return answer;
  }

  function resolveGroup(c,ref){const v=String(ref||'').trim().toLowerCase();return c.levels.find(g=>g.id.toLowerCase()===v)||c.levels.find(g=>g.name.toLowerCase()===v);}
  function resolveForfeit(c,ref){const v=String(ref||'').trim().toLowerCase();return c.forfeits.find(f=>f.id.toLowerCase()===v)||c.forfeits.find(f=>f.name.toLowerCase()===v);}
  function resolveRule(c,ref){const v=String(ref||'').trim().toLowerCase();return(c.rules||[]).find(r=>r.id.toLowerCase()===v)||(c.rules||[]).find(r=>r.name.toLowerCase()===v);}
  function uniqueId(base,used){let id=slug(base),n=2;while(used.has(id))id=`${slug(base)}-${n++}`;used.add(id);return id;}
  function groupRefs(c,refs){if(!Array.isArray(refs))return[];return[...new Set(refs.map(ref=>{const g=resolveGroup(c,ref);if(!g)throw new Error(`Unknown group reference: ${ref}`);return g.id;}))];}
  function forfeitRefs(c,refs,ownId=''){if(!Array.isArray(refs))return[];return[...new Set(refs.map(ref=>{const f=resolveForfeit(c,ref);if(!f)throw new Error(`Unknown forfeit reference: ${ref}`);return f.id;}).filter(id=>id!==ownId))];}
  function normalizeLifetime(value,fallback={type:'forever',spins:3}){if(typeof value==='string')value={type:value};if(!value||typeof value!=='object')return clone(fallback);const type=['forever','once','spins'].includes(value.type)?value.type:fallback.type;return{type,spins:Math.round(clamp(value.spins,1,999,fallback.spins||3))};}
  function normalizeForfeitShell(c,input,used){const g=resolveGroup(c,input.levelId)||(!input.levelId?c.levels[0]:null);if(!g)throw new Error(`Unknown group for new forfeit: ${input.levelId}`);return{id:uniqueId(input.id||input.name||'forfeit',used),name:String(input.name||'New Forfeit').slice(0,80),icon:String(input.icon||'🎯').slice(0,12),color:/^#[0-9a-f]{6}$/i.test(input.color||'')?input.color:'#65d8ff',weight:clamp(input.weight,.1,100,1),levelId:g.id,category:String(input.category||'General').slice(0,40),description:String(input.description||'').slice(0,240),animation:['zoom','shake','pulse','flash','confetti'].includes(input.animation)?input.animation:'pulse',lifetime:normalizeLifetime(input.lifetime),cooldown:Math.round(clamp(input.cooldown,0,99,0)),eventType:['normal','spinAgain','unlock','doubleSpin','immunity','randomize'].includes(input.eventType)?input.eventType:'normal',mystery:!!input.mystery,enabled:input.enabled!==false,unlockLevels:[],requiresMode:input.requiresMode==='any'?'any':'all',requiresForfeitIds:[]};}
  function applyForfeitChanges(c,item,next){next=clone(next||{});if('name'in next)item.name=String(next.name||item.name).slice(0,80);if('icon'in next)item.icon=String(next.icon||item.icon).slice(0,12);if('color'in next&&/^#[0-9a-f]{6}$/i.test(next.color||''))item.color=next.color;if('weight'in next)item.weight=clamp(next.weight,.1,100,item.weight);if('levelId'in next){const g=resolveGroup(c,next.levelId);if(!g)throw new Error(`Unknown group reference: ${next.levelId}`);item.levelId=g.id;}if('category'in next)item.category=String(next.category||'').slice(0,40);if('description'in next)item.description=String(next.description||'').slice(0,240);if('animation'in next&&['zoom','shake','pulse','flash','confetti'].includes(next.animation))item.animation=next.animation;if('lifetime'in next)item.lifetime=normalizeLifetime(next.lifetime,item.lifetime);if('cooldown'in next)item.cooldown=Math.round(clamp(next.cooldown,0,99,item.cooldown));if('eventType'in next&&['normal','spinAgain','unlock','doubleSpin','immunity','randomize'].includes(next.eventType))item.eventType=next.eventType;if('mystery'in next)item.mystery=!!next.mystery;if('enabled'in next)item.enabled=next.enabled!==false;if('unlockLevels'in next)item.unlockLevels=groupRefs(c,next.unlockLevels);if('requiresMode'in next)item.requiresMode=next.requiresMode==='any'?'any':'all';if('requiresForfeitIds'in next)item.requiresForfeitIds=forfeitRefs(c,next.requiresForfeitIds,item.id);}
  function assertNoDependencyCycles(c){const byId=new Map(c.forfeits.map(f=>[f.id,f])),visiting=new Set(),visited=new Set();function walk(id,trail=[]){if(visiting.has(id))throw new Error(`Circular availability dependency detected: ${[...trail,id].join(' → ')}`);if(visited.has(id))return;visiting.add(id);const item=byId.get(id);for(const ref of item?.requiresForfeitIds||[]){if(ref===id)throw new Error(`Forfeit ${id} cannot depend on itself.`);if(!byId.has(ref))throw new Error(`Forfeit ${id} references missing prerequisite ${ref}.`);walk(ref,[...trail,id]);}visiting.delete(id);visited.add(id);}c.forfeits.forEach(f=>walk(f.id));}

  function applyActions(actions){
    const before=M.loadConfig(),beforeSpin=S?.load?.()||{},c=clone(before),spin=clone(beforeSpin),list=Array.isArray(actions)?actions.filter(a=>a&&typeof a==='object'):[];c.rules=c.rules||[];
    const usedG=new Set(c.levels.map(g=>g.id)),usedF=new Set(c.forfeits.map(f=>f.id)),usedR=new Set(c.rules.map(r=>r.id));let changed=0;
    list.filter(a=>a.type==='add_group').forEach(a=>{const x=a.group||{};c.levels.push({id:uniqueId(x.id||x.name||'group',usedG),name:String(x.name||'New Group').slice(0,60),icon:String(x.icon||'◆').slice(0,12),color:/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#65d8ff',activeAtStart:!!x.activeAtStart});changed++;});
    const pending=[];list.filter(a=>a.type==='add_forfeit').forEach(a=>{const x=a.item||{},item=normalizeForfeitShell(c,x,usedF);c.forfeits.push(item);pending.push({item,input:x});changed++;});pending.forEach(({item,input})=>{item.unlockLevels=groupRefs(c,input.unlockLevels||[]);item.requiresForfeitIds=forfeitRefs(c,input.requiresForfeitIds||[],item.id);});
    list.filter(a=>a.type==='update_group').forEach(a=>{const g=resolveGroup(c,a.id);if(!g)throw new Error(`Unknown group: ${a.id}`);const x=a.changes||{};if('name'in x)g.name=String(x.name||g.name).slice(0,60);if('icon'in x)g.icon=String(x.icon||g.icon).slice(0,12);if('color'in x&&/^#[0-9a-f]{6}$/i.test(x.color||''))g.color=x.color;if('activeAtStart'in x)g.activeAtStart=!!x.activeAtStart;changed++;});
    list.filter(a=>a.type==='update_forfeit').forEach(a=>{const f=resolveForfeit(c,a.id);if(!f)throw new Error(`Unknown forfeit: ${a.id}`);applyForfeitChanges(c,f,a.changes||{});changed++;});
    list.filter(a=>a.type==='add_rule').forEach(a=>{const x=a.rule||{};c.rules.push({id:uniqueId(x.id||x.name||'rule',usedR),name:String(x.name||'New Rule').slice(0,80),mode:x.mode==='any'?'any':'all',minOccurrences:Math.round(clamp(x.minOccurrences,1,99,1)),conditionForfeitIds:forfeitRefs(c,x.conditionForfeitIds||[]),unlockLevels:groupRefs(c,x.unlockLevels||[]),enabled:x.enabled!==false});changed++;});
    list.filter(a=>a.type==='update_rule').forEach(a=>{const r=resolveRule(c,a.id);if(!r)throw new Error(`Unknown rule: ${a.id}`);const x=a.changes||{};if('name'in x)r.name=String(x.name||r.name).slice(0,80);if('mode'in x)r.mode=x.mode==='any'?'any':'all';if('minOccurrences'in x)r.minOccurrences=Math.round(clamp(x.minOccurrences,1,99,r.minOccurrences||1));if('conditionForfeitIds'in x)r.conditionForfeitIds=forfeitRefs(c,x.conditionForfeitIds||[]);if('unlockLevels'in x)r.unlockLevels=groupRefs(c,x.unlockLevels||[]);if('enabled'in x)r.enabled=x.enabled!==false;changed++;});
    list.filter(a=>a.type==='update_settings').forEach(a=>{c.settings={...c.settings,...(a.changes||{})};changed++;});list.filter(a=>a.type==='update_spin_style').forEach(a=>{Object.assign(spin,a.changes||{});changed++;});
    list.filter(a=>a.type==='remove_rule').forEach(a=>{const r=resolveRule(c,a.id);if(!r)throw new Error(`Unknown rule: ${a.id}`);c.rules=c.rules.filter(x=>x.id!==r.id);changed++;});
    list.filter(a=>a.type==='remove_forfeit').forEach(a=>{const f=resolveForfeit(c,a.id);if(!f)throw new Error(`Unknown forfeit: ${a.id}`);c.forfeits=c.forfeits.filter(x=>x.id!==f.id);c.forfeits.forEach(x=>x.requiresForfeitIds=(x.requiresForfeitIds||[]).filter(id=>id!==f.id));c.rules.forEach(r=>r.conditionForfeitIds=(r.conditionForfeitIds||[]).filter(id=>id!==f.id));changed++;});
    list.filter(a=>a.type==='remove_group').forEach(a=>{const g=resolveGroup(c,a.id);if(!g)throw new Error(`Unknown group: ${a.id}`);if(c.forfeits.some(f=>f.levelId===g.id))throw new Error(`Group ${g.name} still contains forfeits. Move or remove them first.`);c.levels=c.levels.filter(x=>x.id!==g.id);c.forfeits.forEach(f=>f.unlockLevels=(f.unlockLevels||[]).filter(id=>id!==g.id));c.rules.forEach(r=>r.unlockLevels=(r.unlockLevels||[]).filter(id=>id!==g.id));changed++;});
    if(!c.levels.length)throw new Error('The wheel must contain at least one group.');if(!c.levels.some(g=>g.activeAtStart))c.levels[0].activeAtStart=true;assertNoDependencyCycles(c);
    if(changed){state.undo={config:before,spin:beforeSpin};D.replace(c);const saved=M.saveConfig(c);M.resetSession(saved);S?.save?.(spin);if($('undoAiBtn'))$('undoAiBtn').disabled=false;refreshStats();}
    return changed;
  }

  function refreshStats(){const c=M.loadConfig();if($('chatGroupCount'))$('chatGroupCount').textContent=c.levels.length;if($('chatForfeitCount'))$('chatForfeitCount').textContent=c.forfeits.length;if($('chatRuleCount'))$('chatRuleCount').textContent=(c.rules||[]).length;const badge=$('logicBadge');if(badge){try{assertNoDependencyCycles(c);badge.textContent='Logic OK';badge.classList.remove('warn');}catch(_){badge.textContent='Logic warning';badge.classList.add('warn');}}}
  async function sendMessage(forced='',options={}){
    if(state.busy)return;const input=$('chatInput'),text=String(forced||input?.value||'').trim();if(!text)return;if(!selectedModel()){setStatus('Choose a model first.','error');addMessage('system','Choose a model before sending.');return;}if(!token()){setStatus('Enter API token first.','error');addMessage('system','Enter your API token before sending.');return;}if(input&&!forced)input.value='';addMessage('user',options.retry?`↻ Retry: ${text}`:text);const pending=addMessage('system','⏳ AI is working on the wheel…','Preparing · 0s elapsed');startWork('Preparing complete wheel model');const mode=requestMode(text);
    try{const answer=await getStructured(text,mode,!!options.strict);setPhase('Validating patch');const actions=Array.isArray(answer?.actions)?answer.actions:[],satisfied=answer?.assessment?.alreadySatisfied===true;let changed=0;if(actions.length){setPhase('Applying wheel changes');changed=applyActions(actions);}if(mode==='edit'&&!changed&&!satisfied)throw new Error('The AI returned no executable wheel changes. Nothing was saved.');pending?.remove();const reply=String(answer?.reply||(changed?'Done.':'No changes were needed.'));let meta=changed?`✓ Applied ${changed} wheel change${changed===1?'':'s'}`:'✓ Checked · no changes needed';if(satisfied&&answer?.assessment?.findings?.length)meta+=` · ${answer.assessment.findings.length} finding${answer.assessment.findings.length===1?'':'s'}`;addMessage('assistant',reply,meta);state.history.push({role:'user',content:text},{role:'assistant',content:reply});state.history=state.history.slice(-6);state.lastFailed=null;setStatus(changed?`Applied ${changed} wheel change${changed===1?'':'s'}.`:'Check completed.','ok');if(changed)window.dispatchEvent(new CustomEvent('fortune-ai-applied',{detail:{count:changed}}));}
    catch(error){pending?.remove();state.lastFailed=text;addMessage('assistant',`I could not complete that request: ${error.message}`,'Not applied',text);setStatus(`Request failed: ${error.message}`,'error');}
    finally{stopWork();input?.focus();}
  }
  function undoLast(){if(!state.undo)return;D.replace(state.undo.config);const saved=M.saveConfig(state.undo.config);M.resetSession(saved);S?.save?.(state.undo.spin);state.undo=null;if($('undoAiBtn'))$('undoAiBtn').disabled=true;refreshStats();addMessage('system','Last AI edit undone.');setStatus('Last AI edit undone.','ok');window.dispatchEvent(new CustomEvent('fortune-ai-applied',{detail:{count:0,undo:true}}));}
  function clearChat(){state.history=[];const box=$('chatMessages');if(box)box.innerHTML='';addMessage('system','Chat cleared. The next request still receives the complete current wheel model.');}
  function install(){injectStyles();refreshStats();$('loadModelsBtn')?.addEventListener('click',loadModels);$('modelFilter')?.addEventListener('input',renderModels);$('testAiBtn')?.addEventListener('click',testApi);$('sendAiBtn')?.addEventListener('click',()=>sendMessage());$('undoAiBtn')?.addEventListener('click',undoLast);$('clearChatBtn')?.addEventListener('click',clearChat);$('chatInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});$('chatMessages')?.addEventListener('click',e=>{const b=e.target.closest('.ai-retry-btn');if(!b)return;const text=b.dataset.retryText||state.lastFailed||'';if(text)sendMessage(text,{retry:true,strict:true});});$('aiProvider')?.addEventListener('change',()=>{const suggested=providerDefaults(provider());if(suggested&&$('aiEndpoint'))$('aiEndpoint').value=suggested;state.models=[];renderModels();});$('toggleToken')?.addEventListener('click',()=>{const field=$('aiToken');if(!field)return;const show=field.type==='password';field.type=show?'text':'password';$('toggleToken').textContent=show?'Hide':'Show';});document.querySelectorAll('[data-ai-command]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.aiCommand||'')));addMessage('system','AI engine ready. It receives the complete behavior model plus the current groups, forfeits, prerequisites, reverse dependents, rules and spin settings. Complex edits get a planning pass before patches are applied.');if($('aiModel')?.dataset.restoreModel)setTimeout(loadModels,120);if($('aiStatus')?.parentElement&&!$('aiStatus').parentElement.querySelector('.ai-engine-note')){const note=document.createElement('div');note.className='ai-engine-note';note.textContent='Complex edits: understand → plan → patch → validate → save. Failed edits include a Retry button.';$('aiStatus').insertAdjacentElement('afterend',note);}}

  window.FortuneAiEditorEngine={loadModels,testApi,sendMessage,refreshStats,requestMode,engineGuide:ENGINE_GUIDE,currentContext};
  install();
})();
