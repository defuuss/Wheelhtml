(() => {
  'use strict';
  const F = window.FortuneFeatures;
  const colors = ['#8359b8', '#d58b35', '#329a9c', '#be557f', '#5d76ba', '#8e974c'];
  window.FortuneModifierWheel = { async resolve(item) {
    const settings = F.normalizeModifier(item.modifierWheel);
    settings.outcomes = F.modifierOutcomes(settings);
    if (!settings.enabled || !settings.outcomes.length || Math.random() * 100 >= settings.chance) return null;
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div'); overlay.className = 'modifier-overlay';
    const dialog = document.createElement('section'); dialog.className = 'modifier-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'modifierTitle');
    const title = document.createElement('h2'); title.id = 'modifierTitle'; title.textContent = 'A twist of fate';
    const subtitle = document.createElement('p'); subtitle.textContent = item.mystery ? 'A modifier for your mystery result' : `A modifier for ${item.name}`;
    const shell = document.createElement('div'); shell.className = 'modifier-wheel-shell';
    const pointer = document.createElement('div'); pointer.className = 'modifier-pointer'; pointer.textContent = '▼'; pointer.setAttribute('aria-hidden', 'true');
    const wheel = document.createElement('div'); wheel.className = 'modifier-wheel'; wheel.setAttribute('aria-hidden', 'true');
    const total = settings.outcomes.reduce((sum, entry) => sum + entry.weight, 0);
    let angle = 0;
    const segments = settings.outcomes.map((entry, index) => { const start = angle; angle += entry.weight / total * 360; return { entry, start, end: angle, color: colors[index % colors.length] }; });
    wheel.style.background = `conic-gradient(${segments.map(s => `${s.color} ${s.start}deg ${s.end}deg`).join(',')})`;
    segments.forEach((segment, index) => {
      const marker = document.createElement('span'); marker.className = 'modifier-number';
      const radians = (segment.start + segment.end) / 2 * Math.PI / 180;
      marker.style.left = `${50 + Math.sin(radians) * 35}%`; marker.style.top = `${50 - Math.cos(radians) * 35}%`; marker.textContent = settings.type === 'custom' ? index + 1 : segment.entry.name; wheel.append(marker);
    });
    shell.append(pointer, wheel);
    const legend = document.createElement('ol'); legend.className = 'modifier-legend';
    segments.forEach(segment => { const row = document.createElement('li'); row.textContent = `${segment.entry.name} · ${(segment.entry.weight / total * 100).toFixed(1)}%`; legend.append(row); });
    legend.hidden = settings.type !== 'custom';
    const result = document.createElement('p'); result.className = 'modifier-result'; result.setAttribute('role', 'status'); result.textContent = 'Spin to reveal the modifier.';
    const controls = document.createElement('div'); controls.className = 'group-actions';
    const spin = document.createElement('button'); spin.type = 'button'; spin.className = 'btn primary'; spin.textContent = 'Spin modifier';
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'btn ghost'; skip.textContent = 'Keep original';
    controls.append(spin, skip); dialog.append(title, subtitle, shell, legend, result, controls); overlay.append(dialog); document.body.append(overlay); spin.focus();
    return new Promise(resolve => {
      let selected = null, spinning = false, finished = false, animation;
      const finish = value => {
        if (finished) return; finished = true; animation?.cancel(); document.removeEventListener('keydown', keys, true); overlay.remove();
        if (previousFocus?.isConnected) previousFocus.focus(); resolve(value);
      };
      const keys = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(null); }
        if (event.key === 'Tab') {
          const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
          if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
          else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
        }
      };
      document.addEventListener('keydown', keys, true);
      skip.onclick = () => finish(null);
      spin.onclick = async () => {
        if (selected) return finish(selected);
        if (spinning) return;
        spinning = true; spin.disabled = true; result.textContent = 'Spinning…';
        const chosen = F.choose(settings.outcomes); const segment = segments.find(s => s.entry === chosen);
        const rotation = 1440 + 360 - (segment.start + segment.end) / 2;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          animation = wheel.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${rotation}deg)` }], { duration: reduced ? 0 : 2400, easing: 'cubic-bezier(.15,.65,.2,1)', fill: 'forwards' });
          await animation.finished;
        } catch (_) { if (finished) return; }
        if (finished) return;
        selected = chosen; spinning = false; spin.disabled = false; spin.textContent = 'Use this modifier';
        result.textContent = `${chosen.name}${chosen.description ? ': ' + chosen.description : ''}${settings.type === 'custom' && item.timerSeconds ? ` · Timer ×${chosen.timerMultiplier}` : ''}`; spin.focus();
      };
    });
  } };
})();
