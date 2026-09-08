(() => {
  'use strict';

  const M = window.FortuneModel;
  if (!M || window.__fortuneProgressionModel) return;
  window.__fortuneProgressionModel = true;

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

  const sidecar = { levels: new Map(), forfeits: new Map() };
  const clone = value => M.deepClone ? M.deepClone(value) : JSON.parse(JSON.stringify(value));

  function levelExtra(raw = {}, validLevels = new Set(), ownId = '') {
    return {
      completionMode: raw.completionMode === 'required' ? 'required' : 'empty',
      completionLabel: String(raw.completionLabel || '').trim().slice(0, 40),
      completionUnlockLevels: [...new Set((Array.isArray(raw.completionUnlockLevels) ? raw.completionUnlockLevels : [])
        .map(String).filter(id => id && id !== ownId && validLevels.has(id)))]
    };
  }

  function forfeitExtra(raw = {}) {
    return { requiredForCompletion: Boolean(raw.requiredForCompletion) };
  }

  function sanitizeConfig(input) {
    const src = input && typeof input === 'object' ? clone(input) : {};
    const clean = base.sanitizeConfig(src);
    const rawLevels = new Map((Array.isArray(src.levels) ? src.levels : []).map(x => [String(x?.id || ''), x]));
    const rawForfeits = new Map((Array.isArray(src.forfeits) ? src.forfeits : []).map(x => [String(x?.id || ''), x]));
    const levelIds = new Set(clean.levels.map(level => level.id));

    clean.levels.forEach(level => Object.assign(level, levelExtra(rawLevels.get(level.id) || {}, levelIds, level.id)));
    clean.forfeits.forEach(item => Object.assign(item, forfeitExtra(rawForfeits.get(item.id) || {})));
    return clean;
  }

  function seedSidecar(config) {
    const levelIds = new Set(config.levels.map(level => level.id));
    config.levels.forEach(level => {
      if (!sidecar.levels.has(level.id)) sidecar.levels.set(level.id, levelExtra(level, levelIds, level.id));
    });
    config.forfeits.forEach(item => {
      if (!sidecar.forfeits.has(item.id)) sidecar.forfeits.set(item.id, forfeitExtra(item));
    });
  }

  function replaceSidecar(config) {
    sidecar.levels.clear();
    sidecar.forfeits.clear();
    seedSidecar(config);
  }

  function mergeSidecar(input) {
    const src = clone(input || {});
    const levelIds = new Set((src.levels || []).map(level => String(level.id || '')));
    (src.levels || []).forEach(level => {
      const extra = sidecar.levels.get(String(level.id || ''));
      if (extra) Object.assign(level, levelExtra(extra, levelIds, level.id));
      else Object.assign(level, levelExtra(level, levelIds, level.id));
    });
    (src.forfeits || []).forEach(item => {
      const extra = sidecar.forfeits.get(String(item.id || ''));
      if (extra) Object.assign(item, forfeitExtra(extra));
      else Object.assign(item, forfeitExtra(item));
    });
    return src;
  }

  function storedProgression() {
    try {
      const raw = localStorage.getItem(M.CONFIG_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  function attachStoredExtras(config) {
    const raw = storedProgression();
    if (!raw) return sanitizeConfig(config);
    const out = clone(config);
    const rawLevels = new Map((raw.levels || []).map(level => [String(level.id || ''), level]));
    const rawForfeits = new Map((raw.forfeits || []).map(item => [String(item.id || ''), item]));
    const levelIds = new Set((out.levels || []).map(level => level.id));
    (out.levels || []).forEach(level => Object.assign(level, levelExtra(rawLevels.get(level.id) || level, levelIds, level.id)));
    (out.forfeits || []).forEach(item => Object.assign(item, forfeitExtra(rawForfeits.get(item.id) || item)));
    return sanitizeConfig(out);
  }

  function loadConfig() {
    const clean = attachStoredExtras(base.loadConfig());
    seedSidecar(clean);
    return clean;
  }

  function persistWithExtras(core, source) {
    const out = clone(core);
    const levelIds = new Set(out.levels.map(level => level.id));
    const sourceLevels = new Map((source.levels || []).map(level => [level.id, level]));
    const sourceForfeits = new Map((source.forfeits || []).map(item => [item.id, item]));
    out.levels.forEach(level => Object.assign(level, levelExtra(sourceLevels.get(level.id) || {}, levelIds, level.id)));
    out.forfeits.forEach(item => Object.assign(item, forfeitExtra(sourceForfeits.get(item.id) || {})));
    localStorage.setItem(M.CONFIG_KEY, JSON.stringify(out));
    return out;
  }

  function saveConfig(config) {
    const full = sanitizeConfig(mergeSidecar(config));
    const core = base.saveConfig(full);
    const clean = sanitizeConfig(persistWithExtras(core, full));
    replaceSidecar(clean);
    return clean;
  }

  function progressionSignature(config) {
    const cfg = sanitizeConfig(config);
    return JSON.stringify({
      levels: cfg.levels.map(level => [level.id, level.completionMode, level.completionLabel, level.completionUnlockLevels]),
      forfeits: cfg.forfeits.map(item => [item.id, item.levelId, item.enabled, item.requiredForCompletion])
    });
  }

  function ensureProgressionState(session) {
    if (!session.completedLevels || typeof session.completedLevels !== 'object') session.completedLevels = {};
    if (!Array.isArray(session.sceneStates)) session.sceneStates = [];
    return session;
  }

  function historyIds(session) {
    return new Set((session.history || []).map(entry => entry.id));
  }

  function addLastHistory(session, field, values) {
    if (!values?.length || !session.history?.length) return;
    const last = session.history[session.history.length - 1];
    if (!Array.isArray(last[field])) last[field] = [];
    values.forEach(value => { if (!last[field].includes(value)) last[field].push(value); });
  }

  function evaluateProgression(session, config) {
    ensureProgressionState(session);
    const cfg = sanitizeConfig(config);
    const occurred = historyIds(session);
    const newlyCompleted = [];
    const newlyUnlocked = [];
    const statesAdded = [];
    let changed = true;
    let guard = 0;

    while (changed && guard++ < Math.max(3, cfg.levels.length + 1)) {
      changed = false;
      cfg.levels.forEach(level => {
        if (session.completedLevels[level.id]) {
          session.activeLevels[level.id] = false;
          return;
        }
        if (!session.activeLevels[level.id]) return;
        const members = cfg.forfeits.filter(item => item.enabled && item.levelId === level.id);
        const exhausted = members.length > 0 && members.every(item => {
          const runtime = session.runtime?.[item.id];
          return runtime && runtime.removed && !runtime.dependencyLocked;
        });
        const required = cfg.forfeits.filter(item => item.enabled && item.levelId === level.id && item.requiredForCompletion);
        const requiredDone = level.completionMode === 'required' && required.length > 0 && required.every(item => occurred.has(item.id));
        if (!exhausted && !requiredDone) return;

        session.completedLevels[level.id] = true;
        session.activeLevels[level.id] = false;
        newlyCompleted.push(level.name);
        changed = true;

        if (level.completionLabel && !session.sceneStates.includes(level.completionLabel)) {
          session.sceneStates.push(level.completionLabel);
          statesAdded.push(level.completionLabel);
        }

        level.completionUnlockLevels.forEach(id => {
          if (session.completedLevels[id]) return;
          if (!session.activeLevels[id]) {
            session.activeLevels[id] = true;
            const next = cfg.levels.find(candidate => candidate.id === id);
            if (next) newlyUnlocked.push(next.name);
          }
        });
      });
    }

    Object.keys(session.completedLevels).forEach(id => {
      if (session.completedLevels[id] && Object.prototype.hasOwnProperty.call(session.activeLevels, id)) session.activeLevels[id] = false;
    });

    addLastHistory(session, 'completedLevels', newlyCompleted);
    addLastHistory(session, 'sceneStatesAdded', statesAdded);
    addLastHistory(session, 'unlocked', newlyUnlocked);
    return { newlyCompleted, newlyUnlocked, statesAdded };
  }

  function createSession(config) {
    const cfg = sanitizeConfig(config);
    const session = ensureProgressionState(base.createSession(cfg));
    session.progressionSignature = progressionSignature(cfg);
    evaluateProgression(session, cfg);
    return session;
  }

  function loadSession(config) {
    const cfg = loadConfig();
    const sig = progressionSignature(cfg);
    let session = ensureProgressionState(base.loadSession(cfg));
    if (session.progressionSignature && session.progressionSignature !== sig) {
      session = ensureProgressionState(base.resetSession(cfg));
    }
    session.progressionSignature = sig;
    evaluateProgression(session, cfg);
    return session;
  }

  function saveSession(session) {
    const cfg = loadConfig();
    ensureProgressionState(session);
    session.progressionSignature = progressionSignature(cfg);
    base.saveSession(session);
    evaluateProgression(session, cfg);
    base.saveSession(session);
    Object.keys(session.completedLevels || {}).forEach(id => {
      if (session.completedLevels[id]) session.activeLevels[id] = false;
    });
    localStorage.setItem(M.SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function resetSession(config) {
    const cfg = config ? sanitizeConfig(mergeSidecar(config)) : loadConfig();
    const session = ensureProgressionState(base.resetSession(cfg));
    session.progressionSignature = progressionSignature(cfg);
    evaluateProgression(session, cfg);
    localStorage.setItem(M.SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function configToXml(config) {
    const clean = sanitizeConfig(mergeSidecar(config));
    const text = base.configToXml(clean);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return text;

    const levelById = new Map(clean.levels.map(level => [level.id, level]));
    [...doc.querySelectorAll('groups > group')].forEach(node => {
      const level = levelById.get(node.getAttribute('id'));
      if (!level) return;
      node.setAttribute('completion', level.completionMode || 'manual');
      if (level.completionLabel) node.setAttribute('completionLabel', level.completionLabel);
      else node.removeAttribute('completionLabel');
      node.querySelector(':scope > onComplete')?.remove();
      if (level.completionUnlockLevels?.length) {
        const onComplete = doc.createElement('onComplete');
        level.completionUnlockLevels.forEach(id => {
          const child = doc.createElement('group');
          child.setAttribute('ref', id);
          onComplete.appendChild(child);
        });
        node.appendChild(onComplete);
      }
    });

    const forfeitById = new Map(clean.forfeits.map(item => [item.id, item]));
    [...doc.querySelectorAll('forfeits > forfeit')].forEach(node => {
      const item = forfeitById.get(node.getAttribute('id'));
      if (!item) return;
      if (item.requiredForCompletion) node.setAttribute('requiredForCompletion', 'true');
      else node.removeAttribute('requiredForCompletion');
    });

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc.documentElement);
  }

  function xmlToConfig(xmlText) {
    const core = base.xmlToConfig(xmlText);
    const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.querySelector('parsererror')) return sanitizeConfig(core);
    const levelIds = new Set(core.levels.map(level => level.id));
    const levelById = new Map(core.levels.map(level => [level.id, level]));
    [...doc.querySelectorAll('groups > group')].forEach(node => {
      const level = levelById.get(node.getAttribute('id'));
      if (!level) return;
      level.completionMode = node.getAttribute('completion') === 'required' ? 'required' : 'empty';
      level.completionLabel = String(node.getAttribute('completionLabel') || '').slice(0, 40);
      level.completionUnlockLevels = [...node.querySelectorAll(':scope > onComplete > group')]
        .map(child => child.getAttribute('ref')).filter(id => id && id !== level.id && levelIds.has(id));
    });
    const itemById = new Map(core.forfeits.map(item => [item.id, item]));
    [...doc.querySelectorAll('forfeits > forfeit')].forEach(node => {
      const item = itemById.get(node.getAttribute('id'));
      if (item) item.requiredForCompletion = node.getAttribute('requiredForCompletion') === 'true';
    });
    const clean = sanitizeConfig(core);
    replaceSidecar(clean);
    return clean;
  }

  function downloadXml(config, filename = 'fortune-wheel.xml') {
    if (typeof base.downloadXml === 'function') return base.downloadXml(config, filename);
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
    if (typeof base.readXmlFile === 'function') return base.readXmlFile(file);
    if (!file) throw new Error('No XML file selected.');
    if (file.size > 2_000_000) throw new Error('XML file is too large.');
    return xmlToConfig(await file.text());
  }

  window.FortuneProgressionState = {
    getLevel(id) {
      const value = sidecar.levels.get(id);
      return value ? clone(value) : { completionMode:'empty', completionLabel:'', completionUnlockLevels:[] };
    },
    setLevel(id, value) {
      const ids = new Set(loadConfig().levels.map(level => level.id));
      sidecar.levels.forEach((_value, key) => ids.add(key));
      try { (window.FortuneEditor?.getDraft?.().levels || []).forEach(level => ids.add(level.id)); } catch (_) {}
      sidecar.levels.set(id, levelExtra(value, ids, id));
    },
    getForfeit(id) {
      const value = sidecar.forfeits.get(id);
      return value ? clone(value) : { requiredForCompletion:false };
    },
    setForfeit(id, value) { sidecar.forfeits.set(id, forfeitExtra(value)); },
    replace: replaceSidecar,
    evaluate: evaluateProgression,
    status(levelId, session) {
      if (session?.completedLevels?.[levelId]) return 'completed';
      if (session?.activeLevels?.[levelId]) return 'active';
      return 'locked';
    }
  };

  M.sanitizeConfig = sanitizeConfig;
  M.loadConfig = loadConfig;
  M.saveConfig = saveConfig;
  M.createSession = createSession;
  M.loadSession = loadSession;
  M.saveSession = saveSession;
  M.resetSession = resetSession;
  M.signature = config => `${base.signature(config)}|${progressionSignature(config)}`;
  M.configToXml = configToXml;
  M.xmlToConfig = xmlToConfig;
  M.downloadXml = downloadXml;
  M.readXmlFile = readXmlFile;

  seedSidecar(loadConfig());
})();
