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
    doubleOrNothing: { name:'Double or Nothing', kind:'RISK CARD', className:'risk', art:ASSET('double-or-nothing'), text:'Flip fate. Nothing cancels the current forfeit; Double keeps it and adds one more.' },
    pickYourPoison: { name:'Pick Your Poison', kind:'CHOICE CARD', className:'poison', art:ASSET('pick-your-poison'), text:'Choose: keep the result you already know, or replace it with one unknown result you must accept.' },
    fateRoulette: { name:'Fate Roulette', kind:'CHAOS CARD', className:'roulette', art:ASSET('fate-roulette'), text:'A mini roulette decides: Keep, Skip, Swap, or Double.' },
    tripleTrouble: { name:'Triple Trouble', kind:'VERY BAD CARD', className:'triple', art:ASSET('triple-trouble'), text:'The current forfeit stays and two additional forfeits are added.' }
  };

  const FULL_DECK = [
    'nothing','nothing','nothing',
    'skip','skip','skip',
    'swap','swap','swap',
    'doubleForfeit','doubleForfeit','doubleForfeit',
    'doubleOrNothing','doubleOrNothing','doubleOrNothing',
    'pickYourPoison','fateRoulette','tripleTrouble'
  ];

  let usedResultKey = '';
  let currentDraw = null;
  let currentContext = null;
  let pendingAction = null;
  let coinResolved = false;
  let rouletteResolved = false;

  function defaultState() { return { cards:[...FULL_DECK], pendingExtraSpins:0, lockNextResult:false }; }
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || !Array.isArray(raw.cards)) return defaultState();
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
        <span>FATE DECK</span><strong id="fateDeckCount">18 cards left</strong>
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
      return last ? `${session.spinCount}:${last.id}:${last.time || ''}` : '';
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
          <div class="fate-v4-side fate-v4-front"><img id="fateV4FrontImage" alt=""></div>
        </div></div>
        <div id="fateV4Status" class="fate-v4-status"></div>
        <div id="fateV4CoinArea" class="fate-v4-coin-area" hidden>
          <div class="fate-v4-coin-copy"><strong>DOUBLE OR NOTHING</strong><span>One clean 50 / 50 flip</span></div>
          <div class="fate-v4-coin-stage"><div id="fateV4Coin" class="fate-v4-coin">
            <div class="fate-v4-coin-face fate-v4-coin-nothing"><span>✦</span><strong>NOTHING</strong><small>cancel it</small></div>
            <div class="fate-v4-coin-face fate-v4-coin-double"><span>×2</span><strong>DOUBLE</strong><small>add one</small></div>
          </div></div>
          <div id="fateV4CoinResult" class="fate-v4-mini-result">FATE IS WAITING</div>
          <button id="fateV4Flip" class="btn fate-v4-risk-btn large" type="button">FLIP THE COIN</button>
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
    $('fateV4FrontImage').src = meta.art;
    $('fateV4FrontImage').alt = meta.name;
    $('fateV4Status').innerHTML = `<span>${meta.kind}</span><strong id="fateV4Title">${meta.name}</strong><small>${meta.text}</small>`;
    $('fateV4CoinArea').hidden = id !== 'doubleOrNothing';
    $('fateV4ChoiceArea').hidden = id !== 'pickYourPoison';
    $('fateV4RouletteArea').hidden = id !== 'fateRoulette';
    $('fateV4Continue').hidden = ['doubleOrNothing','pickYourPoison','fateRoulette'].includes(id);
    $('fateV4Continue').textContent = 'Continue';
    $('fateV4Flip').hidden = false; $('fateV4Flip').disabled = false; $('fateV4CoinResult').textContent = 'FATE IS WAITING'; $('fateV4Coin').className = 'fate-v4-coin';
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
  function drawFromWheel() { const id = takeCard(); closeOldCardOverlay(); if (id) showCard(id,'wheel'); }
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
  function queueExtra(count) { const state = loadState(); state.pendingExtraSpins += Math.max(0,Math.round(count || 0)); saveState(state); }
  function launchOnePendingSpin() {
    const state = loadState();
    if (state.pendingExtraSpins <= 0) return false;
    state.pendingExtraSpins--; saveState(state); setTimeout(() => $('spinBtn')?.click(),220); return true;
  }
  function performAction(action) {
    const resultContext = currentContext === 'result';
    if (action === 'skip') { if (resultContext) restorePreviousSpin(); }
    else if (action === 'swap') forceReplacementSpin();
    else if (action === 'double') queueExtra(resultContext ? 1 : 2);
    else if (action === 'triple') queueExtra(resultContext ? 2 : 3);
  }
  function resolveChoice(action) {
    pendingAction = action;
    $('fateV4ChoiceKeep').disabled = true; $('fateV4ChoiceSwap').disabled = true;
    $('fateV4Status').querySelector('small').textContent = action === 'swap' ? 'Unknown fate chosen. The replacement is final.' : 'Known fate chosen. The current forfeit stays.';
    $('fateV4Continue').hidden = false;
    $('fateV4Continue').textContent = action === 'swap' ? 'Reveal replacement' : 'Accept current result';
  }
  function flipCoin() {
    if (currentDraw !== 'doubleOrNothing' || coinResolved) return;
    coinResolved = true;
    const button = $('fateV4Flip'), coin = $('fateV4Coin'), doubled = Math.random() < .5;
    button.disabled = true; coin.classList.add('flipping');
    setTimeout(() => {
      coin.classList.remove('flipping'); coin.classList.add(doubled ? 'show-double' : 'show-nothing');
      pendingAction = doubled ? 'double' : 'skip';
      $('fateV4CoinResult').textContent = doubled ? (currentContext === 'result' ? 'DOUBLE · KEEP IT + ADD ONE' : 'DOUBLE · TWO FORFEITS') : 'NOTHING · FORFEIT CANCELLED';
      button.hidden = true; $('fateV4Continue').hidden = false; $('fateV4Continue').textContent = doubled ? 'Accept fate' : 'Back to wheel';
    },1500);
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
    setTimeout(() => { const after = M.loadSession(M.loadConfig()); if ((before.spinCount || 0) !== (after.spinCount || 0) || (after.spinCount || 0) === 0) resetDeck(); },90);
  });
  $('fileInput')?.addEventListener('change',() => setTimeout(resetDeck,250));

  ensureOverlay(); ensureTemptButton(); renderDeckPanel();
})();
