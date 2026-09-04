(() => {
  'use strict';

  const KEY = 'fortune-engine-spin-style-v1';
  const M = window.FortuneModel;
  if (!M) return;

  const defaults = {
    maxTurns: 9,
    dramaEnabled: true,
    dramaChance: 35,
    dramaCreepMinDegrees: 30,
    dramaCreepMaxDegrees: 80,
    showSlowIcon: true,
    iconPreviewStartPercent: 35
  };

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function oldTurnsToDegrees(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(clamp(n * 40, 10, 160, fallback)) : fallback;
  }

  function clean(input = {}) {
    const minDegrees = Math.round(clamp(
      input.dramaCreepMinDegrees ?? (input.dramaExtraMinTurns != null ? oldTurnsToDegrees(input.dramaExtraMinTurns, defaults.dramaCreepMinDegrees) : undefined),
      5, 160, defaults.dramaCreepMinDegrees
    ));
    const maxDegrees = Math.round(clamp(
      input.dramaCreepMaxDegrees ?? (input.dramaExtraMaxTurns != null ? oldTurnsToDegrees(input.dramaExtraMaxTurns, defaults.dramaCreepMaxDegrees) : undefined),
      minDegrees, 180, Math.max(minDegrees, defaults.dramaCreepMaxDegrees)
    ));

    return {
      maxTurns: Math.round(clamp(input.maxTurns, 3, 24, defaults.maxTurns)),
      dramaEnabled: input.dramaEnabled !== false,
      dramaChance: Math.round(clamp(input.dramaChance, 0, 100, defaults.dramaChance)),
      dramaCreepMinDegrees: minDegrees,
      dramaCreepMaxDegrees: maxDegrees,
      showSlowIcon: input.showSlowIcon !== false,
      iconPreviewStartPercent: Math.round(clamp(input.iconPreviewStartPercent, 10, 80, defaults.iconPreviewStartPercent)),
      // Kept as compatibility aliases for older AI prompts/configs. They are no longer full extra turns.
      dramaExtraMinTurns: 1,
      dramaExtraMaxTurns: 2
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

  function save(next = {}) {
    const base = load();
    const merged = { ...base, ...next };
    if (!Object.prototype.hasOwnProperty.call(next, 'dramaCreepMinDegrees') && Object.prototype.hasOwnProperty.call(next, 'dramaExtraMinTurns')) {
      merged.dramaCreepMinDegrees = oldTurnsToDegrees(next.dramaExtraMinTurns, base.dramaCreepMinDegrees);
    }
    if (!Object.prototype.hasOwnProperty.call(next, 'dramaCreepMaxDegrees') && Object.prototype.hasOwnProperty.call(next, 'dramaExtraMaxTurns')) {
      merged.dramaCreepMaxDegrees = oldTurnsToDegrees(next.dramaExtraMaxTurns, base.dramaCreepMaxDegrees);
    }
    const value = clean(merged);
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
    return save({
      maxTurns: node.hasAttribute('maxTurns') ? node.getAttribute('maxTurns') : Math.max(current.maxTurns, minTurns + 2),
      dramaEnabled: readBool('dramaEnabled', current.dramaEnabled),
      dramaChance: node.hasAttribute('dramaChance') ? node.getAttribute('dramaChance') : current.dramaChance,
      dramaCreepMinDegrees: node.hasAttribute('dramaCreepMinDegrees')
        ? node.getAttribute('dramaCreepMinDegrees')
        : (node.hasAttribute('dramaExtraMinTurns') ? oldTurnsToDegrees(node.getAttribute('dramaExtraMinTurns'), current.dramaCreepMinDegrees) : current.dramaCreepMinDegrees),
      dramaCreepMaxDegrees: node.hasAttribute('dramaCreepMaxDegrees')
        ? node.getAttribute('dramaCreepMaxDegrees')
        : (node.hasAttribute('dramaExtraMaxTurns') ? oldTurnsToDegrees(node.getAttribute('dramaExtraMaxTurns'), current.dramaCreepMaxDegrees) : current.dramaCreepMaxDegrees),
      showSlowIcon: readBool('showSlowIcon', current.showSlowIcon),
      iconPreviewStartPercent: node.hasAttribute('iconPreviewStartPercent') ? node.getAttribute('iconPreviewStartPercent') : current.iconPreviewStartPercent
    });
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
        .replace(/\sdramaCreepMinDegrees="[^"]*"/g, '')
        .replace(/\sdramaCreepMaxDegrees="[^"]*"/g, '')
        .replace(/\sshowSlowIcon="[^"]*"/g, '')
        .replace(/\siconPreviewStartPercent="[^"]*"/g, '');
      return `<settings${stripped} maxTurns="${s.maxTurns}" dramaEnabled="${s.dramaEnabled}" dramaChance="${s.dramaChance}" dramaCreepMinDegrees="${s.dramaCreepMinDegrees}" dramaCreepMaxDegrees="${s.dramaCreepMaxDegrees}" showSlowIcon="${s.showSlowIcon}" iconPreviewStartPercent="${s.iconPreviewStartPercent}" />`;
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

  function injectStyles() {
    if (document.getElementById('spinDramaV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'spinDramaV2Styles';
    style.textContent = `
      .drama-master{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;margin:12px 0;border:1px solid rgba(101,216,255,.18);border-radius:13px;background:rgba(101,216,255,.045)}
      .drama-master strong{display:block;font-size:.78rem}.drama-master small{display:block;margin-top:3px;color:var(--muted);font-size:.66rem;line-height:1.4}
      .drama-status{min-width:42px;padding:4px 7px;border-radius:99px;text-align:center;font-size:.6rem;font-weight:900;border:1px solid var(--border);color:var(--muted)}
      .drama-master.on .drama-status{color:#8ff4cf;border-color:rgba(69,224,168,.22);background:rgba(69,224,168,.07)}
      .drama-toggle{width:46px;height:26px;accent-color:var(--accent)}
      .drama-controls.is-off{opacity:.45}.drama-controls.is-off input{cursor:not-allowed}
      .spin-range-note{margin-top:6px;color:var(--muted2);font-size:.65rem;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function injectEditorUi() {
    if (document.body.dataset.page !== 'edit' || document.getElementById('spinDramaCard')) return;
    const grid = document.querySelector('#tab-settings .settings-grid');
    if (!grid) return;
    injectStyles();

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
      <p class="muted spin-settings-note">Spin time is random between the minimum and maximum seconds. Drama mode never re-spins the wheel: it only lets an almost-finished wheel creep a little farther before the real stop.</p>
      <label class="field">Maximum full rotations<input id="maxTurns" type="number" min="3" max="24" step="1"></label>
      <label class="drama-master">
        <span><strong>Drama mode</strong><small>Randomly fake an almost-stop, then continue slowly for a short distance.</small></span>
        <input id="dramaEnabled" class="drama-toggle" type="checkbox">
        <span id="dramaStatus" class="drama-status">ON</span>
      </label>
      <div id="dramaControls" class="drama-controls">
        <label class="field">Drama chance (%)<input id="dramaChance" type="number" min="0" max="100" step="1"></label>
        <div class="spin-mini-grid">
          <label class="field">Continue from (degrees)<input id="dramaCreepMinDegrees" type="number" min="5" max="160" step="5"></label>
          <label class="field">Continue to (degrees)<input id="dramaCreepMaxDegrees" type="number" min="5" max="180" step="5"></label>
        </div>
        <div class="spin-range-note">Example: 30–80° means it can drift only part of a turn after the fake stop — never another full spin.</div>
      </div>
      <label class="check-line"><input id="showSlowIcon" type="checkbox"> <span>Show the current pictogram above the wheel while it is slowing</span></label>
      <label class="field">Start live pictograms after (%)<input id="iconPreviewStartPercent" type="number" min="10" max="80" step="5"></label>
      <div class="spin-range-note">Lower values make the big pictogram start earlier. Default: 35% of the spin.</div>`;
    grid.appendChild(card);

    const ids = ['maxTurns','dramaEnabled','dramaChance','dramaCreepMinDegrees','dramaCreepMaxDegrees','showSlowIcon','iconPreviewStartPercent'];

    const updateDramaUi = () => {
      const enabled = !!document.getElementById('dramaEnabled')?.checked;
      const master = document.getElementById('dramaEnabled')?.closest('.drama-master');
      const controls = document.getElementById('dramaControls');
      master?.classList.toggle('on', enabled);
      controls?.classList.toggle('is-off', !enabled);
      const status = document.getElementById('dramaStatus');
      if (status) status.textContent = enabled ? 'ON' : 'OFF';
      ['dramaChance','dramaCreepMinDegrees','dramaCreepMaxDegrees'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
      });
    };

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
      updateDramaUi();
    };

    const persist = () => {
      const minTurnsValue = Math.round(clamp(document.getElementById('minTurns')?.value, 3, 20, 6));
      const maxTurnsValue = Math.round(clamp(document.getElementById('maxTurns')?.value, minTurnsValue, 24, Math.max(9, minTurnsValue)));
      const minDegrees = Math.round(clamp(document.getElementById('dramaCreepMinDegrees')?.value, 5, 160, defaults.dramaCreepMinDegrees));
      const maxDegrees = Math.round(clamp(document.getElementById('dramaCreepMaxDegrees')?.value, minDegrees, 180, Math.max(defaults.dramaCreepMaxDegrees, minDegrees)));
      const s = save({
        maxTurns: maxTurnsValue,
        dramaEnabled: !!document.getElementById('dramaEnabled')?.checked,
        dramaChance: document.getElementById('dramaChance')?.value,
        dramaCreepMinDegrees: minDegrees,
        dramaCreepMaxDegrees: maxDegrees,
        showSlowIcon: !!document.getElementById('showSlowIcon')?.checked,
        iconPreviewStartPercent: document.getElementById('iconPreviewStartPercent')?.value
      });
      document.getElementById('maxTurns').value = s.maxTurns;
      document.getElementById('dramaCreepMinDegrees').value = s.dramaCreepMinDegrees;
      document.getElementById('dramaCreepMaxDegrees').value = s.dramaCreepMaxDegrees;
      document.getElementById('iconPreviewStartPercent').value = s.iconPreviewStartPercent;
      updateDramaUi();
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