# Repository review and cleanup

## Findings addressed

- The repository mixed current code with older app, result and presentation implementations. The two HTML entrypoints and their transitive asset references were traced before removal. Git history retains all removed versions.
- Some editor scripts and styles were loaded both by HTML and by dynamically injected tags. The progression loader used `document.write`. Dependencies now appear explicitly once in `edit.html`, and runtime asset loaders have been removed.
- The wheel had a second requestAnimationFrame loop that toggled every wedge's highlight and updated a CSS custom property. A style observer then read computed styles and refreshed lighting. Decoration now runs at render/rest time; explicit start/end events own the spinning state.
- Preview updates and pointer ticks forced synchronous layout through `offsetWidth`. The spin path now uses Web Animations for pointer motion, bounds audio ticks to at most one every 70ms and preview changes to at most one every 120ms, and caches spin settings.
- Rotating SVG drop shadows and live wedge filters increased painting work. The moving surface has a stable transform layer; wedge effects stop changing during rotation.
- Linear acceleration switched abruptly at phase boundaries. The integrated smoothstep velocity curve has continuous acceleration at those boundaries and preserves the preselected final angle and configured phase durations.
- The hub relied on implicit grid placement. Explicit 50% coordinates and an independent -50% translate keep its centre stable when transform-based scaling animations run.
- The removed play preferences no longer load, filter selections, mute sound or alter timings. Sound/timing remain controlled by the existing editor configuration.

## Deliberately retained

The dependency and progression model extensions, existing save keys and XML schema
remain intact. Replacing those wrappers in the same change as the file moves would
increase save-compatibility risk. Used fate artwork, AI editor integration, mystery
reveal and card/progression flows remain in the explicit entrypoint graph.

## Validation limits and next maintenance step

Node regression tests validate the motion math and game guards. Source and asset
checks validate the reorganized paths. Actual frame-rate improvement, hub alignment
across browser layouts, and full fate/mystery/progression interactions still need
browser testing. No measured FPS claim is made.

A future cleanup can replace the remaining model wrappers and presentation
MutationObservers with a shared controller/event API, with saved-game fixtures for
each historical XML format. This is not needed to run the current static app.
