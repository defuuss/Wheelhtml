(() => {
  const F = window.FortuneFeatures;
  window.FortuneDeckEditor = { mount(settings, changed, levels) {
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
    const revealTitle=document.createElement('h3'); revealTitle.textContent='Sealed envelopes & reveals';
    settings.reveals=F.normalizeReveals(settings.reveals);
    const revealControls=document.createElement('div'); revealControls.className='deck-counts';
    const select=(key,title,choices)=>{
      const label=document.createElement('label');label.className='field';label.textContent=title;
      const input=document.createElement('select');input.id=key;
      choices.forEach(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);});
      input.value=String(settings.reveals[key]);
      input.onchange=()=>{settings.reveals[key]=key==='envelopeCount'?Number(input.value):input.value;changed();};
      label.append(input);revealControls.append(label);
    };
    select('envelopeCount','Envelopes offered',[['2','Two'],['3','Three']]);
    select('envelopeHint','Hint on the envelope',[['none','No hint'],['group','Group name'],['duration','Base duration range']]);
    const auto=document.createElement('label');auto.className='check-line';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='revealAutoplay';checkbox.checked=settings.reveals.autoplay;
    checkbox.onchange=()=>{settings.reveals.autoplay=checkbox.checked;changed();};
    auto.append(checkbox,document.createTextNode('Automatically reveal next after accepting or declining (never auto-accept)'));
    const groups=document.createElement('fieldset');groups.className='envelope-group-settings';
    const legend=document.createElement('legend');legend.textContent='Envelope groups — none selected means all eligible groups';groups.append(legend);
    (levels || window.FortuneModel.loadConfig().levels).forEach(group=>{
      const label=document.createElement('label');label.className='check-line';
      const input=document.createElement('input');input.type='checkbox';input.value=group.id;input.checked=settings.reveals.envelopeGroups.includes(group.id);
      input.onchange=()=>{settings.reveals.envelopeGroups=[...groups.querySelectorAll('input:checked')].map(x=>x.value);changed();};
      label.append(input,document.createTextNode(group.name));groups.append(label);
    });
    const info=document.createElement('p');info.textContent='Set Sealed Envelopes above to at least 1 copy to include it. Only the chosen, accepted result changes the wheel. Hints describe the base entry before any modifier.';
    panel.append(title,note,list,total,revealTitle,revealControls,auto,groups,info); document.querySelector('#tab-settings .settings-grid').append(panel); update();
  } };
})();
