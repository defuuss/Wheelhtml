(() => {
  'use strict';
  const rotor = document.getElementById('wheelRotor');
  if (!rotor) return;

  function hideSegmentTooltips() {
    rotor.querySelectorAll('svg title').forEach(title => title.remove());
  }

  new MutationObserver(hideSegmentTooltips).observe(rotor, { childList: true, subtree: true });
  hideSegmentTooltips();
})();
