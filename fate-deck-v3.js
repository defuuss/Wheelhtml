(() => {
  'use strict';

  if (window.__fortuneFateDeckV3) return;
  window.__fortuneFateDeckV3 = true;

  const M = window.FortuneModel;
  const $ = id => document.getElementById(id);
  if (!M) return;

  const STORAGE_KEY = 'fortune-fate-deck-v3';
  const FULL_DECK = [
    'skip','skip','skip',
    'respin','respin',
    'doubleForfeit','doubleForfeit','doubleForfeit',
    'doubleOrNothing','doubleOrNothing','doubleOrNothing','doubleOrNothing'
  ];
  const CARD_META = {
    skip: { name:'Skip', kind:'GOOD CARD', text:'The current forfeit is cancelled.', className:'good' },
    respin: { name:'Re-spin', kind:'GOOD CARD', text:'Reject the current result and spin again. The replacement must be accepted.', className:'good' },
    doubleForfeit: { name:'Double Forfeit', kind:'BAD CARD', text:'The current forfeit stays and one additional forfeit is added.', className:'bad' },
    doubleOrNothing: { name:'Double or Nothing', kind:'RISK CARD', text:'Flip fate. Nothing cancels the current forfeit. Double means two forfeits.', className:'risk' }
  };

  let usedResultKey = '';
  let currentDraw = null;
  let currentContext = null;
  let coinResolved = false;

  function defaultState() {
    return { cards: [...FULL_DECK], pendingExtraSpins: 0 };
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || !Array.isArray(raw.cards)) return defaultState();
      raw.cards = raw.cards.filter(id => CARD_META[id]);
      raw.pendingExtraSpins = Math.max(0, Math.round(Number(raw.pendingExtraSpins) || 0));
      return raw;
    } catch (_) {
      return defaultState();
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    renderDeckPanel();
  }

  function resetDeck() {
    saveState(defaultState());
    usedResultKey = '';
  }

  const originalSaveSession = M.saveSession?.bind(M);
  if (originalSaveSession && !M.__fateDeckV3Wrapped) {
    M.__fateDeckV3Wrapped = true;
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
    panel.className = 'fate-deck-panel';
    panel.innerHTML = `
      <div class="fate-deck-mini" aria-hidden="true"><div class="fate-deck-mini-card"></div><div class="fate-deck-mini-card"></div><div class="fate-deck-mini-card"></div></div>
      <div class="fate-deck-panel-copy">
        <span>FATE DECK</span>
        <strong id="fateDeckCount">12 cards left</strong>
        <small>No history. Draw only after a result — or when the wheel forces it.</small>
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
    const panel = $('fateDeckPanel');
    panel?.classList.toggle('empty', count === 0);
    updateTemptButton();
  }

  function resultKey() {
    try {
      const cfg = M.loadConfig();
      const session = M.loadSession(cfg);
      const last = session.history?.at?.(-1);
      return last ? `${session.spinCount}:${last.id}:${last.time || ''}` : '';
    } catch (_) { return ''; }
  }

  function ensureTemptButton() {
    let button = $('temptFateBtn');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'temptFateBtn';
    button.type = 'button';
    button.className = 'btn fate-tempt-btn large';
    button.innerHTML = '<span>✦</span> Take a Fate Card';
    button.addEventListener('click', () => drawFromResult());
    document.querySelector('#resultOverlay .result-actions')?.appendChild(button);
    return button;
  }

  function updateTemptButton() {
    const button = ensureTemptButton();
    if (!button) return;
    const key = resultKey();
    const cardsLeft = loadState().cards.length;
    const resultVisible = !$('resultOverlay')?.hidden;
    button.hidden = !resultVisible || !key || usedResultKey === key;
    button.disabled = cardsLeft === 0;
    const nextHtml = cardsLeft
      ? `<span>✦</span> Take a Fate Card <small>${cardsLeft} left</small>`
      : '<span>✦</span> Fate Deck Empty';
    if (button.innerHTML !== nextHtml) button.innerHTML = nextHtml;
    const accept = $('resultCloseBtn');
    if (accept && resultVisible && accept.textContent !== 'Accept') accept.textContent = 'Accept';
  }

  function takeCard() {
    const state = loadState();
    if (!state.cards.length) return null;
    const index = Math.floor(Math.random() * state.cards.length);
    const id = state.cards[index];
    state.cards.splice(index, 1);
    saveState(state);
    return id;
  }

  function ensureOverlay() {
    let overlay = $('fateDeckOverlayV3');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fateDeckOverlayV3';
    overlay.className = 'fate-v3-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="fate-v3-backdrop"></div>
      <section class="fate-v3-shell" role="dialog" aria-modal="true" aria-labelledby="fateV3Title">
        <div id="fateV3Card" class="fate-v3-card" data-art="skip">
          <div class="fate-v3-card-inner">
            <div class="fate-v3-side fate-v3-back"></div>
            <div class="fate-v3-side fate-v3-front"></div>
          </div>
        </div>
        <div id="fateV3Status" class="fate-v3-status"></div>
        <div id="fateV3CoinArea" class="fate-v3-coin-area" hidden>
          <div class="fate-v3-coin-stage">
            <div id="fateV3Coin" class="fate-v3-coin">
              <div class="fate-v3-coin-face fate-v3-coin-nothing"><span>✦</span><strong>NOTHING</strong></div>
              <div class="fate-v3-coin-face fate-v3-coin-double"><span>×2</span><strong>DOUBLE</strong></div>
            </div>
          </div>
          <div id="fateV3CoinResult" class="fate-v3-coin-result">50 / 50</div>
          <button id="fateV3Flip" class="btn fate-v3-risk-btn large" type="button">Flip the coin</button>
        </div>
        <div class="fate-v3-actions">
          <button id="fateV3Continue" class="btn primary large" type="button">Continue</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    $('fateV3Continue').addEventListener('click', finishCard);
    $('fateV3Flip').addEventListener('click', flipCoin);
    return overlay;
  }

  function showCard(id, context) {
    const overlay = ensureOverlay();
    currentDraw = id;
    currentContext = context;
    coinResolved = false;
    const meta = CARD_META[id];
    const card = $('fateV3Card');
    card.dataset.art = id;
    card.classList.remove('revealed', 'dealing');
    void card.offsetWidth;
    card.classList.add('dealing');
    $('fateV3Status').innerHTML = `<span>${meta.kind}</span><strong id="fateV3Title">${meta.name}</strong><small>${meta.text}</small>`;
    $('fateV3CoinArea').hidden = id !== 'doubleOrNothing';
    $('fateV3Continue').hidden = id === 'doubleOrNothing';
    $('fateV3Flip').hidden = false;
    $('fateV3Flip').disabled = false;
    $('fateV3CoinResult').textContent = '50 / 50';
    $('fateV3Coin').className = 'fate-v3-coin';
    overlay.hidden = false;
    setTimeout(() => card.classList.add('revealed'), 430);
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
    showCard(id, 'result');
  }

  function drawFromWheel() {
    const id = takeCard();
    closeOldCardOverlay();
    if (!id) return;
    showCard(id, 'wheel');
  }

  function closeOldCardOverlay() {
    const old = $('specialCardOverlay');
    if (old) old.hidden = true;
  }

  function restorePreviousSpin() {
    const result = $('resultOverlay');
    if (result && !result.hidden) {
      result.classList.remove('show');
      result.hidden = true;
    }
    const undo = $('undoBtn');
    if (undo && !undo.disabled) undo.click();
  }

  function queueExtra(count) {
    const state = loadState();
    state.pendingExtraSpins += Math.max(0, Math.round(count || 0));
    saveState(state);
  }

  function launchOnePendingSpin() {
    const state = loadState();
    if (state.pendingExtraSpins <= 0) return false;
    state.pendingExtraSpins--;
    saveState(state);
    setTimeout(() => $('spinBtn')?.click(), 180);
    return true;
  }

  function applyImmediateCard() {
    if (!currentDraw || currentDraw === 'doubleOrNothing') return;
    if (currentDraw === 'skip') {
      if (currentContext === 'result') restorePreviousSpin();
    } else if (currentDraw === 'respin') {
      if (currentContext === 'result') restorePreviousSpin();
      setTimeout(() => $('spinBtn')?.click(), 180);
    } else if (currentDraw === 'doubleForfeit') {
      if (currentContext === 'result') queueExtra(1);
      else queueExtra(2);
    }
  }

  function finishCard() {
    const overlay = $('fateDeckOverlayV3');
    if (!overlay) return;
    if (currentDraw !== 'doubleOrNothing') applyImmediateCard();
    overlay.hidden = true;

    const draw = currentDraw;
    const context = currentContext;
    currentDraw = null;
    currentContext = null;

    if (draw === 'skip') {
      if (context === 'wheel') renderDeckPanel();
      return;
    }
    if (draw === 'respin') return;
    if (context === 'wheel' && loadState().pendingExtraSpins > 0) launchOnePendingSpin();
    updateTemptButton();
  }

  function flipCoin() {
    if (currentDraw !== 'doubleOrNothing' || coinResolved) return;
    coinResolved = true;
    const button = $('fateV3Flip');
    const coin = $('fateV3Coin');
    button.disabled = true;
    coin.classList.add('flipping');
    const doubled = Math.random() < .5;
    setTimeout(() => {
      coin.classList.remove('flipping');
      coin.classList.add(doubled ? 'show-double' : 'show-nothing');
      if (doubled) {
        $('fateV3CoinResult').textContent = currentContext === 'result'
          ? 'DOUBLE · current forfeit + one more'
          : 'DOUBLE · two forfeits';
        queueExtra(currentContext === 'result' ? 1 : 2);
      } else {
        $('fateV3CoinResult').textContent = 'NOTHING · no forfeit';
        if (currentContext === 'result') restorePreviousSpin();
      }
      button.hidden = true;
      $('fateV3Continue').hidden = false;
      $('fateV3Continue').textContent = doubled ? 'Continue' : 'Back to wheel';
    }, 1150);
  }

  // Watch only the overlay's hidden attribute. The previous subtree observer also
  // watched the Fate button that it updated itself, causing an endless MutationObserver
  // feedback loop that starved the browser event loop after the wheel stopped.
  const resultOverlay = $('resultOverlay');
  if (resultOverlay) {
    new MutationObserver(() => {
      if (!resultOverlay.hidden) requestAnimationFrame(updateTemptButton);
    }).observe(resultOverlay, { attributes:true, attributeFilter:['hidden'] });
  }

  const oldCardOverlay = $('specialCardOverlay');
  if (oldCardOverlay) {
    new MutationObserver(() => {
      if (!oldCardOverlay.hidden && $('fateDeckOverlayV3')?.hidden !== false) {
        setTimeout(drawFromWheel, 0);
      }
    }).observe(oldCardOverlay, { attributes:true, attributeFilter:['hidden'] });
  }

  $('resultCloseBtn')?.addEventListener('click', () => {
    setTimeout(() => {
      if ($('fateDeckOverlayV3')?.hidden === false) return;
      launchOnePendingSpin();
    }, 80);
  });

  $('resetBtn')?.addEventListener('click', () => {
    const before = M.loadSession(M.loadConfig());
    setTimeout(() => {
      const after = M.loadSession(M.loadConfig());
      if ((before.spinCount || 0) !== (after.spinCount || 0) || (after.spinCount || 0) === 0) resetDeck();
    }, 80);
  });
  $('fileInput')?.addEventListener('change', () => setTimeout(resetDeck, 250));

  ensureOverlay();
  ensureTemptButton();
  renderDeckPanel();
})();