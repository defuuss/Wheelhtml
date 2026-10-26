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
  function consumeMiniLuck(item, tokens=0) {
    const saved=Math.max(0,Math.min(3,Math.floor(Number(tokens)||0)));
    if (!saved || !Number.isFinite(item?.timerSeconds) || item.timerSeconds <= 0) return {item,remaining:saved};
    return { item:{...item,timerSeconds:Math.max(1,Math.ceil(item.timerSeconds/2)),
      description:[item.description,'Mini-game luck: challenge timer reduced by half.'].filter(Boolean).join('\n\n')},remaining:saved-1 };
  }
  // An omen is a temporary atmosphere, not a level or a guaranteed countdown.
  // The displayed percentage is the actual chance of a surprise Fate draw.
  function normalizeFateSurprise(value) { return ['off','rare','frequent'].includes(value) ? value : 'rare'; }
  function fateSurpriseChance(mode, omen='calm', cooldown=0, cardsAvailable=true) {
    if (normalizeFateSurprise(mode)==='off' || cooldown>0 || !cardsAvailable) return 0;
    const odds=normalizeFateSurprise(mode)==='frequent'
      ? {calm:.08,watching:.16,devilish:.25}
      : {calm:.04,watching:.08,devilish:.14};
    return odds[omen] ?? odds.calm;
  }
  function nextFateOmen(current='calm', roll=Math.random()) {
    if (current==='devilish') return roll<.25?'watching':'devilish';
    if (current==='watching') return roll<.55?'devilish':'watching';
    return roll<.65?'watching':'calm';
  }
  const deckDefaults = { nothing:3, skip:3, swap:3, doubleForfeit:3, doubleOrNothing:3, pickYourPoison:1, fateRoulette:1, tripleTrouble:1, rarest:1, chaosWeights:1, devilFive:1, sealedEnvelopes:0, threeSeals:2, miniGame:0, miniHigher:1, miniDice:1, miniMeter:1 };
  const deckNames = { nothing:'Nothing', skip:'Lucky Skip', swap:'Swap Fate', doubleForfeit:'Double Forfeit', doubleOrNothing:'Double or Nothing', pickYourPoison:'Pick Your Poison', fateRoulette:'Fate Roulette', tripleTrouble:'Triple Trouble', rarest:'Rarest Fate', chaosWeights:'Chaos Weights', devilFive:'Devil’s Five', sealedEnvelopes:'Sealed Envelopes', threeSeals:'Three Sealed Fates', miniGame:'Mini-game Challenge', miniHigher:'Higher or Lower', miniDice:'Dice Duel', miniMeter:'Stop the Meter' };
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
  function normalizeReveals(raw = {}) {
    return { envelopeCount: Math.round(number(raw.envelopeCount ?? 3, 2, 3, 3)),
      envelopeHint: ['none','group','duration'].includes(raw.envelopeHint) ? raw.envelopeHint : 'none',
      envelopeGroups: Array.isArray(raw.envelopeGroups) ? [...new Set(raw.envelopeGroups.map(String))] : [],
      autoplay: raw.autoplay === true };
  }
  const cardArtFiles = {back:'card-back',nothing:'nothing',skip:'lucky-skip',swap:'swap-fate',doubleForfeit:'double-forfeit',doubleOrNothing:'double-or-nothing',pickYourPoison:'pick-your-poison',fateRoulette:'fate-roulette',tripleTrouble:'triple-trouble',rarest:'rarest',chaosWeights:'chaos',devilFive:'devil-five',sealedEnvelopes:'sealed-envelopes',threeSeals:'sealed-envelopes',miniGame:'fate-roulette',miniHigher:'fate-roulette',miniDice:'fate-roulette',miniMeter:'fate-roulette'};
  // Every Fate type has a matching pair of built-in portraits. A draw fixes its variant
  // so the image does not unexpectedly switch on a page reload. User uploads still win.
  const defaultCardPortraits = {
    nothing:'orange-freckles-swimsuit', skip:'sad-blue-wheel-emblem', swap:'violet-bob-swimsuit',
    doubleForfeit:'black-swimsuit-overknee-boots', doubleOrNothing:'pink-side-shaved-mohawk-swimsuit',
    pickYourPoison:'silver-undercut-suit', fateRoulette:'undercut-swimsuit',
    tripleTrouble:'bald-purple-pierced-throne', rarest:'bald-pearl-swimsuit',
    chaosWeights:'turquoise-mohawk-orange-wheel', devilFive:'devil-mohawk-red-wheel',
    sealedEnvelopes:'platinum-undercut-teal-latex', threeSeals:'platinum-undercut-teal-latex', miniGame:'lime-braids-swimsuit', miniHigher:'lime-braids-swimsuit', miniDice:'cobalt-short-curls-swimsuit', miniMeter:'undercut-swimsuit'
  };
  const alternateCardPortraits = {
    nothing:'nothing-pink-buzzcut-v2', skip:'skip-bald-blue-v2',
    swap:'swap-violet-asian-undercut-v2', doubleForfeit:'double-forfeit-black-pompadour-v2',
    doubleOrNothing:'double-or-nothing-fuchsia-mohawk-v2',
    pickYourPoison:'poison-chinese-green-undercut-v2',
    fateRoulette:'roulette-japanese-yellow-sidecut-v2',
    tripleTrouble:'triple-german-silver-mohawk-v2',
    rarest:'rarest-french-pearl-v2', chaosWeights:'chaos-african-orange-braids-v2',
    devilFive:'devil-indian-black-bald-v2',
    sealedEnvelopes:'envelopes-brazilian-sapphire-v2', threeSeals:'envelopes-brazilian-sapphire-v2', miniGame:'cobalt-short-curls-swimsuit', miniHigher:'cobalt-short-curls-swimsuit', miniDice:'lime-braids-swimsuit', miniMeter:'violet-bob-swimsuit'
  };
  const maxCardImageLength = 120000;
  function normalizeCardImages(raw) {
    const images={};
    for(const id of Object.keys(cardArtFiles)) {
      const value=raw?.[id];
      if(typeof value==='string' && value.length<=maxCardImageLength && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) images[id]=value;
    }
    return images;
  }
  function cardArtworkVariants(id) {
    return [defaultCardPortraits[id],alternateCardPortraits[id]].filter(Boolean)
      .map(name=>'assets/fate-cards/manga/'+name+'.webp');
  }
  function defaultCardImage(id, variant=0) {
    const portraits=cardArtworkVariants(id);
    if(portraits.length) return portraits[Number.isInteger(variant) && variant>=0 ? variant%portraits.length : 0];
    return 'assets/fate-cards/vector/'+(cardArtFiles[id] || 'card-back')+'.svg?v=20260915';
  }
  function cardImage(id, settings, variant=0) { return normalizeCardImages(settings?.cardImages)[id] || defaultCardImage(id,variant); }
  function setCardImage(image,id,settings,variant=0) {
    image.onerror=()=>{image.onerror=null;image.src=defaultCardImage(id);};
    image.src=cardImage(id,settings,variant);
  }
  window.FortuneFeatures = { cardArtFiles,maxCardImageLength,normalizeCardImages,cardArtworkVariants,defaultCardImage,cardImage,setCardImage,normalizeReveals, deckDefaults, deckNames, normalizeDeck, shuffle, wheelOrder, normalizeModifier, modifierOutcomes, deleteGroup, choose, applyModifier, consumeMiniLuck, normalizeFateSurprise, fateSurpriseChance, nextFateOmen };
})();
