(() => {
  'use strict';

  const CONFIG_KEY = 'fortune-engine-config-v1';
  const SESSION_KEY = 'fortune-engine-session-v1';

  const DEFAULT_CONFIG = {
    version: 1,
    settings: {
      title: 'Fortune Engine',
      minSpinSeconds: 6.5,
      maxSpinSeconds: 9.5,
      minTurns: 6,
      soundEnabled: true,
      showTextOnWheel: false,
      showProbabilities: true
    },
    levels: [
      { id: 'start', name: 'Start', icon: '✦', color: '#57d3ff', activeAtStart: true },
      { id: 'clothing', name: 'Clothing', icon: '👕', color: '#8b7cff', activeAtStart: false },
      { id: 'tickling', name: 'Tickling', icon: '🪶', color: '#ff6bd6', activeAtStart: false },
      { id: 'chaos', name: 'Chaos', icon: '⚡', color: '#ffb454', activeAtStart: false }
    ],
    forfeits: [
      {
        id: 'starter-choice', name: 'Choose a Challenge', icon: '🎯', color: '#4cc9f0', weight: 4,
        levelId: 'start', category: 'Challenge', description: 'Pick one quick challenge for the other player.',
        animation: 'zoom', lifetime: { type: 'forever', spins: 0 }, cooldown: 1,
        eventType: 'normal', mystery: false, enabled: true, unlockLevels: []
      },
      {
        id: 'shoes-off', name: 'Shoes Off', icon: '👟', color: '#8b5cf6', weight: 3,
        levelId: 'start', category: 'Clothing', description: 'Shoes come off. This also opens the clothing group.',
        animation: 'pulse', lifetime: { type: 'once', spins: 0 }, cooldown: 0,
        eventType: 'unlock', mystery: false, enabled: true, unlockLevels: ['clothing']
      },
      {
        id: 'mystery-one', name: 'Mystery Challenge', icon: '🎁', color: '#ec4899', weight: 2,
        levelId: 'start', category: 'Mystery', description: 'A hidden challenge is revealed only after the wheel stops.',
        animation: 'flash', lifetime: { type: 'forever', spins: 0 }, cooldown: 2,
        eventType: 'normal', mystery: true, enabled: true, unlockLevels: []
      },
      {
        id: 'unlock-tickling', name: 'Unlock Tickling', icon: '🪶', color: '#f472b6', weight: 1.5,
        levelId: 'clothing', category: 'Unlock', description: 'The tickling group is now active.',
        animation: 'confetti', lifetime: { type: 'once', spins: 0 }, cooldown: 0,
        eventType: 'unlock', mystery: false, enabled: true, unlockLevels: ['tickling']
      },
      {
        id: 'tickle-short', name: 'Quick Tickle', icon: '🪶', color: '#fb7185', weight: 3,
        levelId: 'tickling', category: 'Tickling', description: 'A short tickling challenge.',
        animation: 'shake', lifetime: { type: 'forever', spins: 0 }, cooldown: 2,
        eventType: 'normal', mystery: false, enabled: true, unlockLevels: []
      },
      {
        id: 'chaos-key', name: 'Chaos Key', icon: '🔑', color: '#f59e0b', weight: 1,
        levelId: 'tickling', category: 'Unlock', description: 'Unlocks the Chaos group.',
        animation: 'confetti', lifetime: { type: 'once', spins: 0 }, cooldown: 0,
        eventType: 'unlock', mystery: true, enabled: true, unlockLevels: ['chaos']
      },
      {
        id: 'spin-again', name: 'Spin Again', icon: '🔁', color: '#22c55e', weight: 1.5,
        levelId: 'chaos', category: 'Event', description: 'No escape yet — spin one more time.',
        animation: 'pulse', lifetime: { type: 'forever', spins: 0 }, cooldown: 1,
        eventType: 'spinAgain', mystery: false, enabled: true, unlockLevels: []
      },
      {
        id: 'randomize', name: 'Chaos Shuffle', icon: '🎲', color: '#eab308', weight: 1,
        levelId: 'chaos', category: 'Event', description: 'Active wheel weights are randomly shifted for the rest of the session.',
        animation: 'flash', lifetime: { type: 'forever', spins: 0 }, cooldown: 3,
        eventType: 'randomize', mystery: false, enabled: true, unlockLevels: []
      }
    ],
    rules: [
      {
        id: 'rule-demo', name: 'Example combined unlock', mode: 'all',
        conditionForfeitIds: ['shoes-off', 'starter-choice'], unlockLevels: [], enabled: false
      }
    ]
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix = 'item') {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function cleanColor(value, fallback = '#64748b') {
    const v = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  }

  function sanitizeConfig(input) {
    const cfg = input && typeof input === 'object' ? input : {};
    const settings = cfg.settings || {};
    const rawLevels = Array.isArray(cfg.levels) ? cfg.levels : [];
    const levels = rawLevels.map((level, index) => ({
      id: String(level.id || makeId('group')).replace(/[^a-zA-Z0-9_-]/g, '-'),
      name: String(level.name || `Group ${index + 1}`).slice(0, 40),
      icon: String(level.icon || '●').slice(0, 10),
      color: cleanColor(level.color, '#64748b'),
      activeAtStart: Boolean(level.activeAtStart)
    }));

    if (!levels.length) {
      levels.push({ id: 'start', name: 'Start', icon: '✦', color: '#57d3ff', activeAtStart: true });
    }
    if (!levels.some(level => level.activeAtStart)) levels[0].activeAtStart = true;

    const levelIds = new Set(levels.map(level => level.id));
    const fallbackLevel = levels[0].id;
    const rawForfeits = Array.isArray(cfg.forfeits) ? cfg.forfeits : [];
    const forfeits = rawForfeits.map((item, index) => {
      const lifetime = item.lifetime || {};
      return {
        id: String(item.id || makeId('forfeit')).replace(/[^a-zA-Z0-9_-]/g, '-'),
        name: String(item.name || `Forfeit ${index + 1}`).slice(0, 60),
        icon: String(item.icon || '🎯').slice(0, 12),
        color: cleanColor(item.color, '#64748b'),
        weight: clampNumber(item.weight, 0.1, 100, 1),
        levelId: levelIds.has(item.levelId) ? item.levelId : fallbackLevel,
        category: String(item.category || 'Challenge').slice(0, 30),
        description: String(item.description || '').slice(0, 240),
        animation: ['zoom', 'shake', 'pulse', 'flash', 'confetti'].includes(item.animation) ? item.animation : 'zoom',
        lifetime: {
          type: ['forever', 'once', 'spins'].includes(lifetime.type) ? lifetime.type : 'forever',
          spins: Math.round(clampNumber(lifetime.spins, 1, 999, 3))
        },
        cooldown: Math.round(clampNumber(item.cooldown, 0, 99, 0)),
        eventType: ['normal', 'spinAgain', 'unlock', 'doubleSpin', 'immunity', 'randomize'].includes(item.eventType) ? item.eventType : 'normal',
        mystery: Boolean(item.mystery),
        enabled: item.enabled !== false,
        unlockLevels: Array.isArray(item.unlockLevels) ? item.unlockLevels.filter(id => levelIds.has(id)) : []
      };
    });

    const forfeitIds = new Set(forfeits.map(item => item.id));
    const rawRules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const rules = rawRules.map((rule, index) => ({
      id: String(rule.id || makeId('rule')).replace(/[^a-zA-Z0-9_-]/g, '-'),
      name: String(rule.name || `Rule ${index + 1}`).slice(0, 60),
      mode: rule.mode === 'any' ? 'any' : 'all',
      conditionForfeitIds: Array.isArray(rule.conditionForfeitIds) ? rule.conditionForfeitIds.filter(id => forfeitIds.has(id)) : [],
      unlockLevels: Array.isArray(rule.unlockLevels) ? rule.unlockLevels.filter(id => levelIds.has(id)) : [],
      enabled: rule.enabled !== false
    }));

    return {
      version: 1,
      settings: {
        title: String(settings.title || 'Fortune Engine').slice(0, 60),
        minSpinSeconds: clampNumber(settings.minSpinSeconds, 3, 20, 6.5),
        maxSpinSeconds: clampNumber(settings.maxSpinSeconds, 3, 25, 9.5),
        minTurns: Math.round(clampNumber(settings.minTurns, 3, 20, 6)),
        soundEnabled: settings.soundEnabled !== false,
        showTextOnWheel: Boolean(settings.showTextOnWheel),
        showProbabilities: settings.showProbabilities !== false
      },
      levels,
      forfeits,
      rules
    };
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return sanitizeConfig(JSON.parse(raw));
    } catch (error) {
      console.warn('Could not load saved configuration:', error);
    }
    return sanitizeConfig(deepClone(DEFAULT_CONFIG));
  }

  function saveConfig(config) {
    const clean = sanitizeConfig(config);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    return clean;
  }

  function createSession(config) {
    const cfg = sanitizeConfig(config);
    const activeLevels = {};
    cfg.levels.forEach(level => { activeLevels[level.id] = Boolean(level.activeAtStart); });
    const runtime = {};
    cfg.forfeits.forEach(item => {
      runtime[item.id] = {
        removed: false,
        cooldown: 0,
        remainingSpins: item.lifetime.type === 'spins' ? item.lifetime.spins : null,
        weightMultiplier: 1
      };
    });
    return {
      version: 1,
      configSignature: signature(cfg),
      spinCount: 0,
      activeLevels,
      runtime,
      history: [],
      undoStack: [],
      immunityTokens: 0,
      doubleSpinTokens: 0
    };
  }

  function signature(config) {
    return JSON.stringify({
      levels: config.levels.map(l => [l.id, l.activeAtStart]),
      forfeits: config.forfeits.map(f => [f.id, f.levelId, f.weight, f.enabled, f.lifetime.type, f.lifetime.spins, f.cooldown]),
      rules: config.rules.map(r => [r.id, r.mode, r.enabled, r.conditionForfeitIds, r.unlockLevels])
    });
  }

  function loadSession(config) {
    const cfg = sanitizeConfig(config);
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.configSignature === signature(cfg)) return parsed;
      }
    } catch (error) {
      console.warn('Could not load session:', error);
    }
    return createSession(cfg);
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function resetSession(config) {
    const session = createSession(config);
    saveSession(session);
    return session;
  }

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function configToXml(config) {
    const cfg = sanitizeConfig(config);
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<fortuneEngine version="1">'];
    const s = cfg.settings;
    lines.push(`  <settings title="${xmlEscape(s.title)}" minSpinSeconds="${s.minSpinSeconds}" maxSpinSeconds="${s.maxSpinSeconds}" minTurns="${s.minTurns}" soundEnabled="${s.soundEnabled}" showTextOnWheel="${s.showTextOnWheel}" showProbabilities="${s.showProbabilities}" />`);
    lines.push('  <groups>');
    cfg.levels.forEach(level => {
      lines.push(`    <group id="${xmlEscape(level.id)}" name="${xmlEscape(level.name)}" icon="${xmlEscape(level.icon)}" color="${xmlEscape(level.color)}" activeAtStart="${level.activeAtStart}" />`);
    });
    lines.push('  </groups>');
    lines.push('  <forfeits>');
    cfg.forfeits.forEach(item => {
      lines.push(`    <forfeit id="${xmlEscape(item.id)}" name="${xmlEscape(item.name)}" icon="${xmlEscape(item.icon)}" color="${xmlEscape(item.color)}" weight="${item.weight}" group="${xmlEscape(item.levelId)}" category="${xmlEscape(item.category)}" animation="${xmlEscape(item.animation)}" lifetime="${xmlEscape(item.lifetime.type)}" lifetimeSpins="${item.lifetime.spins}" cooldown="${item.cooldown}" eventType="${xmlEscape(item.eventType)}" mystery="${item.mystery}" enabled="${item.enabled}">`);
      lines.push(`      <description>${xmlEscape(item.description)}</description>`);
      lines.push('      <unlocks>');
      item.unlockLevels.forEach(id => lines.push(`        <group ref="${xmlEscape(id)}" />`));
      lines.push('      </unlocks>');
      lines.push('    </forfeit>');
    });
    lines.push('  </forfeits>');
    lines.push('  <rules>');
    cfg.rules.forEach(rule => {
      lines.push(`    <rule id="${xmlEscape(rule.id)}" name="${xmlEscape(rule.name)}" mode="${xmlEscape(rule.mode)}" enabled="${rule.enabled}">`);
      lines.push('      <conditions>');
      rule.conditionForfeitIds.forEach(id => lines.push(`        <forfeit ref="${xmlEscape(id)}" />`));
      lines.push('      </conditions>');
      lines.push('      <unlocks>');
      rule.unlockLevels.forEach(id => lines.push(`        <group ref="${xmlEscape(id)}" />`));
      lines.push('      </unlocks>');
      lines.push('    </rule>');
    });
    lines.push('  </rules>');
    lines.push('</fortuneEngine>');
    return lines.join('\n');
  }

  function attr(node, name, fallback = '') {
    const value = node.getAttribute(name);
    return value === null ? fallback : value;
  }

  function boolAttr(node, name, fallback = false) {
    const value = node.getAttribute(name);
    if (value === null) return fallback;
    return value === 'true' || value === '1';
  }

  function xmlToConfig(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(xmlText), 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('Invalid XML file.');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'fortuneEngine') throw new Error('This is not a Fortune Engine XML file.');

    const settingsNode = root.querySelector(':scope > settings');
    const levels = [...root.querySelectorAll(':scope > groups > group')].map(node => ({
      id: attr(node, 'id', makeId('group')),
      name: attr(node, 'name', 'Group'),
      icon: attr(node, 'icon', '●'),
      color: attr(node, 'color', '#64748b'),
      activeAtStart: boolAttr(node, 'activeAtStart', false)
    }));

    const forfeits = [...root.querySelectorAll(':scope > forfeits > forfeit')].map(node => ({
      id: attr(node, 'id', makeId('forfeit')),
      name: attr(node, 'name', 'Forfeit'),
      icon: attr(node, 'icon', '🎯'),
      color: attr(node, 'color', '#64748b'),
      weight: Number(attr(node, 'weight', '1')),
      levelId: attr(node, 'group', levels[0]?.id || 'start'),
      category: attr(node, 'category', 'Challenge'),
      description: node.querySelector(':scope > description')?.textContent || '',
      animation: attr(node, 'animation', 'zoom'),
      lifetime: {
        type: attr(node, 'lifetime', 'forever'),
        spins: Number(attr(node, 'lifetimeSpins', '3'))
      },
      cooldown: Number(attr(node, 'cooldown', '0')),
      eventType: attr(node, 'eventType', 'normal'),
      mystery: boolAttr(node, 'mystery', false),
      enabled: boolAttr(node, 'enabled', true),
      unlockLevels: [...node.querySelectorAll(':scope > unlocks > group')].map(group => attr(group, 'ref')).filter(Boolean)
    }));

    const rules = [...root.querySelectorAll(':scope > rules > rule')].map(node => ({
      id: attr(node, 'id', makeId('rule')),
      name: attr(node, 'name', 'Rule'),
      mode: attr(node, 'mode', 'all'),
      enabled: boolAttr(node, 'enabled', true),
      conditionForfeitIds: [...node.querySelectorAll(':scope > conditions > forfeit')].map(entry => attr(entry, 'ref')).filter(Boolean),
      unlockLevels: [...node.querySelectorAll(':scope > unlocks > group')].map(group => attr(group, 'ref')).filter(Boolean)
    }));

    return sanitizeConfig({
      version: 1,
      settings: {
        title: settingsNode ? attr(settingsNode, 'title', 'Fortune Engine') : 'Fortune Engine',
        minSpinSeconds: settingsNode ? Number(attr(settingsNode, 'minSpinSeconds', '6.5')) : 6.5,
        maxSpinSeconds: settingsNode ? Number(attr(settingsNode, 'maxSpinSeconds', '9.5')) : 9.5,
        minTurns: settingsNode ? Number(attr(settingsNode, 'minTurns', '6')) : 6,
        soundEnabled: settingsNode ? boolAttr(settingsNode, 'soundEnabled', true) : true,
        showTextOnWheel: settingsNode ? boolAttr(settingsNode, 'showTextOnWheel', false) : false,
        showProbabilities: settingsNode ? boolAttr(settingsNode, 'showProbabilities', true) : true
      },
      levels,
      forfeits,
      rules
    });
  }

  function downloadXml(config, filename = 'fortune-wheel.xml') {
    const blob = new Blob([configToXml(config)], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readXmlFile(file) {
    if (!file) throw new Error('No XML file selected.');
    if (file.size > 2_000_000) throw new Error('XML file is too large.');
    return xmlToConfig(await file.text());
  }

  window.FortuneModel = {
    CONFIG_KEY,
    SESSION_KEY,
    DEFAULT_CONFIG: deepClone(DEFAULT_CONFIG),
    deepClone,
    makeId,
    sanitizeConfig,
    loadConfig,
    saveConfig,
    createSession,
    loadSession,
    saveSession,
    resetSession,
    signature,
    configToXml,
    xmlToConfig,
    downloadXml,
    readXmlFile
  };
})();
