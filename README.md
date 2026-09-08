# Fortune Engine

A zero-dependency, browser-only weighted wheel with unlockable groups, cooldowns, lifetimes, mystery entries, animated reveals, AND/OR unlock rules, XML import/export, history and undo.

## Run locally

Open `index.html` in a modern browser. No server or build step is required.

## GitHub Pages

The site is fully static. Publish the repository root with GitHub Pages to host it.

## Files

- `index.html` — play view
- `edit.html` — configuration editor
- `styles.css` — dark responsive UI
- `model.js` — config/session model and XML import/export
- `app-v4.js` — wheel rendering, weighted selection, spin animation and game state
- `editor.js` — editor UI

## XML

Use **Save XML** to export the wheel configuration and **Load XML** to import it on another browser/device. The browser also keeps the current configuration and play session in local storage.

## Play controls

- The game title and next round appear above the wheel.
- **No back-to-back repeats** excludes the last result when another eligible entry exists. It never re-enables locked, removed or cooling-down entries. The displayed wheel and odds use the same filtered pool. With only one eligible entry, it remains playable.
- **Quick spin** uses a two-second animation and skips the fake-stop drama. Normal mode keeps the configured spin timing. System reduced-motion preferences skip the wheel animation.
- **Mute** silences wheel audio; it does not override sound disabled in the editor.
- **Show odds** opens the current weighted probabilities, including mystery placeholders.
- Press **Space** to spin when focus is outside a control and no dialog is open.
- In the editor, **Ctrl+S / Cmd+S** applies changes (and starts a fresh session, just like Apply changes). The header indicates unapplied changes.

Play toggles are saved on this browser separately from the XML configuration. Undo restores the previous session state; reset/import are blocked during an active spin and its result handoff.

## Checks

Run `node --test tests/session-options.test.cjs` for eligibility, weighting, single-entry geometry, preference storage and busy-state regression checks. This project still needs no dependencies or build step to run.
