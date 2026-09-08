# Fortune Engine

A dependency-free browser wheel with weighted entries, mystery reveals, fate cards,
timers, group progression, cooldowns, XML import/export, session history and undo.

## Run

Open `index.html` in a modern browser. No installation, server or build is needed.
GitHub Pages publishes the repository root.

## Structure

| Location | Responsibility |
| --- | --- |
| `index.html` | Play page and explicit script order |
| `edit.html` | Configuration editor and explicit script order |
| `src/core/` | Configuration, storage, XML, dependencies, progression and spin settings |
| `src/play/` | Selection, animation, results, fate cards and play presentation |
| `src/editor/` | Forms, grouping, dependencies, pictograms and AI editor |
| `styles/` | Shared, play and editor styles |
| `assets/fate-cards/` | Active card artwork |
| `tests/` | Dependency-free Node regression tests |
| `docs/` | Architecture and maintenance notes |

Keep `index.html` and `edit.html` at the root so existing links and browser storage
continue to work. HTML lists each external script once. Scripts are classic scripts,
not modules, so the app still works when opened from a local file. CSS asset paths
are relative to `styles/`; images referenced by JavaScript are relative to the page.

## Controls and saved games

Press **Space** outside a control or dialog to spin. Configure sound, duration and
spin drama in the editor. The former repeat-prevention, quick-spin, mute and odds
shortcuts are removed, including their saved-preference behavior.

**Ctrl+S / Cmd+S** in the editor applies the current configuration and starts a fresh
session, just like **Apply changes**. Export with **Save XML** to transfer a wheel.
The existing configuration and session storage keys and XML format are preserved.

## Validation

Run `node --test tests/wheel.test.cjs`. The tests cover selection eligibility,
weights, one-entry geometry, motion continuity, busy-state guards and page assets.
No browser performance benchmark or visual/end-to-end test has been run.

## Group actions and optional modifiers

Each group in the editor has **Add forfeit** and **Delete group…** buttons, including
empty groups. Deleting a group removes its forfeits after confirmation. References
to the deleted group/results are cleaned; rules depending on deleted results are
removed. Deleting the final group leaves an empty Start group. Deletions are saved
only when **Apply changes** is pressed.

Open a forfeit with **Edit**, then open **Modifier wheel**. Enable it and choose a
trigger percentage (100 means every selection), then add up to 24 named outcomes.
Each outcome has custom instructions, a weight and an optional timer multiplier.
The modifier affects only that selection. Timer values are capped at 60 minutes
before existing fate-card timer effects. Untimed results stay untimed. Players can
keep the original result or use the modifier; the choice appears in session history.
The configuration is saved in XML as an optional `modifierWheel` child per forfeit.
Older files without this element keep modifiers disabled.

The editor now has one owner for group ordering. It sorts on rebuild or **Sort A–Z**,
never on every typed character. Basic view keeps everyday fields visible; event
behavior, presentation and detailed rules remain in Advanced view.

Run `node --test tests/*.test.cjs` for all dependency-free tests. Optional DOM
integration tests (`tests/editor.integration.cjs` and `tests/play.integration.cjs`)
require jsdom in the test environment; `WHEEL_TEST_JSDOM` may point to that module.
They simulate events and persistence, not browser rendering or pointer hit testing.
