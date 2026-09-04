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
- `app.js` — wheel rendering, weighted selection, spin animation and game state
- `editor.js` — editor UI

## XML

Use **Save XML** to export the wheel configuration and **Load XML** to import it on another browser/device. The browser also keeps the current configuration and play session in local storage.
