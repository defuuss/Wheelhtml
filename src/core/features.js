(() => {
  'use strict';
  const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const normalizeModifier = value => {
    const raw = value && typeof value === 'object' ? value : {};
    return { enabled: raw.enabled === true, chance: number(raw.chance ?? 100, 0, 100, 100),
      outcomes: (Array.isArray(raw.outcomes) ? raw.outcomes : []).filter(entry => entry && typeof entry === 'object').slice(0, 24).map((entry, index) => ({
        name: String(entry.name || `Modifier ${index + 1}`).slice(0, 60),
        description: String(entry.description || '').slice(0, 240),
        weight: number(entry.weight ?? 1, .1, 100, 1),
        timerMultiplier: number(entry.timerMultiplier ?? 1, .25, 4, 1)
      })) };
  };
  function deleteGroup(config, groupId) {
    const result = JSON.parse(JSON.stringify(config));
    if (!result.levels.some(level => level.id === groupId)) return result;
    const deleted = new Set(result.forfeits.filter(item => item.levelId === groupId).map(item => item.id));
    result.levels = result.levels.filter(level => level.id !== groupId);
    result.forfeits = result.forfeits.filter(item => !deleted.has(item.id));
    for (const level of result.levels) level.completionUnlockLevels = (level.completionUnlockLevels || []).filter(id => id !== groupId);
    for (const item of result.forfeits) {
      item.unlockLevels = (item.unlockLevels || []).filter(id => id !== groupId);
      item.requiresForfeitIds = (item.requiresForfeitIds || []).filter(id => !deleted.has(id));
    }
    result.rules = (result.rules || []).filter(rule => !(rule.conditionForfeitIds || []).some(id => deleted.has(id)))
      .map(rule => ({ ...rule, unlockLevels: (rule.unlockLevels || []).filter(id => id !== groupId) }))
      .filter(rule => rule.unlockLevels.length);
    if (!result.levels.length) result.levels.push({ id: 'start', name: 'Start', icon: '✦', color: '#57d3ff', activeAtStart: true });
    if (!result.levels.some(level => level.activeAtStart)) result.levels[0].activeAtStart = true;
    return result;
  }
  function choose(outcomes, random = Math.random) {
    let n = random() * outcomes.reduce((sum, entry) => sum + entry.weight, 0);
    for (const entry of outcomes) { n -= entry.weight; if (n < 0) return entry; }
    return outcomes.at(-1);
  }
  function applyModifier(item, modifier) {
    if (!modifier) return item;
    return { ...item, description: [item.description, `Modifier: ${modifier.name}`, modifier.description].filter(Boolean).join('\n\n'),
      timerSeconds: item.timerSeconds ? Math.min(3600, Math.max(1, Math.round(item.timerSeconds * modifier.timerMultiplier))) : 0 };
  }
  window.FortuneFeatures = { normalizeModifier, deleteGroup, choose, applyModifier };
})();
