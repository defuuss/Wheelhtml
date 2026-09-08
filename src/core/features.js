(() => {
  'use strict';
  const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const normalizeModifier = value => {
    const raw = value && typeof value === 'object' ? value : {};
    return { type: ['number', 'minutes', 'binary', 'custom'].includes(raw.type) ? raw.type : (raw.outcomes?.length ? 'custom' : 'number'),
      min: Math.round(number(raw.min ?? 1, 0, 999, 1)), max: Math.round(number(raw.max ?? 6, 1, 999, 6)),
      step: Math.round(number(raw.step ?? 1, 1, 999, 1)),
      enabled: raw.enabled === true, chance: number(raw.chance ?? 100, 0, 100, 100),
      outcomes: (Array.isArray(raw.outcomes) ? raw.outcomes : []).filter(entry => entry && typeof entry === 'object').slice(0, 24).map((entry, index) => ({
        name: String(entry.name || `Modifier ${index + 1}`).slice(0, 60),
        description: String(entry.description || '').slice(0, 240),
        weight: number(entry.weight ?? 1, .1, 100, 1),
        timerMultiplier: number(entry.timerMultiplier ?? 1, .25, 4, 1)
      })) };
  };
  function modifierOutcomes(value) {
    const s = normalizeModifier(value);
    if (s.type === 'custom') return s.outcomes;
    const entry = (name, value) => ({ name, value, description: '', weight: 1, timerMultiplier: 1,
      ...(s.type === 'minutes' ? { timerSeconds: value * 60 } : {}) });
    if (s.type === 'binary') return [entry('True', true), entry('False', false)];
    const max = Math.min(s.type === 'minutes' ? 60 : 999, Math.max(s.min, s.max));
    const min = Math.min(s.type === 'minutes' ? 60 : 999, s.min);
    const step = Math.max(s.step, Math.ceil((max - min) / 23));
    const outcomes = [];
    for (let n = min; n <= max; n += step) outcomes.push(entry(s.type === 'minutes' ? `${n} min` : String(n), n));
    return outcomes;
  }
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
      timerSeconds: Number.isFinite(modifier.timerSeconds) ? Math.min(3600, Math.max(0, modifier.timerSeconds)) : item.timerSeconds ? Math.min(3600, Math.max(1, Math.round(item.timerSeconds * modifier.timerMultiplier))) : 0 };
  }
  const deckDefaults = { nothing:3, skip:3, swap:3, doubleForfeit:3, doubleOrNothing:3, pickYourPoison:1, fateRoulette:1, tripleTrouble:1, rarest:1, chaosWeights:1, devilFive:1 };
  const deckNames = { nothing:'Nothing', skip:'Lucky Skip', swap:'Swap Fate', doubleForfeit:'Double Forfeit', doubleOrNothing:'Double or Nothing', pickYourPoison:'Pick Your Poison', fateRoulette:'Fate Roulette', tripleTrouble:'Triple Trouble', rarest:'Rarest Fate', chaosWeights:'Chaos Weights', devilFive:'Devil’s Five' };
  function normalizeDeck(raw) { return Object.fromEntries(Object.entries(deckDefaults).map(([id,count]) => [id, Math.round(number(raw?.[id] ?? count,0,30,count))])); }
  function shuffle(items, random = Math.random) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i],out[j]] = [out[j],out[i]]; }
    return out;
  }
  function wheelOrder(items, session) {
    const positions = new Map((session.wheelOrder || []).map((id,i) => [id,i]));
    return [...items].sort((a,b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  }
  window.FortuneFeatures = { deckDefaults, deckNames, normalizeDeck, shuffle, wheelOrder, normalizeModifier, modifierOutcomes, deleteGroup, choose, applyModifier };
})();
