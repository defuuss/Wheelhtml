const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function fixture(stored = null) {
  const config = { forfeits: [], settings: {}, levels: [] };
  const session = { runtime: {}, activeLevels: { start: true }, history: [], undoStack: [] };
  const context = vm.createContext({
    window: { FortuneModel: { loadConfig: () => config, loadSession: () => session } },
    localStorage: { getItem: () => stored, setItem: (_, v) => stored = v },
    document: { getElementById: () => ({}) },
    confirm: () => { throw Error('Confirmation must not open while spinning'); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'session-options.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(root, 'app-v4.js'), 'utf8');
  // Expose the actual closure functions without starting the DOM event wiring.
  vm.runInContext(source.slice(0, source.indexOf('  function modalOpen()')) + `
    window.testGame = { active, makeSegments, choose, arc, spin, reset, undo, loadXml,
      options, busy(value) { spinning = value; }, pending(value) { pendingResult = value; } };
  })();`, context);
  return { config, session, game: context.window.testGame, prefs: context.window.FortuneSessionOptions };
}
test('repeat prevention preserves eligibility, weights and a playable single-entry wheel', () => {
  const { config, session, game } = fixture();
  config.forfeits = ['a', 'b', 'locked', 'cooldown', 'removed'].map((id, i) => ({ id, enabled: true, levelId: id === 'locked' ? 'locked' : 'start', weight: i + 1, lifetime: { type: 'forever' } }));
  config.forfeits.forEach(x => session.runtime[x.id] = { cooldown: x.id === 'cooldown' ? 2 : 0, removed: x.id === 'removed' });
  session.history.push({ id: 'a' });
  assert.deepEqual(Array.from(game.active(), x => x.id), ['a', 'b']);
  game.options.avoidRepeat = true;
  assert.deepEqual(Array.from(game.active(), x => x.id), ['b']);
  const segments = game.makeSegments(game.active());
  assert.equal(segments[0].span, 360);
  assert.equal(game.choose(segments).item.id, 'b');
  session.runtime.b.removed = true;
  assert.deepEqual(Array.from(game.active(), x => x.id), ['a']);
  assert.equal((game.arc(300, 300, 286, -90, 270).match(/ A /g) || []).length, 2);
  session.history.pop();
  assert.equal(game.active().length, 1);
});
test('weighted segment spans sum to 360 and use runtime multipliers', () => {
  const { config, session, game } = fixture();
  config.forfeits = ['a', 'b'].map(id => ({ id, enabled: true, levelId: 'start', weight: 1, lifetime: { type: 'forever' } }));
  session.runtime = { a: { cooldown: 0, weightMultiplier: 3 }, b: { cooldown: 0 } };
  const spans = game.makeSegments(game.active()).map(s => s.span);
  assert.deepEqual(Array.from(spans), [270, 90]);
});
test('spin, reset, undo and import are blocked during animation and result handoff', async () => {
  const { game } = fixture();
  for (const set of [game.busy, game.pending]) {
    set(true);
    game.reset(); game.undo(); await game.spin(); await game.loadXml({});
    set(false);
  }
});
test('preferences tolerate corrupt storage and persist explicit booleans', () => {
  assert.equal(Object.keys(fixture('{broken').prefs.load()).length, 0);
  const { prefs } = fixture();
  prefs.save({ avoidRepeat: true, quickSpin: true, muted: false, showOdds: true });
  assert.equal(prefs.load().quickSpin, true);
  assert.equal(prefs.load().muted, false);
  assert.equal(prefs.load().showOdds, true);
});
