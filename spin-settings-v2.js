(() => {
  'use strict';

  const KEY = 'fortune-engine-spin-style-v1';
  const M = window.FortuneModel;
  if (!M) return;

  const defaults = {
    maxTurns: 9,
    spinUpMinSeconds: 0.7,
    spinUpMaxSeconds: 1.4,
    spinDownMinSeconds: 3.0,
    spinDownMaxSeconds: 5.0,
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
    const spinUpMin = clamp(input.spinUpMinSeconds, 0.1, 10, defaults.spinUpMinSeconds);
    const spinUpMax = clamp(input.spinUpMaxSeconds, spinUpMin, 12, Math.max(spinUpMin, defaults.spinUpMaxSeconds));
    const spinDownMin = clamp(input.spinDownMinSeconds, 0.3, 20, defaults.spinDownMinSeconds);
    const spinDownMax = clamp(input.spinDownMaxSeconds, spinDownMin, 25, Math.max(spinDownMin, defaults.spinDownMaxSeconds));
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
      spinUpMinSeconds: Number(spinUpMin.toFixed(2)),
      spinUpMaxSeconds: Number(spinUpMax.toFixed(2)),
      spinDownMinSeconds: Number(spinDownMin.toFixed(2)),
      spinDownMaxSeconds: Number(spinDownMax.toFixed(2)),
      dramaEnabled: input.dramaEnabled !== false,
      dramaChance: Math.round(clamp(input.dramaChance, 0, 100, defaults.dramaChance)),
      dramaCreepMinDegrees: minDegrees,
      dramaCreepMaxDegrees: maxDegrees,
      showSlowIcon: input.showSlowIcon !== false,
      iconPreviewStartPercent: Math.round(clamp(input.iconPreviewStartPercent, 10, 80, defaults.iconPreviewStartPercent)),
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
    const read = (name, fallback) => node.hasAttribute(name) ? node.getAttribute(name) : fallback;
    const readBool = (name, fallback) => node.hasAttribute(name) ? node.getAttribute(name) === 'true' : fallback;

    return save({
      maxTurns: read('maxTurns', Math.max(current.maxTurns, minTurns + 2)),
      spinUpMinSeconds: read('spinUpMinSeconds', current.spinUpMinSeconds),
      spinUpMaxSeconds: read('spinUpMaxSeconds', current.spinUpMaxSeconds),
      spinDownMinSeconds: read('spinDownMinSeconds', current.spinDownMinSeconds),
      spinDownMaxSeconds: read('spinDownMaxSeconds', current.spinDownMaxSeconds),
      dramaEnabled: readBool('dramaEnabled', current.dramaEnabled),
      dramaChance: read('dramaChance', current.dramaChance),
      dramaCreepMinDegrees: node.hasAttribute('dramaCreepMinDegrees')
        ? node.getAttribute('dramaCreepMinDegrees')
        : (node.hasAttribute('dramaExtraMinTurns') ? oldTurnsToDegrees(node.getAttribute('dramaExtraMinTurns'), current.dramaCreepMinDegrees) : current.dramaCreepMinDegrees),
      dramaCreepMaxDegrees: node.hasAttribute('dramaCreepMaxDegrees')
        ? node.getAttribute('dramaCreepMaxDegrees')
        : (node.hasAttribute('dramaExtraMaxTurns') ? oldTurnsToDegrees(node.getAttribute('dramaExtraMaxTurns'), current.dramaCreepMaxDegrees) : current.dramaCreepMaxDegrees),
      showSlowIcon: readBool('showSlowIcon', current.showSlowIcon),
      iconPreviewStartPercent: read('iconPreviewStartPercent', current.iconPreviewStartPercent)
    });
  }

  function addToXml(xmlText) {
    const s = load();
    return xmlText.replace(/<settings\b([^>]*)\/>/, (_match, attrs) => {
      const stripped = attrs
        .replace(/\smaxTurns="[^"]*"/g, '')
        .replace(/\sspinUpMinSeconds="[^"]*"/g, '')
        .replace(/\sspinUpMaxSeconds="[^"]*"/g, '')
        .replace(/\sspinDownMinSeconds="[^"]*"/g, '')
        .replace(/\sspinDownMaxSeconds="[^"]*"/g, '')
        .replace(/\sdramaEnabled="[^"]*"/g, '')
        .replace(/\sdramaChance="[^"]*"/g, '')
        .replace(/\sdramaExtraMinTurns="[^"]*"/g, '')
        .replace(/\sdramaExtraMaxTurns="[^"]*"/g, '')
        .replace(/\sdramaCreepMinDegrees="[^"]*"/g, '')
        .replace(/\sdramaCreepMaxDegrees="[^"]*"/g, '')
        .replace(/\sshowSlowIcon="[^"]*"/g, '')
        .replace(/\siconPreviewStartPercent="[^"]*"/g, '');
      return `<settings${stripped} maxTurns="${s.maxTurns}" spinUpMinSeconds="${s.spinUpMinSeconds}" spinUpMaxSeconds="${s.spinUpMaxSeconds}" spinDownMinSeconds="${s.spinDownMinSeconds}" spinDownMaxSeconds="${s.spinDownMaxSeconds}" dramaEnabled="${s.dramaEnabled}" dramaChance="${s.dramaChance}" dramaCreepMinDegrees="${s.dramaCreepMinDegrees}" dramaCreepMaxDegrees="${s.dramaCreepMaxDegrees}" showSlowIcon="${s.showSlowIcon}" iconPreviewStartPercent="${s.iconPreviewStartPercent}" />`;
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
    if (document.getElementById('spinMotionStyles')) return;
    const style = document.createElement('style');
    style.id = 'spinMotionStyles';
    style.textContent = `
      .spin-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .spin-phase-track{display:grid;grid-template-columns:auto 1fr auto 1fr auto;gap:7px;align-items:center;margin:10px 0 12px;padding:10px;border:1px solid rgba(101,216,255,.13);border-radius:12px;background:rgba(101,216,255,.025);font-size:.62rem;font-weight:850;color:var(--muted)}
      .spin-phase-track .arrow{height:2px;background:linear-gradient(90deg,rgba(101,216,255,.18),rgba(101,216,255,.65));position:relative}.spin-phase-track .arrow:after{content:'›';position:absolute;right:-3px;top:-9px;color:#8de8ff;font-size:1rem}
      .spin-phase-track b{color:#dff8ff;font-size:.64rem}
      .spin-range-note{margin-top:6px;color:var(--muted2);font-size:.65rem;line-height:1.45}
      .spin-live-range{margin-top:10px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:#b7efff;font-size:.64rem;line-height:1.45}
      .drama-master{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;margin:12px 0;border:1px solid rgba(101,216,255,.18);border-radius:13px;background:rgba(101,216,255,.045)}
      .drama-master strong{display:block;font-size:.78rem}.drama-master small{display:block;margin-top:3px;color:var(--muted);font-size:.66rem;line-height:1.4}
      .drama-status{min-width:42px;padding:4px 7px;border-radius:99px;text-align:center;font-size:.6rem;font-weight:900;border:1px solid var(--border);color:var(--muted)}
      .drama-master.on .drama-status{color:#8ff4cf;border-color:rgba(69,224,168,.22);background:rgba(69,224,168,.07)}
      .drama-toggle{width:46px;height:26px;accent-color:var(--accent)}
      .drama-controls.is-off{opacity:.45}.drama-controls.is-off input{cursor:not-allowed}
      @media(max-width:640px){.spin-mini-grid{grid-template-columns:1fr}.spin-phase-track{grid-template-columns:1fr;text-align:center}.spin-phase-track .arrow{width:2px;height:15px;margin:auto}.spin-phase-track .arrow:after{content:'⌄';right:-6px;top:4px}}
    `;
    document.head.appendChild(style);
  }

  function renameBaseFields() {
    const rename = (id, labelText) => {
      const input = document.getElementById(id);
      const label = input?.closest('label.field');
      if (label?.firstChild) label.firstChild.nodeValue = labelText;
    };
    rename('minSpin', 'Minimum total spin seconds');
    rename('maxSpin', 'Maximum total spin seconds');
    rename('minTurns', 'Minimum full rotations');
  }

  function injectEditorUi() {
    if (document.body.dataset.page !== 'edit' || document.getElementById('spinMotionCard')) return;
    const grid = document.querySelector('#tab-settings .settings-grid');
    if (!grid) return;

    injectStyles();
    renameBaseFields();

    const motion = document.createElement('div');
    motion.id = 'spinMotionCard';
    motion.className = 'editor-card static-card spin-motion-settings';
    motion.innerHTML = `
      <div class="section-kicker">MOTION</div>
      <h3>Spin-up & spin-down</h3>
      <p class="muted">Each spin randomly chooses an acceleration and slowdown time inside these ranges. The remaining part of the configured total spin time is the full-speed cruise.</p>
      <div class="spin-phase-track"><b>START</b><span class="arrow"></span><b>↗ FULL SPEED</b><span class="arrow"></span><b>↘ STOP</b></div>
      <strong class="mini-heading">Spin-up / acceleration</strong>
      <div class="spin-mini-grid">
        <label class="field">Minimum spin-up seconds<input id="spinUpMinSeconds" type="number" min="0.1" max="10" step="0.1"></label>
        <label class="field">Maximum spin-up seconds<input id="spinUpMaxSeconds" type="number" min="0.1" max="12" step="0.1"></label>
      </div>
      <strong class="mini-heading" style="margin-top:10px">Spin-down / slowdown</strong>
      <div class="spin-mini-grid">
        <label class="field">Minimum spin-down seconds<input id="spinDownMinSeconds" type="number" min="0.3" max="20" step="0.1"></label>
        <label class="field">Maximum spin-down seconds<input id="spinDownMaxSeconds" type="number" min="0.3" max="25" step="0.1"></label>
      </div>
      <div id="spinMotionRange" class="spin-live-range"></div>
      <div class="spin-range-note">The wheel accelerates smoothly from rest, holds a constant maximum speed, then decelerates smoothly to zero. No speed jump between phases.</div>`;
    grid.appendChild(motion);

    const drama = document.createElement('div');
    drama.id = 'spinDramaCard';
    drama.className = 'editor-card static-card spin-drama-settings';
    drama.innerHTML = `
      <div class="section-kicker">DRAMA</div>
      <h3>Random spin & suspense</h3>
      <p class="muted spin-settings-note">Drama mode never re-spins the wheel. After the normal spin-down it can fake a stop and creep a little farther before the real result.</p>
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
        <div class="spin-range-note">Example: 30–80° means only part of one turn after the fake stop.</div>
      </div>
      <label class="check-line"><input id="showSlowIcon" type="checkbox"> <span>Show the current pictogram above the wheel while it is slowing</span></label>
      <label class="field">Start live pictograms after (%)<input id="iconPreviewStartPercent" type="number" min="10" max="80" step="5"></label>
      <div class="spin-range-note">Lower values make the large current pictogram start earlier.</div>`;
    grid.appendChild(drama);

    const ids = [
      'maxTurns','spinUpMinSeconds','spinUpMaxSeconds','spinDownMinSeconds','spinDownMaxSeconds',
      'dramaEnabled','dramaChance','dramaCreepMinDegrees','dramaCreepMaxDegrees',
      'showSlowIcon','iconPreviewStartPercent'
    ];

    const updateDramaUi = () => {
      const enabled = !!document.getElementById('dramaEnabled')?.checked;
      document.getElementById('dramaEnabled')?.closest('.drama-master')?.classList.toggle('on', enabled);
      document.getElementById('dramaControls')?.classList.toggle('is-off', !enabled);
      const status = document.getElementById('dramaStatus');
      if (status) status.textContent = enabled ? 'ON' : 'OFF';
      ['dramaChance','dramaCreepMinDegrees','dramaCreepMaxDegrees'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
      });
    };

    const updateRangeNote = () => {
      const s = load();
      const minTotal = Number(document.getElementById('minSpin')?.value || 6.5);
      const maxTotal = Number(document.getElementById('maxSpin')?.value || 9.5);
      const node = document.getElementById('spinMotionRange');
      if (node) node.textContent = `Random per spin · total ${minTotal.toFixed(1)}–${maxTotal.toFixed(1)}s · spin-up ${s.spinUpMinSeconds.toFixed(1)}–${s.spinUpMaxSeconds.toFixed(1)}s · spin-down ${s.spinDownMinSeconds.toFixed(1)}–${s.spinDownMaxSeconds.toFixed(1)}s`;
    };

    const sync = () => {
      const s = load();
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!s[id];
        else el.value = s[id];
      });
      const minTurns = Number(document.getElementById('minTurns')?.value || 6);
      if (Number(document.getElementById('maxTurns')?.value || 0) < minTurns) {
        document.getElementById('maxTurns').value = Math.min(24, minTurns + 2);
      }
      updateDramaUi();
      updateRangeNote();
    };

    const persist = () => {
      const minTurns = Math.round(clamp(document.getElementById('minTurns')?.value, 3, 20, 6));
      const upMin = clamp(document.getElementById('spinUpMinSeconds')?.value, .1, 10, defaults.spinUpMinSeconds);
      const upMax = clamp(document.getElementById('spinUpMaxSeconds')?.value, upMin, 12, defaults.spinUpMaxSeconds);
      const downMin = clamp(document.getElementById('spinDownMinSeconds')?.value, .3, 20, defaults.spinDownMinSeconds);
      const downMax = clamp(document.getElementById('spinDownMaxSeconds')?.value, downMin, 25, defaults.spinDownMaxSeconds);
      const creepMin = Math.round(clamp(document.getElementById('dramaCreepMinDegrees')?.value, 5, 160, defaults.dramaCreepMinDegrees));
      const creepMax = Math.round(clamp(document.getElementById('dramaCreepMaxDegrees')?.value, creepMin, 180, defaults.dramaCreepMaxDegrees));
      const s = save({
        maxTurns: Math.round(clamp(document.getElementById('maxTurns')?.value, minTurns, 24, Math.max(9, minTurns))),
        spinUpMinSeconds: upMin,
        spinUpMaxSeconds: upMax,
        spinDownMinSeconds: downMin,
        spinDownMaxSeconds: downMax,
        dramaEnabled: !!document.getElementById('dramaEnabled')?.checked,
        dramaChance: document.getElementById('dramaChance')?.value,
        dramaCreepMinDegrees: creepMin,
        dramaCreepMaxDegrees: creepMax,
        showSlowIcon: !!document.getElementById('showSlowIcon')?.checked,
        iconPreviewStartPercent: document.getElementById('iconPreviewStartPercent')?.value
      });
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!s[id];
        else el.value = s[id];
      });
      updateDramaUi();
      updateRangeNote();
    };

    ids.forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener(el.type === 'checkbox' ? 'change' : 'input', persist);
    });
    ['minSpin','maxSpin','minTurns'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
      if (id === 'minTurns') persist();
      else updateRangeNote();
    }));
    document.getElementById('applyBtn')?.addEventListener('click', persist);
    document.getElementById('editorFileInput')?.addEventListener('change', () => setTimeout(sync, 140));
    setTimeout(sync, 0);
  }

  window.FortuneSpinStyle = { KEY, defaults: { ...defaults }, load, save };
  injectEditorUi();
})();