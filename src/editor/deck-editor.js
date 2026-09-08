(() => {
  const F = window.FortuneFeatures;
  window.FortuneDeckEditor = { mount(settings, changed) {
    document.getElementById('deckSettings')?.remove();
    settings.fateDeck = F.normalizeDeck(settings.fateDeck);
    const panel = document.createElement('section'); panel.id = 'deckSettings'; panel.className = 'editor-card static-card deck-settings';
    const title = document.createElement('h3'); title.textContent = 'Fate deck';
    const note = document.createElement('p'); note.textContent = 'Copies of each card per fresh session. Set 0 to exclude a card. Apply changes to start with the new deck.';
    const list = document.createElement('div'); list.className = 'deck-counts';
    const total = document.createElement('p'); total.className = 'deck-total';
    const update = () => { const count = Object.values(settings.fateDeck).reduce((a,b)=>a+b,0); total.textContent = count ? `${count} cards in the deck` : 'Deck disabled: all quantities are zero.'; };
    Object.entries(F.deckNames).forEach(([id,name]) => {
      const label = document.createElement('label'); label.className = 'field'; label.textContent = name;
      const input = document.createElement('input'); input.type = 'number'; input.min = 0; input.max = 30; input.step = 1; input.value = settings.fateDeck[id]; input.dataset.card = id;
      input.oninput = () => { settings.fateDeck[id] = Math.max(0,Math.min(30,Math.round(Number(input.value)||0))); update(); changed(); };
      label.append(input); list.append(label);
    });
    panel.append(title,note,list,total); document.querySelector('#tab-settings .settings-grid').append(panel); update();
  } };
})();
