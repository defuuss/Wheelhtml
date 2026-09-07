(() => {
  'use strict';

  if (window.__fortuneFateCardAssetsV1) return;
  window.__fortuneFateCardAssetsV1 = true;

  const BASE = 'assets/fate-cards/';
  const BACK = `${BASE}card-back.png?v=3`;
  const MAP = {
    'card-back': BACK,
    'nothing': `${BASE}nothing_nice_try.png?v=1`,
    'lucky-skip': `${BASE}lucky_skip_emerald_charm_card.png?v=1`,
    'swap-fate': `${BASE}swap_fate_a_playful_choice.png?v=1`,
    'double-forfeit': `${BASE}double_forfeit_devilish_card_challenge.png?v=1`,
    'double-or-nothing': `${BASE}double_or_nothing_midnight_gamble.png?v=1`,
    'pick-your-poison': `${BASE}pick_your_poison_card.png?v=1`,
    'fate-roulette': `${BASE}fate_roulette_neon_casino_hostess.png?v=1`,
    'triple-trouble': `${BASE}triple_trouble_infernal_heart_card.png?v=1`
  };

  function mappedSource(src) {
    const value = String(src || '');
    const match = value.match(/assets\/fate-cards\/([^/?]+)\.webp(?:\?.*)?$/i);
    if (!match) return null;
    return MAP[match[1]] || null;
  }

  function fixImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const replacement = mappedSource(img.getAttribute('src'));
    if (replacement && img.getAttribute('src') !== replacement) {
      img.setAttribute('src', replacement);
    }
    if (!img.dataset.fateFallbackBound) {
      img.dataset.fateFallbackBound = '1';
      img.addEventListener('error', () => {
        if (!img.src.includes('card-back.png')) img.src = BACK;
      });
    }
  }

  function scan(root = document) {
    root.querySelectorAll?.('img').forEach(fixImage);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        fixImage(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node instanceof HTMLImageElement) fixImage(node);
        scan(node);
      });
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  } else {
    scan();
  }
})();
