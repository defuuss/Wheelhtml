(() => {
  'use strict';

  if (window.__fortuneFateDeckV4) return;
  window.__fortuneFateDeckV4 = true;

  const M = window.FortuneModel;
  const $ = id => document.getElementById(id);
  if (!M) return;

  const STORAGE_KEY = 'fortune-fate-deck-v4';
  const ASSET = name => `assets/fate-cards/${name}.webp?v=1`;

  const CARD_META = {
    nothing: { name:'Nothing', kind:'FATE CARD', className:'neutral', art:ASSET('nothing'), text:'Nice try. Nothing changes — the current forfeit still applies.' },
    skip: { name:'Lucky Skip', kind:'LUCKY CARD', className:'good', art:ASSET('lucky-skip'), text:'Lucky escape. The current forfeit is cancelled.' },
    swap: { name:'Swap Fate', kind:'CHANCE CARD', className:'chance', art:ASSET('swap-fate'), text:'Trade the current forfeit for one new wheel result. The replacement must be accepted.' },
    doubleForfeit: { name:'Double Forfeit', kind:'BAD CARD', className:'bad', art:ASSET('double-forfeit'), text:'The current forfeit stays and one additional forfeit is added.' },
    doubleOrNothing: { name:'Double or Nothing', kind:'RISK CARD', className:'risk', art:ASSET('double-or-nothing'), text:'Spin the small wheel. Nothing cancels the current forfeit; Double reveals one more.' },
    pickYourPoison: { name:'Pick Your Poison', kind:'CHOICE CARD', className:'poison', art:ASSET('pick-your-poison'), text:'Choose: keep the result you already know, or replace it with one unknown result you must accept.' },
    fateRoulette: { name:'Fate Roulette', kind:'CHAOS CARD', className:'roulette', art:ASSET('fate-roulette'), text:'A mini roulette decides: Keep, Skip, Swap, or Double.' },
    rarest: { name:'Rarest Fate', kind:'RARE CARD', className:'rare', glyph:'◇', text:'Adds the eligible forfeit with the smallest current weight. Ties are chosen randomly.' },
    chaosWeights: { name:'Chaos Weights', kind:'CHAOS CARD', className:'chaos', glyph:'⚡', text:'Randomly changes active weights for this session. The wheel updates immediately.' },
    devilFive: { name:'Devil’s Five', kind:'DEVIL CARD', className:'devil', glyph:'♆', text:'Choose an active group. Up to five different available forfeits reveal slowly, one by one.' },
    tripleTrouble: { name:'Triple Trouble', kind:'VERY BAD CARD', className:'triple', art:ASSET('triple-trouble'), text:'The current forfeit stays and two additional forfeits are added.' }
  };

  function deckSettings() { return window.FortuneFeatures.normalizeDeck(M.loadConfig().settings.fateDeck); }
  function deckSignature() { const cfg=M.loadConfig(), session=M.loadSession(cfg); return JSON.stringify([session.sessionId || session.configSignature, deckSettings()]); }


  let usedResultKey = '';
  let currentDraw = null;
  let currentContext = null;
  let pendingAction = null;
  let coinResolved = false;
  let rouletteResolved = false;

  function defaultState() { return { signature:deckSignature(), cards:Object.entries(deckSettings()).flatMap(([id,count])=>Array(count).fill(id)), pendingExtraSpins:0, lockNextResult:false }; }
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || !Array.isArray(raw.cards) || raw.signature !== deckSignature()) return defaultState();
      raw.cards = raw.cards.filter(id => CARD_META[id]);
      raw.pendingExtraSpins = Math.max(0, Math.round(Number(raw.pendingExtraSpins) || 0));
      raw.lockNextResult = Boolean(raw.lockNextResult);
      return raw;
    } catch (_) { return defaultState(); }
  }
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    renderDeckPanel();
  }
  function resetDeck() { saveState(defaultState()); usedResultKey = ''; }

  const originalSaveSession = M.saveSession?.bind(M);
  if (originalSaveSession && !M.__fateDeckV4Wrapped) {
    M.__fateDeckV4Wrapped = true;
    M.saveSession = session => {
      if (session?.cardState) {
        session.cardState.respin = 0;
        session.cardState.shorten = 0;
        session.cardState.chaosNext = false;
        session.cardState.doubleTimeNext = false;
        session.cardState.forcedForfeits = 0;
        session.cardState.chaosBackup = {};
      }
      return originalSaveSession(session);
    };
  }

  function ensureDeckPanel() {
    let panel = $('fateDeckPanel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'fateDeckPanel';
    panel.className = 'fate-deck-panel fate-deck-v4-panel';
    panel.innerHTML = `
      <div class="fate-v4-mini-stack" aria-hidden="true">
        <img src="${ASSET('card-back')}" alt=""><img src="${ASSET('card-back')}" alt=""><img src="${ASSET('card-back')}" alt="">
      </div>
      <div class="fate-deck-panel-copy">
        <span>FATE DECK</span><strong id="fateDeckCount">Loading deck…</strong>
        <small>Don't like the result? Risk one card. Every card acts immediately.</small>
      </div>`;
    document.querySelector('.wheel-stats')?.insertAdjacentElement('afterend', panel);
    return panel;
  }
  function renderDeckPanel() {
    ensureDeckPanel();
    const state = loadState();
    const count = state.cards.length;
    const label = $('fateDeckCount');
    if (label) label.textContent = count ? `${count} card${count === 1 ? '' : 's'} left` : 'DECK EMPTY';
    $('fateDeckPanel')?.classList.toggle('empty', count === 0);
    updateTemptButton();
  }
  function resultKey() {
    try {
      const cfg = M.loadConfig(), session = M.loadSession(cfg), last = session.history?.at?.(-1);
      return last ? `${session.sessionId || 'legacy'}:${session.spinCount}:${last.id}:${last.time || ''}` : '';
    } catch (_) { return ''; }
  }
  function consumeForcedReplacementLock() {
    const key = resultKey();
    if (!key) return;
    const state = loadState();
    if (!state.lockNextResult) return;
    state.lockNextResult = false;
    usedResultKey = key;
    saveState(state);
  }
  function ensureTemptButton() {
    let button = $('temptFateBtn');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'temptFateBtn';
    button.type = 'button';
    button.className = 'btn fate-tempt-btn large';
    button.innerHTML = '<span>✦</span> Take a Fate Card';
    button.addEventListener('click', drawFromResult);
    document.querySelector('#resultOverlay .result-actions')?.appendChild(button);
    return button;
  }
  function updateTemptButton() {
    const button = ensureTemptButton();
    if (!button) return;
    const key = resultKey(), cardsLeft = loadState().cards.length, resultVisible = !$('resultOverlay')?.hidden;
    button.hidden = !resultVisible || !key || usedResultKey === key;
    button.disabled = cardsLeft === 0;
    button.innerHTML = cardsLeft ? `<span>✦</span> Take a Fate Card <small>${cardsLeft} left</small>` : '<span>✦</span> Fate Deck Empty';
    const accept = $('resultCloseBtn');
    if (accept && resultVisible && accept.textContent !== 'Accept') accept.textContent = 'Accept';
  }
  function takeCard() {
    const state = loadState();
    if (!state.cards.length) return null;
    const index = Math.floor(Math.random() * state.cards.length);
    const id = state.cards.splice(index,1)[0];
    saveState(state);
    return id;
  }

  function ensureOverlay() {
    let overlay = $('fateDeckOverlayV4');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fateDeckOverlayV4';
    overlay.className = 'fate-v4-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="fate-v4-backdrop"></div>
      <section class="fate-v4-shell" role="dialog" aria-modal="true" aria-labelledby="fateV4Title">
        <div class="fate-v4-reveal-label">DRAW FROM THE FATE DECK</div>
        <div id="fateV4Card" class="fate-v4-card"><div class="fate-v4-card-inner">
          <div class="fate-v4-side fate-v4-back"><img src="${ASSET('card-back')}" alt="Fate Deck"></div>
          <div class="fate-v4-side fate-v4-front"><img id="fateV4FrontImage" alt=""><div id="fateCustomArt" class="fate-custom-art" hidden><span></span><strong></strong><small>FORTUNE ENGINE</small></div></div>
        </div></div>
        <div id="fateV4Status" class="fate-v4-status"></div>
        <div id="fateV4CoinArea" class="fate-v4-coin-area" hidden>
          <div class="fate-v4-coin-copy"><strong>DOUBLE OR NOTHING</strong><span>Two equal chances. One final stop.</span></div>
          <div class="risk-wheel-stage"><span class="risk-pointer">▼</span><div id="fateV4Coin" class="risk-wheel"><span class="risk-double">×2<br>DOUBLE</span><span class="risk-nothing">✦<br>NOTHING</span></div><span class="risk-hub">✦</span></div>
          <div id="fateV4CoinResult" class="fate-v4-mini-result">FATE IS WAITING</div>
          <button id="fateV4Flip" class="btn fate-v4-risk-btn large" type="button">SPIN THE FATE WHEEL</button>
        </div>
        <div id="fateV4ChoiceArea" class="fate-v4-choice-area" hidden>
          <div class="fate-v4-choice-grid">
            <button id="fateV4ChoiceKeep" class="fate-v4-choice" type="button"><span>KNOWN</span><strong>KEEP IT</strong><small>Accept the current result</small></button>
            <button id="fateV4ChoiceSwap" class="fate-v4-choice unknown" type="button"><span>UNKNOWN</span><strong>SWAP IT</strong><small>One replacement. No second Fate card.</small></button>
          </div>
        </div>
        <div id="fateV4RouletteArea" class="fate-v4-roulette-area" hidden>
          <div class="fate-v4-roulette-stage"><div class="fate-v4-roulette-pointer">▼</div><div id="fateV4Roulette" class="fate-v4-roulette">
            <span class="r-keep">KEEP</span><span class="r-skip">SKIP</span><span class="r-swap">SWAP</span><span class="r-double">DOUBLE</span>
          </div></div>
          <div id="fateV4RouletteResult" class="fate-v4-mini-result">SPIN THE MINI WHEEL</div>
          <button id="fateV4RouletteSpin" class="btn fate-v4-roulette-btn large" type="button">SPIN ROULETTE</button>
        </div>
        <label id="devilGroupField" class="field devil-group-field" hidden>Choose the group<select id="devilGroup"></select></label>
        <div class="fate-v4-actions"><button id="fateV4Continue" class="btn primary large" type="button">Continue</button></div>
      </section>`;
    document.body.appendChild(overlay);
    $('fateV4Continue').addEventListener('click', finishCard);
    $('fateV4Flip').addEventListener('click', flipCoin);
    $('fateV4ChoiceKeep').addEventListener('click', () => resolveChoice('keep'));
    $('fateV4ChoiceSwap').addEventListener('click', () => resolveChoice('swap'));
    $('fateV4RouletteSpin').addEventListener('click', spinRoulette);
    return overlay;
  }

  function showCard(id, context) {
    const overlay = ensureOverlay(), meta = CARD_META[id];
    if (!meta) return;
    currentDraw = id; currentContext = context; pendingAction = null; coinResolved = false; rouletteResolved = false;
    const card = $('fateV4Card');
    card.dataset.kind = meta.className;
    card.classList.remove('revealed','dealing','evil-pop');
    $('fateV4FrontImage').hidden = Boolean(meta.glyph);
    if (meta.art) $('fateV4FrontImage').src = meta.art;
    const art = $('fateCustomArt'); art.hidden = !meta.glyph; art.dataset.kind = meta.className; art.querySelector('span').textContent = meta.glyph || ''; art.querySelector('strong').textContent = meta.name;
    $('devilGroupField').hidden = id !== 'devilFive';
    $('devilGroup').replaceChildren();
    const groups = new Map(); window.FortunePlay.candidates().forEach(item => { const group = groups.get(item.levelId) || {name:item.groupName,count:0}; group.count++;groups.set(item.levelId,group); });
    groups.forEach((group,id) => { const option=document.createElement('option');option.value=id;option.textContent=`${group.name} · ${group.count} available`; $('devilGroup').append(option); });
    $('fateV4FrontImage').alt = meta.name;
    $('fateV4Status').innerHTML = `<span>${meta.kind}</span><strong id="fateV4Title">${meta.name}</strong><small>${meta.text}</small>`;
    $('fateV4CoinArea').hidden = id !== 'doubleOrNothing';
    $('fateV4ChoiceArea').hidden = id !== 'pickYourPoison';
    $('fateV4RouletteArea').hidden = id !== 'fateRoulette';
    $('fateV4Continue').hidden = ['doubleOrNothing','pickYourPoison','fateRoulette'].includes(id);
    $('fateV4Continue').textContent = 'Continue';
    $('fateV4Flip').hidden = false; $('fateV4Flip').disabled = false; $('fateV4CoinResult').textContent = 'FATE IS WAITING'; $('fateV4Coin').getAnimations?.().forEach(animation=>animation.cancel()); $('fateV4Coin').className = 'risk-wheel'; $('fateV4Coin').style.transform = 'rotate(0deg)';
    $('fateV4ChoiceKeep').disabled = false; $('fateV4ChoiceSwap').disabled = false;
    $('fateV4RouletteSpin').hidden = false; $('fateV4RouletteSpin').disabled = false; $('fateV4RouletteResult').textContent = 'SPIN THE MINI WHEEL'; $('fateV4Roulette').style.transform = 'rotate(0deg)';
    overlay.hidden = false;
    requestAnimationFrame(() => {
      card.classList.add('dealing');
      setTimeout(() => { card.classList.add('revealed'); if (['bad','triple'].includes(meta.className)) setTimeout(() => card.classList.add('evil-pop'),520); },620);
    });
  }

  function drawFromResult() {
    const key = resultKey();
    if (!key || usedResultKey === key) return;
    const id = takeCard();
    if (!id) return;
    usedResultKey = key;
    updateTemptButton();
    const timerButton = $('timerStartPause');
    if (timerButton && timerButton.textContent === 'Pause') timerButton.click();
    showCard(id,'result');
  }
  function drawFromWheel() { const id = takeCard(); closeOldCardOverlay(); if (id) showCard(id,'wheel'); return Boolean(id); }
  window.FortuneFateDeck = { drawFromWheel };
  function closeOldCardOverlay() { const old = $('specialCardOverlay'); if (old) old.hidden = true; }
  function restorePreviousSpin() {
    const result = $('resultOverlay');
    if (result && !result.hidden) { result.classList.remove('show'); result.hidden = true; }
    const undo = $('undoBtn');
    if (undo && !undo.disabled) undo.click();
  }
  function forceReplacementSpin() {
    const state = loadState(); state.lockNextResult = true; saveState(state);
    if (currentContext === 'result') restorePreviousSpin();
    setTimeout(() => $('spinBtn')?.click(),220);
  }
  function launchOnePendingSpin() {
    const state = loadState();
    if (state.pendingExtraSpins <= 0) return false;
    const count = state.pendingExtraSpins; state.pendingExtraSpins = 0; saveState(state); window.FortuneBatchReveal.open({count,title:'Additional forfeits'}); return true;
  }
  function performAction(action) {
    const resultContext = currentContext === 'result';
    if (action === 'skip') { if (resultContext) restorePreviousSpin(); }
    else if (action === 'swap') forceReplacementSpin();
    else if (action === 'double' || action === 'triple' || action === 'rarest' || action === 'devilFive') {
      const count = action === 'devilFive' ? 5 : action === 'rarest' ? 1 : (action === 'double' ? 2 : 3) - (resultContext ? 1 : 0);
      const title = action === 'devilFive' ? 'Devil’s Five' : action === 'rarest' ? 'Rarest Fate' : action === 'double' ? 'Double Forfeit' : 'Triple Trouble';
      window.FortuneBatchReveal.open({count,title,lowest:action === 'rarest',groupId:action === 'devilFive' ? ($('devilGroup').value || '__none__') : '',keepCurrent:resultContext});
    } else if (action === 'chaosWeights') window.FortunePlay.randomizeWeights();
  }
  function resolveChoice(action) {
    pendingAction = action;
    $('fateV4ChoiceKeep').disabled = true; $('fateV4ChoiceSwap').disabled = true;
    $('fateV4Status').querySelector('small').textContent = action === 'swap' ? 'Unknown fate chosen. The replacement is final.' : 'Known fate chosen. The current forfeit stays.';
    $('fateV4Continue').hidden = false;
    $('fateV4Continue').textContent = action === 'swap' ? 'Reveal replacement' : 'Accept current result';
  }
  async function flipCoin() {
    if (currentDraw !== 'doubleOrNothing' || coinResolved) return;
    coinResolved = true;
    const button = $('fateV4Flip'), wheel = $('fateV4Coin'), doubled = Math.random() < .5;
    button.disabled = true;
    const angle = 1800 - (doubled ? 90 : 270);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2600;
    try { await wheel.animate([{transform:'rotate(0deg)'},{transform:`rotate(${angle}deg)`}],{duration,easing:'cubic-bezier(.15,.65,.2,1)',fill:'forwards'}).finished; } catch (_) { wheel.style.transform=`rotate(${angle}deg)`; }
    pendingAction = doubled ? 'double' : 'skip';
    $('fateV4CoinResult').textContent = doubled ? (currentContext === 'result' ? 'DOUBLE · KEEP IT + REVEAL ONE' : 'DOUBLE · REVEAL TWO') : 'NOTHING · NO ADDITIONAL FORFEIT';
    button.hidden = true; $('fateV4Continue').hidden = false; $('fateV4Continue').textContent = doubled ? 'Reveal forfeits' : 'Back to wheel';
  }
  function spinRoulette() {
    if (currentDraw !== 'fateRoulette' || rouletteResolved) return;
    rouletteResolved = true;
    const outcomes = currentContext === 'result' ? ['keep','skip','swap','double'] : ['nothing','swap','double','triple'];
    const action = outcomes[Math.floor(Math.random() * outcomes.length)];
    const labels = { keep:'KEEP', nothing:'NOTHING', skip:'SKIP', swap:'SWAP', double:'DOUBLE', triple:'TRIPLE' };
    const targetByAction = { keep:0, nothing:0, skip:-90, swap:-180, double:-270, triple:-270 };
    const wheel = $('fateV4Roulette'), button = $('fateV4RouletteSpin');
    button.disabled = true; wheel.style.transform = `rotate(${1440 + (targetByAction[action] || 0)}deg)`;
    setTimeout(() => { pendingAction = action; $('fateV4RouletteResult').textContent = labels[action]; button.hidden = true; $('fateV4Continue').hidden = false; $('fateV4Continue').textContent = 'Accept roulette'; },2100);
  }
  function finishCard() {
    const overlay = $('fateDeckOverlayV4');
    if (!overlay) return;
    const draw = currentDraw, context = currentContext;
    let action = pendingAction;
    if (!action) {
      if (draw === 'nothing') action = 'nothing';
      else if (draw === 'skip') action = 'skip';
      else if (draw === 'swap') action = 'swap';
      else if (draw === 'doubleForfeit') action = 'double';
      else if (draw === 'tripleTrouble') action = 'triple';
      else if (['rarest','chaosWeights','devilFive'].includes(draw)) action = draw;
    }
    overlay.hidden = true;
    if (action) performAction(action);
    currentDraw = null; currentContext = null; pendingAction = null;
    if (action === 'swap') return;
    if (action === 'skip' && context === 'result') return;
    if (context === 'wheel' && loadState().pendingExtraSpins > 0) launchOnePendingSpin();
    updateTemptButton();
  }

  const resultOverlay = $('resultOverlay');
  if (resultOverlay) new MutationObserver(() => {
    if (!resultOverlay.hidden) requestAnimationFrame(() => { consumeForcedReplacementLock(); updateTemptButton(); });
  }).observe(resultOverlay,{ attributes:true, attributeFilter:['hidden'] });

  const oldCardOverlay = $('specialCardOverlay');
  if (oldCardOverlay) new MutationObserver(() => {
    if (!oldCardOverlay.hidden && $('fateDeckOverlayV4')?.hidden !== false) setTimeout(drawFromWheel,0);
  }).observe(oldCardOverlay,{ attributes:true, attributeFilter:['hidden'] });

  $('resultCloseBtn')?.addEventListener('click',() => setTimeout(() => { if ($('fateDeckOverlayV4')?.hidden !== false) launchOnePendingSpin(); },90));
  $('resetBtn')?.addEventListener('click',() => {
    const before = M.loadSession(M.loadConfig());
    setTimeout(() => { const after = M.loadSession(M.loadConfig()); if (before.sessionId !== after.sessionId) resetDeck(); },90);
  });
  $('fileInput')?.addEventListener('change',() => setTimeout(renderDeckPanel,250));

  ensureOverlay(); ensureTemptButton(); renderDeckPanel();
})();
