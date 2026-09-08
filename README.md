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
