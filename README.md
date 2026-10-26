# Fortune Engine

A dependency-free browser wheel with weighted entries, mystery reveals, fate cards,
timers, group progression, cooldowns, XML import/export, session history and undo.

## Run

Open `index.html` in a modern browser. No installation, server or build is needed.
GitHub Pages publishes the repository root.

## Generate XML with another AI

Give the AI the [XML authoring guide](docs/XML-AUTHORING-GUIDE.md). It includes a
copyable prompt, supported fields and limits, progression recipes, all Fate card
IDs, artwork requirements, and a validation checklist. Start from the
[complete importable example](docs/examples/ai-starter.xml), then use **Load XML**
to review the generated game in the editor.

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

Open a forfeit with **Edit**, then **Modifier wheel**. Choose **Number**, **Minutes**,
or **True / False**, enable it and set the trigger chance. Number/minute ranges have
From, To and Step controls with a preview (at most 24 outcomes; wider ranges
increase the effective step). Minute results replace the timer, including on
previously untimed forfeits, capped at 60 minutes. Number and binary results are
shown as result instructions. Existing custom weighted wheels remain available
under **Custom outcomes (advanced)**. Players may keep the original result.

**Entry type** is available in Simple view, with a Special forfeits section for
Spin again, Weight modifier and Pick a fate card. Spin again starts another spin
after accepting the result. Weight modifier randomizes active weights for the
session. Pick a fate card draws directly from the current fate deck; an empty deck
shows a message. Legacy event types remain supported.

Groups complete automatically when all enabled members have been permanently
removed. Cooldowns and unmet prerequisites do not count as removal. Empty groups
with no enabled members do not auto-complete. Repeatable members prevent exhaustion;
use **Remove after selected** for one-time forfeits. **Then unlock groups** configures
the next phase. An optional earlier milestone can finish a group after its marked
forfeits have been selected. ALL/ANY unlock rules and per-forfeit direct unlocks
remain available in Simple view. State labels are no longer an editable field;
old data is preserved for compatibility. Progression is based on selection/removal,
not on confirmation that an activity has been performed.

Choose **Edit → Settings → Spin behaviour → Spin mode** to use automatic stopping
or **Spin until Stop is pressed**. The mode is saved in the game configuration and
XML. The main page only has the Spin/Stop button. Reduced motion keeps the wheel
visually still until Stop is pressed.

The editor now has one owner for group ordering. It sorts on rebuild or **Sort A–Z**,
never on every typed character. Basic view keeps everyday fields visible; event
behavior, presentation and detailed rules remain in Advanced view.

Run `node --test tests/*.test.cjs` for all dependency-free tests. Optional DOM
integration tests (`tests/editor.integration.cjs` and `tests/play.integration.cjs`)
require jsdom in the test environment; `WHEEL_TEST_JSDOM` may point to that module.
They simulate events and persistence, not browser rendering or pointer hit testing.

## Deck building and direct reveals

The wheel uses a shuffled order stored with the session. Entry weights still set
selection probability and segment size. Redraws and spins use the same order;
resetting the session creates a new shuffle. Editor grouping is unchanged.

In **Settings → Fate deck**, choose 0–30 copies of every card. Zero excludes a card;
all zeros disable the deck. Quantities are saved with the configuration and XML
(`<fateDeck><card type="devilFive" count="1" /></fateDeck>`). New sessions refill the
configured deck. Existing configurations gain one copy of each new card by default.

- Double/Triple reveal 2/3 total forfeits, retaining the current forfeit when drawn
  from a result. They directly draw the additional results with no wheel animation.
- Rarest Fate replaces the pending result with an eligible forfeit with the lowest effective weight. Ties are
  chosen uniformly. Chaos Weights applies random 0.25–3× multipliers to active
  entries for this session; Undo restores the earlier weights.
- Devil’s Five chooses an eligible active group randomly, then directly reveals up to five different
  eligible forfeits from it with sealed-card suspense before each reveal. Fewer available entries are
  reported instead of duplicating or selecting locked entries.
- Double or Nothing uses a small 50/50 wheel with smooth deceleration.

Direct batches use current eligibility, effective weights, lifetimes, cooldowns,
unlocks, modifiers and history. Only ordinary/unlock forfeits are candidates, so
special event cards do not recursively draw more cards. Each draw updates the
session before the next candidate is chosen. Revealed results include instructions
and optional individual Start/Pause timers. Undo restores a whole batch. Taking a
card still consumes it; undoing forfeits does not replenish that card. Reduced
motion skips the reveal delays and wheel animation.

Additional integration check: `tests/deck.integration.cjs` covers direct cards,
unique/eligible selections, whole-batch undo, keeping the current result, changed
weights, the risk wheel and deck quantities through editor save and XML.

## Automatic results and selection limits

Wheel challenges are final when revealed, after any modifier resolves. There is no
acceptance step. Continue closes the result; timers can start immediately. Direct
card and envelope reveals also commit once revealed. Reloading does not consume
another use. Undo remains available. Existing chapter completion and unlock rules
are unchanged; they still operate on committed selections.

Fate cards are drawn from the deck between challenges. The former pending-result
replacement button is hidden because challenges are already committed. Cards still
work as standalone draws. A previously saved pending result commits on recovery.

## Simplified play and mini-games

The Game menu contains load, export and editing. Mini-games opens a keyboard-accessible
dialog containing Higher or Lower, Dice Duel and Stop the Meter. Arcade points are
saved in this browser, independently of wheel history, timers and chapter progression.
No onboarding screen is shown. Closing a running meter cancels its animation.

The default Fate deck now gives each of its thirteen card types **two** distinct
full-body manga portraits. The newer set includes diverse adult characters,
shiny high-leg swimwear and bolder haircuts, with expressions and poses chosen to
match each outcome. A built-in look is chosen for each draw and remains unchanged
after reload; the editor's **Next look** button previews the alternatives.
The play reveal uses a larger card that fits the entire source image.
Custom uploaded images always take priority; the card back stays concealed.
Artwork is documented in `docs/card-artwork.md`.

One rare **Mini-game Challenge** Fate card is included per default deck. Drawing
it starts one mandatory one-round Higher or Lower, Dice Duel, or Stop the Meter
game. A win earns a saved Luck boost that automatically halves the next timed
challenge; a loss leaves the accepted challenge unchanged. Free-play mini-games
remain in the Arcade menu. On the wheel, **See every wheel outcome** expands a
readable full-name list with each active entry's chance, especially useful on mobile.
The editor groups artwork customization and advanced envelope controls into
collapsible sections for easier everyday editing.

**Remove after selected X times** counts selections of that specific forfeit, from
the wheel or from cards. The historical XML token `lifetime="spins"` and
`lifetimeSpins` number are retained, but now represent selection uses rather than
elapsed wheel rounds. One-time entries remove after the first accepted selection;
repeatable entries intentionally stay. New editor entries default to one-time.
Group completion waits for finite-use marked entries to exhaust their uses too.
Already-consumed uses in an older session are not reconstructed; reset the session
to test the corrected counters from their configured starting values.

Card identities and action controls remain concealed until the reveal finishes.
Direct results use sealed placeholders before each reveal. Reduced motion skips
these delays. `tests/result-lifecycle.integration.cjs` verifies the accepted-result
flow, repeated card/wheel selections, replacement unlock isolation, reloads,
random group selection, suspense gating and spin-mode XML persistence.
