(() => {
  'use strict';

  const KEY = 'fortune-engine-spin-style-v1';
  const M = window.FortuneModel;
  if (!M) return;

  const defaults = {
    maxTurns: 9,
    dramaEnabled: true,
    dramaChance: 35,
    dramaExtraMinTurns: 1,
    dramaExtraMaxTurns: 2,
    showSlowIcon: true
  };

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function clean(input = {}) {
    const minExtra = Math.round(clamp(input.dramaExtraMinTurns, 1, 3, defaults.dramaExtraMinTurns));
    const maxExtra = Math.round(clamp(input.dramaExtraMaxTurns, minExtra, 4, Math.max(minExtra, defaults.dramaExtraMaxTurns)));
    return {
      maxTurns: Math.round(clamp(input.maxTurns, 3, 24, defaults.maxTurns)),
      dramaEnabled: input.dramaEnabled !== false,
      dramaChance: Math.round(clamp(input.dramaChance, 0, 100, defaults.dramaChance)),
      dramaExtraMinTurns: minExtra,
      dramaExtraMaxTurns: maxExtra,
      showSlowIcon: input.showSlowIcon !== false
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? clean(JSON.parse(raw)) : clean(defaults);
    } catch (_) {
      return clean(defaults);
    }
  }

  function save(next) {
    const value = clean({ ...load(), ...next });
    localStorage.setItem(KEY, JSON.stringify(value));
    return value;
  }

  function extractFromXml(xmlText, parsedConfig) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return load();
    const node = doc.querySelector('settings');
    if (!node) return load();
    const current = load();
    const minTurns = Number(parsedConfig?.settings?.minTurns || 6);
    const readBool = (name, fallback) => {
      const value = node.getAttribute(name);
      return value == null ? fallback : value === 'true';
    };
    const result = save({
      maxTurns: node.hasAttribute('maxTurns') ? node.getAttribute('maxTurns') : Math.max(current.maxTurns, minTurns + 2),
      dramaEnabled: readBool('dramaEnabled', current.dramaEnabled),
      dramaChance: node.hasAttribute('dramaChance') ? node.getAttribute('dramaChance') : current.dramaChance,
      dramaExtraMinTurns: node.hasAttribute('dramaExtraMinTurns') ? node.getAttribute('dramaExtraMinTurns') : current.dramaExtraMinTurns,
      dramaExtraMaxTurns: node.hasAttribute('dramaExtraMaxTurns') ? node.getAttribute('dramaExtraMaxTurns') : current.dramaExtraMaxTurns,
      showSlowIcon: readBool('showSlowIcon', current.showSlowIcon)
    });
    return result;
  }

  function addToXml(xmlText) {
    const s = load();
    return xmlText.replace(/<settings\b([^>]*)\/>/, (_match, attrs) => {
      const stripped = attrs
        .replace(/\smaxTurns="[^"]*"/g, '')
        .replace(/\sdramaEnabled="[^"]*"/g, '')
        .replace(/\sdramaChance="[^"]*"/g, '')
        .replace(/\sdramaExtraMinTurns="[^"]*"/g, '')
        .replace(/\sdramaExtraMaxTurns="[^"]*"/g, '')
        .replace(/\sshowSlowIcon="[^"]*"/g, '');
      return `<settings${stripped} maxTurns="${s.maxTurns}" dramaEnabled="${s.dramaEnabled}" dramaChance="${s.dramaChance}" dramaExtraMinTurns="${s.dramaExtraMinTurns}" dramaExtraMaxTurns="${s.dramaExtraMaxTurns}" showSlowIcon="${s.showSlowIcon}" />`;
    });
  }

  M.downloadXml = function downloadXmlWithSpinStyle(config, filename = 'fortune-wheel.xml') {
    const xml = addToXml(M.configToXml(config));
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  M.readXmlFile = async function readXmlFileWithSpinStyle(file) {
    if (!file) throw new Error('No XML file selected.');
    if (file.size > 2_000_000) throw new Error('XML file is too large.');
    const text = await file.text();
    const config = M.xmlToConfig(text);
    extractFromXml(text, config);
    return config;
  };

  function injectEditorUi() {
    if (document.body.dataset.page !== 'edit' || document.getElementById('spinDramaCard')) return;
    const grid = document.querySelector('#tab-settings .settings-grid');
    if (!grid) return;

    const minTurns = document.getElementById('minTurns');
    if (minTurns) {
      const label = minTurns.closest('label.field');
      if (label) label.childNodes[0].nodeValue = 'Minimum full rotations';
    }

    const card = document.createElement('div');
    card.id = 'spinDramaCard';
    card.className = 'editor-card static-card spin-drama-settings';
    card.innerHTML = `
      <div class="section-kicker">DRAMA</div>
      <h3>Random spin & suspense</h3>
      <p class="muted spin-settings-note">Spin time already uses the minimum / maximum seconds above. These options add a random rotation range and an occasional second wind.</p>
      <label class="field">Maximum full rotations<input id="maxTurns" type="number" min="3" max="24" step="1"></label>
      <label class="check-line"><input id="dramaEnabled" type="checkbox"> <span>Enable random second-wind drama</span></label>
      <label class="field">Second-wind chance (%)<input id="dramaChance" type="number" min="0" max="100" step="1"></label>
      <div class="spin-mini-grid">
        <label class="field">Extra turns from<input id="dramaExtraMinTurns" type="number" min="1" max="3" step="1"></label>
        <label class="field">Extra turns to<input id="dramaExtraMaxTurns" type="number" min="1" max="4" step="1"></label>
      </div>
      <label class="check-line"><input id="showSlowIcon" type="checkbox"> <span>Show the current pictogram above the wheel during the slow finish</span></label>`;
    grid.appendChild(card);

    const ids = ['maxTurns','dramaEnabled','dramaChance','dramaExtraMinTurns','dramaExtraMaxTurns','showSlowIcon'];
    const sync = () => {
      const s = load();
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!s[id];
        else el.value = s[id];
      });
      const min = Number(document.getElementById('minTurns')?.value || 6);
      const max = document.getElementById('maxTurns');
      if (max && Number(max.value) < min) max.value = Math.min(24, min + 2);
    };

    const persist = () => {
      const minTurnsValue = Math.round(clamp(document.getElementById('minTurns')?.value, 3, 20, 6));
      const maxTurnsValue = Math.round(clamp(document.getElementById('maxTurns')?.value, minTurnsValue, 24, Math.max(9, minTurnsValue)));
      const minExtra = Math.round(clamp(document.getElementById('dramaExtraMinTurns')?.value, 1, 3, 1));
      const maxExtra = Math.round(clamp(document.getElementById('dramaExtraMaxTurns')?.value, minExtra, 4, Math.max(2, minExtra)));
      const s = save({
        maxTurns: maxTurnsValue,
        dramaEnabled: !!document.getElementById('dramaEnabled')?.checked,
        dramaChance: document.getElementById('dramaChance')?.value,
        dramaExtraMinTurns: minExtra,
        dramaExtraMaxTurns: maxExtra,
        showSlowIcon: !!document.getElementById('showSlowIcon')?.checked
      });
      document.getElementById('maxTurns').value = s.maxTurns;
      document.getElementById('dramaExtraMinTurns').value = s.dramaExtraMinTurns;
      document.getElementById('dramaExtraMaxTurns').value = s.dramaExtraMaxTurns;
    };

    ids.forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener(el.type === 'checkbox' ? 'change' : 'input', persist);
    });
    document.getElementById('minTurns')?.addEventListener('input', persist);
    document.getElementById('applyBtn')?.addEventListener('click', persist);
    document.getElementById('editorFileInput')?.addEventListener('change', () => setTimeout(sync, 120));
    setTimeout(sync, 0);
  }

  window.FortuneSpinStyle = { KEY, defaults: { ...defaults }, load, save };
  injectEditorUi();
})();
