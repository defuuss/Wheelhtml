(() => {
  'use strict';
  const M = window.FortuneModel;
  const S = window.FortuneSpinStyle;
  if (!M) return;

  const $ = id => document.getElementById(id);
  let proposal = null;

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function toast(message) {
    const node = $('aiToast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function setStatus(message, type = '') {
    const node = $('aiStatus');
    node.textContent = message;
    node.className = `ai-status ${type}`.trim();
  }

  function currentContext() {
    return {
      config: M.loadConfig(),
      spinStyle: S?.load?.() || {
        maxTurns: 9,
        dramaEnabled: true,
        dramaChance: 35,
        dramaExtraMinTurns: 1,
        dramaExtraMaxTurns: 2,
        showSlowIcon: true
      }
    };
  }

  function systemPrompt(mode, current) {
    return `You are the configuration engine for a browser game called Fortune Engine. Return ONLY valid JSON. No markdown, no code fences, no commentary outside the JSON object.

GOAL
Translate the user's natural-language game design into a complete Fortune Engine configuration. The editor is visual, groups are independent unlock switches, and the wheel can change during play.

RETURN EXACTLY THIS TOP-LEVEL SHAPE
{
  "summary": "short plain-language summary of what you changed",
  "config": {
    "version": 1,
    "settings": {
      "title": "string up to 60 characters",
      "minSpinSeconds": 3-20,
      "maxSpinSeconds": 3-25,
      "minTurns": 3-20,
      "soundEnabled": true,
      "showTextOnWheel": false,
      "showProbabilities": true
    },
    "levels": [
      {"id":"unique-kebab-id","name":"Group name","icon":"one Unicode pictogram","color":"#RRGGBB","activeAtStart":false}
    ],
    "forfeits": [
      {
        "id":"unique-kebab-id",
        "name":"THE REAL RESULT NAME",
        "icon":"one Unicode pictogram",
        "color":"#RRGGBB",
        "weight":1,
        "levelId":"existing-group-id",
        "category":"short category",
        "description":"clear description of what happens when selected",
        "animation":"zoom|shake|pulse|flash|confetti",
        "lifetime":{"type":"forever|once|spins","spins":3},
        "cooldown":0,
        "eventType":"normal|spinAgain|unlock|doubleSpin|immunity|randomize",
        "mystery":false,
        "enabled":true,
        "unlockLevels":["group-id"]
      }
    ],
    "rules": [
      {
        "id":"unique-kebab-id",
        "name":"Rule name",
        "mode":"all|any",
        "conditionForfeitIds":["forfeit-id"],
        "unlockLevels":["group-id"],
        "enabled":true
      }
    ]
  },
  "spinStyle": {
    "maxTurns": 3-24,
    "dramaEnabled": true,
    "dramaChance": 0-100,
    "dramaExtraMinTurns": 1-3,
    "dramaExtraMaxTurns": 1-4,
    "showSlowIcon": true
  }
}

IMPORTANT GAME RULES
1. Groups are NOT a linear level ladder. They are independent switches. Several groups may be active simultaneously and several may unlock from one result.
2. Every forfeit belongs to exactly one levelId/group.
3. weight controls both visual segment size and actual probability. Use varied but understandable weights, normally around 0.5-6 unless the user requests otherwise.
4. cooldown is the number of subsequent spins during which the selected forfeit is temporarily unavailable.
5. lifetime forever = never automatically removed. once = remove after it is selected. spins = remain active for a limited number of spins after its group is active.
6. Direct unlock: put target group IDs in a forfeit's unlockLevels. Use rules only for conditions involving multiple results or OR logic.
7. Rules with mode=all require every listed result to have occurred. mode=any requires at least one.
8. Mystery is ONLY a display mode. If mystery=true, name/icon/description MUST contain the REAL hidden result. Never create a generic item named only "Mystery Challenge" unless that phrase itself is truly the final result. Before selection, the wheel automatically hides name/icon and shows ❓. After selection, it reveals the real data.
9. Pick meaningful pictograms. Standard Unicode emoji only. Good examples include 🪒 razor, 💉 syringe, 🧹 cleaning, 🪶 tickling, ✂️ cutting, 👟 shoes, 🧦 socks, 🤢 disgusting, 😳 humiliation, ⛓️ restraint approximation, 🤐 gag approximation.
10. Prefer short result names and useful descriptions. Do not put configuration explanations into a player's challenge description.
11. Keep all references valid: levelId/unlockLevels must match level IDs; rule condition IDs must match forfeit IDs.
12. At least one group must have activeAtStart=true.
13. minSpinSeconds <= maxSpinSeconds. minTurns <= spinStyle.maxTurns. dramaExtraMinTurns <= dramaExtraMaxTurns.
14. The slow-finish live icon is controlled by showSlowIcon. Mystery entries remain ❓ during the slow finish.
15. Preserve the user's requested tone, categories and progression structure.

MODE
${mode === 'modify' ? 'MODIFY CURRENT WHEEL. Preserve existing IDs and existing content unless the user explicitly asks to replace/remove/change them. Add to the current structure rather than rebuilding it unnecessarily.' : 'CREATE A NEW WHEEL FROM SCRATCH. Build a coherent complete configuration from the user request.'}

CURRENT WHEEL CONTEXT
${mode === 'modify' ? JSON.stringify(current) : 'Not supplied because the user selected Create new wheel.'}`;
  }

  function parseJsonResponse(text) {
    let raw = String(text || '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    return JSON.parse(raw);
  }

  function cleanSpinStyle(input = {}, config) {
    const minTurns = Math.round(clamp(config.settings?.minTurns, 3, 20, 6));
    const minExtra = Math.round(clamp(input.dramaExtraMinTurns, 1, 3, 1));
    return {
      maxTurns: Math.round(clamp(input.maxTurns, minTurns, 24, Math.max(minTurns, 9))),
      dramaEnabled: input.dramaEnabled !== false,
      dramaChance: Math.round(clamp(input.dramaChance, 0, 100, 35)),
      dramaExtraMinTurns: minExtra,
      dramaExtraMaxTurns: Math.round(clamp(input.dramaExtraMaxTurns, minExtra, 4, Math.max(minExtra, 2))),
      showSlowIcon: input.showSlowIcon !== false
    };
  }

  function normalizeProposal(value) {
    const rawConfig = value?.config || value;
    if (!rawConfig || !Array.isArray(rawConfig.levels) || !Array.isArray(rawConfig.forfeits)) {
      throw new Error('The AI response did not contain a valid wheel configuration.');
    }
    const cleanConfig = M.xmlToConfig(M.configToXml(rawConfig));
    const spinStyle = cleanSpinStyle(value?.spinStyle || currentContext().spinStyle, cleanConfig);
    return {
      summary: String(value?.summary || 'AI-generated wheel configuration.').slice(0, 500),
      config: cleanConfig,
      spinStyle
    };
  }

  function extractContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(part => part?.text || part?.content || '').join('');
    if (typeof data?.output_text === 'string') return data.output_text;
    if (Array.isArray(data?.output)) {
      return data.output.flatMap(item => item?.content || []).map(part => part?.text || '').join('');
    }
    throw new Error('The provider returned no readable text response.');
  }

  async function generate() {
    const endpoint = $('aiEndpoint').value.trim();
    const model = $('aiModel').value.trim();
    const token = $('aiToken').value.trim();
    const userPrompt = $('aiPrompt').value.trim();
    const mode = $('aiMode').value;

    if (!endpoint || !/^https:\/\//i.test(endpoint)) return setStatus('Enter a valid HTTPS API endpoint.', 'error');
    if (!model) return setStatus('Enter the model name used by your provider.', 'error');
    if (!token) return setStatus('Enter an API token for this session.', 'error');
    if (userPrompt.length < 10) return setStatus('Describe the wheel you want in a little more detail.', 'error');

    const button = $('generateAiBtn');
    button.disabled = true;
    button.textContent = 'Generating…';
    setStatus('Sending your wheel description to the selected AI…', 'working');
    $('proposalState').textContent = 'Generating';

    try {
      const current = currentContext();
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      if ($('aiProvider').value === 'openrouter') {
        headers['HTTP-Referer'] = location.origin + location.pathname;
        headers['X-Title'] = 'Fortune Engine AI Setup';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt(mode, current) },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.25,
          max_tokens: 7000
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || data?.message || `Provider returned HTTP ${response.status}.`;
        throw new Error(message);
      }

      proposal = normalizeProposal(parseJsonResponse(extractContent(data)));
      renderProposal();
      setStatus('Proposal generated. Review it before applying.', '');
      $('proposalState').textContent = 'Ready';
      toast('AI proposal ready.');
    } catch (error) {
      console.error(error);
      let message = error?.message || 'Could not generate the wheel.';
      if (error instanceof TypeError && /fetch/i.test(message)) {
        message = 'The browser could not reach that API endpoint. The provider may block browser/CORS requests; try OpenRouter or a provider that allows browser requests.';
      }
      setStatus(message, 'error');
      $('proposalState').textContent = 'Error';
    } finally {
      button.disabled = false;
      button.textContent = '✦ Generate proposal';
    }
  }

  function addProposalItem(container, icon, name, detail, meta = '') {
    const row = document.createElement('div');
    row.className = 'proposal-item';
    const iconNode = document.createElement('span');
    iconNode.className = 'proposal-item-icon';
    iconNode.textContent = icon || '◆';
    const copy = document.createElement('span');
    copy.className = 'proposal-item-copy';
    const strong = document.createElement('strong');
    strong.textContent = name;
    const small = document.createElement('small');
    small.textContent = detail;
    copy.append(strong, small);
    const metaNode = document.createElement('span');
    metaNode.className = 'proposal-item-meta';
    metaNode.textContent = meta;
    row.append(iconNode, copy, metaNode);
    container.appendChild(row);
  }

  function renderProposal() {
    if (!proposal) return;
    $('proposalEmpty').hidden = true;
    $('proposalPreview').hidden = false;
    $('proposalSummary').textContent = proposal.summary;
    $('proposalGroups').textContent = proposal.config.levels.length;
    $('proposalForfeits').textContent = proposal.config.forfeits.length;
    $('proposalRules').textContent = proposal.config.rules.length;

    const groups = $('proposalGroupList');
    groups.innerHTML = '';
    proposal.config.levels.forEach(level => {
      const count = proposal.config.forfeits.filter(item => item.levelId === level.id).length;
      addProposalItem(groups, level.icon, level.name, `${count} forfeits`, level.activeAtStart ? 'START' : 'LOCKED');
    });

    const forfeits = $('proposalForfeitList');
    forfeits.innerHTML = '';
    proposal.config.forfeits.slice(0, 18).forEach(item => {
      const level = proposal.config.levels.find(l => l.id === item.levelId);
      addProposalItem(
        forfeits,
        item.mystery ? '❓' : item.icon,
        item.mystery ? `Mystery → ${item.name}` : item.name,
        `${level?.name || item.levelId} · ${item.category}`,
        `w ${Number(item.weight).toFixed(1)}`
      );
    });
    if (proposal.config.forfeits.length > 18) {
      const more = document.createElement('div');
      more.className = 'proposal-spin';
      more.textContent = `+ ${proposal.config.forfeits.length - 18} more forfeits not shown in this compact preview.`;
      forfeits.appendChild(more);
    }

    const s = proposal.spinStyle;
    $('proposalSpinStyle').textContent = `${proposal.config.settings.minSpinSeconds}–${proposal.config.settings.maxSpinSeconds}s · ${proposal.config.settings.minTurns}–${s.maxTurns} turns · second wind ${s.dramaEnabled ? `${s.dramaChance}%` : 'off'} · slow icon ${s.showSlowIcon ? 'on' : 'off'}`;
  }

  function applyProposal() {
    if (!proposal) return;
    const clean = M.saveConfig(proposal.config);
    M.resetSession(clean);
    S?.save?.(proposal.spinStyle);
    setStatus('Applied. A fresh play session now uses the AI configuration.', '');
    $('proposalState').textContent = 'Applied';
    toast('AI configuration applied.');
  }

  function proposalXml() {
    if (!proposal) return '';
    const s = proposal.spinStyle;
    return M.configToXml(proposal.config).replace(/<settings\b([^>]*)\/>/, (_match, attrs) => {
      return `<settings${attrs} maxTurns="${s.maxTurns}" dramaEnabled="${s.dramaEnabled}" dramaChance="${s.dramaChance}" dramaExtraMinTurns="${s.dramaExtraMinTurns}" dramaExtraMaxTurns="${s.dramaExtraMaxTurns}" showSlowIcon="${s.showSlowIcon}" />`;
    });
  }

  function downloadProposal() {
    if (!proposal) return;
    const blob = new Blob([proposalXml()], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fortune-wheel-ai-proposal.xml';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function init() {
    $('aiProvider').addEventListener('change', () => {
      if ($('aiProvider').value === 'openrouter') $('aiEndpoint').value = 'https://openrouter.ai/api/v1/chat/completions';
    });
    $('toggleToken').addEventListener('click', () => {
      const input = $('aiToken');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('toggleToken').textContent = show ? 'Hide' : 'Show';
    });
    document.querySelectorAll('.prompt-chip').forEach(button => button.addEventListener('click', () => {
      const input = $('aiPrompt');
      const addition = button.dataset.prompt || '';
      input.value = `${input.value.trim()}${input.value.trim() ? '\n\n' : ''}${addition}`;
      input.focus();
    }));
    $('generateAiBtn').addEventListener('click', generate);
    $('applyProposalBtn').addEventListener('click', applyProposal);
    $('downloadProposalBtn').addEventListener('click', downloadProposal);
  }

  init();
})();
