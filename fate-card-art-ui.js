(() => {
  'use strict';

  if (window.__fortuneFateCardArtUi) return;
  window.__fortuneFateCardArtUi = true;

  const ART_BY_TITLE = new Map([
    ['re-spin', 'respin'],
    ['shorten', 'shorten'],
    ['double time', 'doubleTime'],
    ['chaos spin', 'chaos'],
    ['double or nothing', 'doubleOrNothing']
  ]);

  const ART_BY_INVENTORY = new Map([
    ['re-spin', 'respin'],
    ['shorten', 'shorten'],
    ['chaos next', 'chaos'],
    ['double time', 'doubleTime']
  ]);

  const $ = id => document.getElementById(id);
  let flipTimer = 0;
  let lastTitle = '';

  function artKeyFromTitle() {
    const title = String($('specialCardTitle')?.textContent || '').trim().toLowerCase();
    return ART_BY_TITLE.get(title) || '';
  }

  function ensureVisual() {
    const overlay = $('specialCardOverlay');
    const shell = overlay?.querySelector('.special-card-shell');
    const face = $('specialCardFace');
    const actions = shell?.querySelector('.special-card-actions');
    if (!overlay || !shell || !face || !actions) return null;

    let visual = $('fateCardVisual');
    if (!visual) {
      visual = document.createElement('div');
      visual.id = 'fateCardVisual';
      visual.className = 'fate-card-visual';
      visual.setAttribute('aria-live', 'polite');
      visual.innerHTML = `
        <div class="fate-card-inner">
          <div class="fate-card-side fate-card-back" aria-hidden="true"></div>
          <div class="fate-card-side fate-card-front" aria-hidden="true"></div>
        </div>`;
      shell.insertBefore(visual, face);
      face.classList.add('fate-card-data-source');

      // Keep the existing game logic and element IDs intact, but move the live
      // status/coin controls below the artwork so the generated card can stay clean.
      const coin = $('coinWrap');
      const status = $('specialCardStatus');
      if (coin) shell.insertBefore(coin, actions);
      if (status) shell.insertBefore(status, actions);
    }
    return { overlay, shell, face, visual };
  }

  function revealCurrentCard(force = false) {
    const ui = ensureVisual();
    if (!ui || ui.overlay.hidden) return;
    const key = artKeyFromTitle();
    if (!key) return;

    const title = String($('specialCardTitle')?.textContent || '').trim();
    if (!force && title === lastTitle && ui.visual.dataset.art === key && ui.visual.classList.contains('revealed')) return;
    lastTitle = title;

    clearTimeout(flipTimer);
    ui.visual.dataset.art = key;
    ui.visual.setAttribute('aria-label', title ? `${title} Fate card` : 'Fate card');
    ui.visual.classList.remove('revealed', 'dealing');
    ui.shell.classList.remove('fate-card-revealed');
    void ui.visual.offsetWidth;
    ui.visual.classList.add('dealing');

    flipTimer = window.setTimeout(() => {
      if (ui.overlay.hidden) return;
      ui.visual.classList.add('revealed');
      ui.shell.classList.add('fate-card-revealed');
    }, 430);
  }

  function resetCard() {
    clearTimeout(flipTimer);
    lastTitle = '';
    const visual = $('fateCardVisual');
    visual?.classList.remove('revealed', 'dealing');
    visual?.closest('.special-card-shell')?.classList.remove('fate-card-revealed');
  }

  function decorateInventory() {
    const box = $('gameInventoryItems');
    if (!box) return;
    box.querySelectorAll('.inventory-card').forEach(node => {
      const label = String(node.querySelector('strong')?.textContent || '').trim().toLowerCase();
      const key = ART_BY_INVENTORY.get(label);
      if (key) node.dataset.fateArt = key;
      else delete node.dataset.fateArt;
    });
  }

  function install() {
    const ui = ensureVisual();
    if (!ui) {
      setTimeout(install, 40);
      return;
    }

    const overlayObserver = new MutationObserver(mutations => {
      const hiddenChanged = mutations.some(m => m.type === 'attributes' && m.attributeName === 'hidden');
      if (ui.overlay.hidden) {
        if (hiddenChanged) resetCard();
        return;
      }
      revealCurrentCard(hiddenChanged);
    });
    overlayObserver.observe(ui.overlay, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });

    const inventory = $('gameInventoryItems');
    if (inventory) new MutationObserver(decorateInventory).observe(inventory, { childList: true, subtree: true });
    decorateInventory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
