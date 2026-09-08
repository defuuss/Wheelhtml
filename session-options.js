/* Device-local play preferences; XML configuration and session history stay portable. */
(() => {
  'use strict';
  const key = 'fortune-engine-play-options-v1';
  window.FortuneSessionOptions = {
    load() {
      try {
        const value = JSON.parse(localStorage.getItem(key)) || {};
        return Object.fromEntries(['avoidRepeat', 'quickSpin', 'muted', 'showOdds'].map(name => [name, value[name] === true]));
      } catch (_) { return {}; }
    },
    save(options) {
      try { localStorage.setItem(key, JSON.stringify(options)); } catch (_) { /* Preferences remain usable in memory. */ }
    },
    candidates(eligible, history, avoidRepeat) {
      if (!avoidRepeat || eligible.length < 2) return eligible;
      const last = history.at(-1)?.id;
      const alternatives = eligible.filter(item => item.id !== last);
      return alternatives.length ? alternatives : eligible;
    }
  };
})();
