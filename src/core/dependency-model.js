(() => {
  'use strict';

  const M = window.FortuneModel;
  if (!M || window.__fortuneDependencyModel) return;
  window.__fortuneDependencyModel = true;

  const base = {
    sanitizeConfig: M.sanitizeConfig,
    loadConfig: M.loadConfig,
    saveConfig: M.saveConfig,
    createSession: M.createSession,
    loadSession: M.loadSession,
    saveSession: M.saveSession,
    resetSession: M.resetSession,
    signature: M.signature,
    configToXml: M.configToXml,
    xmlToConfig: M.xmlToConfig,
    downloadXml: M.downloadXml,
    readXmlFile: M.readXmlFile
  };

  const sidecar = { forfeits: new Map(), rules: new Map() };
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function cleanReq(raw, validIds, ownId) {
    const ids = Array.isArray(raw?.requiresForfeitIds) ? raw.requiresForfeitIds : [];
    return [...new Set(ids.map(String).filter(id => id !== ownId && validIds.has(id)))];
  }

  function sanitizeConfig(input) {
    const src = input && typeof input === 'object' ? clone(input) : {};
    const clean = base.sanitizeConfig(src);
    const rawForfeits = new Map((Array.isArray(src.forfeits) ? src.forfeits : []).map(x => [String(x?.id || ''), x]));
    const validForfeits = new Set(clean.forfeits.map(x => x.id));

    clean.forfeits.forEach(item => {
      const raw = rawForfeits.get(item.id) || {};
      item.requiresMode = raw.requiresMode === 'any' ? 'any' : 'all';
      item.requiresForfeitIds = cleanReq(raw, validForfeits, item.id);
    });

    const rawRules = new Map((Array.isArray(src.rules) ? src.rules : []).map(x => [String(x?.id || ''), x]));
    clean.rules.forEach(rule => {
      const raw = rawRules.get(rule.id) || {};
      rule.minOccurrences = Math.round(clamp(raw.minOccurrences, 1, 99, 1));
      if (Object.prototype.hasOwnProperty.call(raw, '_configuredEnabled')) {
        rule._configuredEnabled = raw._configuredEnabled !== false;
      }
    });
    return clean;
  }

  function mergeSidecar(input) {
    const src = clone(input || {});
    if (Array.isArray(src.forfeits)) {
      src.forfeits.forEach(item => {
        const extra = sidecar.forfeits.get(String(item.id || ''));
        if (!extra) return;
        item.requiresMode = extra.requiresMode === 'any' ? 'any' : 'all';
        item.requiresForfeitIds = [...extra.requiresForfeitIds];
      });
    }
    if (Array.isArray(src.rules)) {
      src.rules.forEach(rule => {
        const value = sidecar.rules.get(String(rule.id || ''));
        if (value != null) rule.minOccurrences = value;
      });
    }
    return src;
  }

  function seedMissing(config) {
    config.forfeits.forEach(item => {
      if (!sidecar.forfeits.has(item.id)) {
        sidecar.forfeits.set(item.id, {
          requiresMode: item.requiresMode || 'all',
          requiresForfeitIds: [...(item.requiresForfeitIds || [])]
        });
      }
    });
    config.rules.forEach(rule => {
      if (!sidecar.rules.has(rule.id)) sidecar.rules.set(rule.id, rule.minOccurrences || 1);
    });
  }

  function replaceSidecar(config) {
    sidecar.forfeits.clear();
    sidecar.rules.clear();
    seedMissing(config);
  }

  function parseStoredConfig() {
    try {
      const raw = localStorage.getItem(M.CONFIG_KEY);
      if (raw) return sanitizeConfig(JSON.parse(raw));
    } catch (error) {
      console.warn('Could not load dependency-aware config:', error);
    }
    return sanitizeConfig(clone(M.DEFAULT_CONFIG));
  }

  function fullRuleView(config) {
    const clean = sanitizeConfig(config);
    clean.rules.forEach(rule => {
      if (Object.prototype.hasOwnProperty.call(rule, '_configuredEnabled')) {
        rule.enabled = rule._configuredEnabled !== false;
        delete rule._configuredEnabled;
      }
    });
    return clean;
  }

  function runtimeRuleView(config) {
    if (document.body?.dataset?.page !== 'play') return config;
    const out = clone(config);
    out.rules.forEach(rule => {
      if ((rule.minOccurrences || 1) > 1) {
        rule._configuredEnabled = rule.enabled !== false;
        rule.enabled = false;
      }
    });
    return out;
  }

  function loadConfig() {
    const clean = parseStoredConfig();
    seedMissing(clean);
    return runtimeRuleView(clean);
  }

  function saveConfig(config) {
    const clean = fullRuleView(sanitizeConfig(mergeSidecar(config)));
    localStorage.setItem(M.CONFIG_KEY, JSON.stringify(clean));
    replaceSidecar(clean);
    return runtimeRuleView(clone(clean));
  }

  function dependencyMet(item, history) {
    const reqs = item.requiresForfeitIds || [];
    if (!reqs.length) return true;
    const occurred = new Set((history || []).map(entry => entry.id));
    return item.requiresMode === 'any'
      ? reqs.some(id => occurred.has(id))
      : reqs.every(id => occurred.has(id));
  }

  function signature(config) {
    const cfg = fullRuleView(sanitizeConfig(config));
    return JSON.stringify({
      levels: cfg.levels.map(l => [l.id, l.activeAtStart]),
      forfeits: cfg.forfeits.map(f => [
        f.id, f.levelId, f.weight, f.enabled, f.lifetime.type, f.lifetime.spins, f.cooldown,
        f.requiresMode, f.requiresForfeitIds
      ]),
      rules: cfg.rules.map(r => [
        r.id, r.mode, r.enabled, r.minOccurrences || 1, r.conditionForfeitIds, r.unlockLevels
      ])
    });
  }

  function applyDependencyState(session, cfg) {
    cfg.forfeits.forEach(item => {
      const runtime = session.runtime?.[item.id];
      if (!runtime) return;
      const hasDeps = (item.requiresForfeitIds || []).length > 0;
      const met = dependencyMet(item, session.history);

      if (!hasDeps) {
        if (runtime.dependencyLocked === true) {
          runtime.dependencyLocked = false;
          runtime.removed = false;
        } else if (runtime.dependencyLocked == null) {
          runtime.dependencyLocked = false;
        }
        return;
      }

      if (runtime.dependencyLocked == null) {
        runtime.dependencyLocked = !met;
        if (!met) runtime.removed = true;
      } else if (runtime.dependencyLocked && met) {
        runtime.dependencyLocked = false;
        runtime.removed = false;
      } else if (runtime.dependencyLocked && !met) {
        runtime.removed = true;
      }
    });
  }

  function evaluateCountRules(session, cfg) {
    const counts = new Map();
    (session.history || []).forEach(entry => counts.set(entry.id, (counts.get(entry.id) || 0) + 1));
    const freshNames = [];

    cfg.rules.forEach(rule => {
      const needed = Math.max(1, Number(rule.minOccurrences || 1));
      if (rule.enabled === false || needed <= 1 || !rule.conditionForfeitIds?.length) return;
      const matches = rule.conditionForfeitIds.map(id => (counts.get(id) || 0) >= needed);
      const ok = rule.mode === 'any' ? matches.some(Boolean) : matches.every(Boolean);
      if (!ok) return;
      rule.unlockLevels.forEach(id => {
        if (session.activeLevels[id]) return;
        session.activeLevels[id] = true;
        const level = cfg.levels.find(x => x.id === id);
        if (level) freshNames.push(level.name);
      });
    });

    if (freshNames.length && session.history?.length) {
      const last = session.history[session.history.length - 1];
      if (!Array.isArray(last.unlocked)) last.unlocked = [];
      freshNames.forEach(name => { if (!last.unlocked.includes(name)) last.unlocked.push(name); });
    }
  }

  function createSession(config) {
    const full = fullRuleView(sanitizeConfig(config));
    const session = base.createSession(full);
    session.configSignature = signature(full);
    applyDependencyState(session, full);
    return session;
  }

  function saveSession(session) {
    const cfg = parseStoredConfig();
    applyDependencyState(session, cfg);
    evaluateCountRules(session, cfg);
    localStorage.setItem(M.SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function loadSession(config) {
    const full = parseStoredConfig();
    const sig = signature(full);
    try {
      const raw = localStorage.getItem(M.SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.configSignature === sig) {
          parsed.configSignature = sig;
          applyDependencyState(parsed, full);
          evaluateCountRules(parsed, full);
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Could not load dependency-aware session:', error);
    }
    return createSession(full);
  }

  function resetSession(config) {
    const full = config ? fullRuleView(sanitizeConfig(config)) : parseStoredConfig();
    const session = createSession(full);
    saveSession(session);
    return session;
  }

  function configToXml(config) {
    const clean = fullRuleView(sanitizeConfig(mergeSidecar(config)));
    const text = base.configToXml(clean);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return text;

    clean.forfeits.forEach(item => {
      if (!item.requiresForfeitIds?.length) return;
      const node = [...doc.querySelectorAll('forfeits > forfeit')].find(x => x.getAttribute('id') === item.id);
      if (!node) return;
      const req = doc.createElement('requires');
      req.setAttribute('mode', item.requiresMode || 'all');
      item.requiresForfeitIds.forEach(id => {
        const child = doc.createElement('forfeit');
        child.setAttribute('ref', id);
        req.appendChild(child);
      });
      const unlocks = node.querySelector(':scope > unlocks');
      node.insertBefore(req, unlocks || null);
    });

    clean.rules.forEach(rule => {
      const node = [...doc.querySelectorAll('rules > rule')].find(x => x.getAttribute('id') === rule.id);
      if (node) node.setAttribute('minOccurrences', String(rule.minOccurrences || 1));
    });

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc.documentElement);
  }

  function xmlToConfig(xmlText) {
    const baseConfig = base.xmlToConfig(xmlText);
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.querySelector('parsererror')) return sanitizeConfig(baseConfig);

    const byId = new Map(baseConfig.forfeits.map(x => [x.id, x]));
    [...doc.querySelectorAll('forfeits > forfeit')].forEach(node => {
      const item = byId.get(node.getAttribute('id'));
      if (!item) return;
      const req = node.querySelector(':scope > requires');
      item.requiresMode = req?.getAttribute('mode') === 'any' ? 'any' : 'all';
      item.requiresForfeitIds = req
        ? [...req.querySelectorAll(':scope > forfeit')].map(x => x.getAttribute('ref')).filter(Boolean)
        : [];
    });

    const ruleById = new Map((baseConfig.rules || []).map(x => [x.id, x]));
    [...doc.querySelectorAll('rules > rule')].forEach(node => {
      const rule = ruleById.get(node.getAttribute('id'));
      if (rule) rule.minOccurrences = Math.round(clamp(node.getAttribute('minOccurrences'), 1, 99, 1));
    });

    const clean = sanitizeConfig(baseConfig);
    replaceSidecar(clean);
    return clean;
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

  window.FortuneDependencyState = {
    getForfeit(id) {
      const v = sidecar.forfeits.get(id);
      return v ? clone(v) : { requiresMode: 'all', requiresForfeitIds: [] };
    },
    setForfeit(id, value) {
      sidecar.forfeits.set(id, {
        requiresMode: value?.requiresMode === 'any' ? 'any' : 'all',
        requiresForfeitIds: [...new Set((value?.requiresForfeitIds || []).map(String).filter(x => x && x !== id))]
      });
    },
    getRuleCount(id) { return sidecar.rules.get(id) || 1; },
    setRuleCount(id, value) { sidecar.rules.set(id, Math.round(clamp(value, 1, 99, 1))); },
    replace: replaceSidecar
  };

  M.sanitizeConfig = sanitizeConfig;
  M.loadConfig = loadConfig;
  M.saveConfig = saveConfig;
  M.createSession = createSession;
  M.loadSession = loadSession;
  M.saveSession = saveSession;
  M.resetSession = resetSession;
  M.signature = signature;
  M.configToXml = configToXml;
  M.xmlToConfig = xmlToConfig;
  M.downloadXml = downloadXml;
  M.readXmlFile = readXmlFile;

  seedMissing(parseStoredConfig());
})();
