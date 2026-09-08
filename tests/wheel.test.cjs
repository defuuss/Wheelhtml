const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function fixture() {
  const config = { forfeits: [], settings: {}, levels: [] };
  const session = { runtime: {}, activeLevels: { start: true }, history: [], undoStack: [] };
  const context = vm.createContext({
    window: { FortuneModel: { loadConfig: () => config, loadSession: () => session } },
    document: { getElementById: () => ({}) },
    confirm: () => { throw Error('Confirmation must not open while spinning'); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/core/features.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(root, 'src/play/app.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('  function modalOpen()')) + `
    window.testGame = { active, makeSegments, choose, arc, motionDistance, spin, reset, undo, loadXml,
      busy(value) { spinning = value; }, pending(value) { pendingResult = value; } };
  })();`, context);
  return { config, session, game: context.window.testGame };
}
test('eligibility and weights preserve repeats, locks, cooldowns and a single-entry wheel', () => {
  const { config, session, game } = fixture();
  config.forfeits = ['a', 'b', 'locked', 'cooldown', 'removed'].map((id, i) => ({ id, enabled: true, levelId: id === 'locked' ? 'locked' : 'start', weight: i + 1, lifetime: { type: 'forever' } }));
  config.forfeits.forEach(x => session.runtime[x.id] = { cooldown: x.id === 'cooldown' ? 2 : 0, removed: x.id === 'removed' });
  session.history.push({ id: 'a' });
  assert.deepEqual(Array.from(game.active(), x => x.id), ['a', 'b']);
  session.runtime.a.weightMultiplier = 2;
  assert.deepEqual(Array.from(game.makeSegments(game.active()), s => s.span), [180, 180]);
  session.runtime.b.removed = true;
  const segments = game.makeSegments(game.active());
  assert.equal(segments[0].span, 360);
  assert.equal(game.choose(segments).item.id, 'a');
  assert.equal((game.arc(300, 300, 286, -90, 270).match(/ A /g) || []).length, 2);
});
test('smooth motion is monotonic, exact at its target, and has continuous velocity at phase boundaries', () => {
  const { game } = fixture();
  for (const profile of [{ up: .7, cruise: .35, down: 3 }, { up: 1.4, cruise: 6, down: 5 }]) {
    const total = profile.up + profile.cruise + profile.down;
    const distance = 2893.25;
    const at = t => game.motionDistance(t, distance, profile);
    assert.equal(at(0), 0); assert.equal(at(total), distance); assert.equal(at(total + 1), distance);
    let previous = 0;
    for (let t = 0; t < total; t += 1 / 120) {
      const current = at(t); assert.ok(current >= previous && current <= distance); previous = current;
    }
    const h = .00001;
    for (const boundary of [profile.up, profile.up + profile.cruise]) {
      const before = (at(boundary) - at(boundary - h)) / h;
      const after = (at(boundary + h) - at(boundary)) / h;
      assert.ok(Math.abs(before - after) < .01);
    }
    assert.ok(at(h) / h < .01);
    assert.ok((distance - at(total - h)) / h < .01);
  }
});
test('spin/reset/undo/import guards protect animation and result handoff', async () => {
  const { game } = fixture();
  for (const set of [game.busy, game.pending]) {
    set(true); game.reset(); game.undo(); await game.spin(); await game.loadXml({}); set(false);
  }
});
test('both entrypoints load unique, existing assets and no removed control code', () => {
  for (const name of ['index.html', 'edit.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"?#]+)[^"]*"/g)].map(m => m[1]);
    assert.equal(new Set(refs).size, refs.length, `Duplicate assets in ${name}`);
    refs.forEach(ref => assert.ok(fs.existsSync(path.join(root, ref)), `${name}: missing ${ref}`));
    assert.ok(!/id="(?:avoidRepeat|quickSpin|muteBtn|oddsBtn)"/.test(html));
  }
});
