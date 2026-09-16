# Creating Fortune Engine XML files with an AI

Give this document to an AI together with the game you want to build. It describes
the XML the **current Wheelhtml application actually imports**, including groups,
unlocking, repeat counts, mystery entries, modifiers, Fate cards and artwork.
Verified against the implementation on 2026-09-16 (base commit `18e592a`).

Start from [the complete example](examples/ai-starter.xml), replace its content,
and load the result using **Load XML** in the wheel or editor. In the editor, review
the imported configuration and press **Apply changes**. **Save XML** exports it.
XML contains the game configuration, not a saved session, history or remaining deck.

The example starts with **Opening**. Accepting both keys once opens **Surprises**
early through a rule; exhausting Opening also opens it through completion.
Surprises has five ordinary/unlock entries to demonstrate direct card batches.
Its rare seal can open **Closing** early, and exhausting Surprises also opens it.
Closing uses a required check-in milestone, so its optional repeatable music entry
does not prevent completion. These alternate paths are deliberate examples;
remove the early rule/direct unlock if you want strictly sequential chapters.

## Prompt to give another AI

```text
Create a complete UTF-8 Fortune Engine XML file for the Wheelhtml application.
Follow docs/XML-AUTHORING-GUIDE.md and docs/examples/ai-starter.xml from
https://github.com/defuuss/Wheelhtml exactly. If you cannot access these files,
ask me to attach them; do not invent a schema.

My game brief:
- Theme and language: [fill in]
- Groups and their sequence: [fill in]
- Forfeits/instructions and agreed limits: [fill in]
- One-time or repeatable entries: [fill in]
- Mystery entries, timers and modifier wheels: [fill in]
- Fate card quantities and envelope options: [fill in]
- Automatic stopping or Spin/Stop mode: [fill in]

Use unique stable IDs and valid references. Explicitly specify all 12 Fate card
counts, including zero for unwanted cards. Ensure at least one enabled entry is
available initially, every intended group is reachable, and completion cannot
deadlock. Use finite lifetimes for groups intended to exhaust. Do not invent
variables, custom card types, scripts or event handlers. Leave cardImages empty
unless I provide actual supported image data.

For an adult consensual game, use only the activities and limits supplied in my
brief. Acceptance in the app records a game selection; it does not verify that
an activity was performed or that someone consents to it.

Return the complete XML without omissions or placeholder Base64. Separately
explain the progression, special features, and any request the engine cannot
represent. Check the validation checklist in the guide before delivering.
```

## File structure and conventions

The root is exactly `<fortuneEngine version="1">`. Use no XML namespace, DTD,
external entities, HTML or executable code. XML names and enum values are
case-sensitive. Use decimal points in numbers and lowercase `true` / `false`.

Direct root children are:

| Element | Purpose |
| --- | --- |
| `settings` | Title, spin mode, timing, sound and display |
| `reveals` | Envelope choices, hints, group filter and reveal autoplay |
| `cardImages` | Optional embedded artwork overrides |
| `fateDeck` | Copies of each built-in Fate card |
| `groups` | Group definitions and completion transitions |
| `forfeits` | Wheel entries, prerequisites, modifiers and direct unlocks |
| `rules` | Unlock groups after specified accepted results |

Use this order for readability. The importer locates elements by name. A missing
section usually falls back to defaults; **omitting a Fate card does not disable
it**. Prefer explicit configuration over relying on defaults.

- IDs: use unique ASCII letters, digits, `_` and `-`, such as `opening` or
  `opening-choice`. IDs must be unique within groups, forfeits and rules;
  references use IDs, never names. Do not rely on the importer repairing IDs.
- Colors: six-digit hex, e.g. `#73516d`.
- Icons: short Unicode text or emoji, not an image path or HTML. Group icons are
  limited to 10 JavaScript string units; forfeit icons to 12. One simple emoji is best.
- Escape `&` as `&amp;`, `<` as `&lt;`, and attribute quotes as `&quot;`.
  Descriptions are plain text; line breaks are allowed.
- Stay within **2,000,000 bytes** for the complete file, including images.
- Unsupported fields are generally ignored, invalid references may be removed,
  and numbers/text may be clamped/truncated. Successful parsing alone does not
  prove the intended game survived import.

## Settings

All fields below are attributes of the single root-level `settings` element.

| Attribute | Values / limits | Default when omitted from XML |
| --- | --- | --- |
| `title` | Up to 60 characters | `Fortune Engine` |
| `spinMode` | `auto` or `manual` | `auto` |
| `minSpinSeconds` | 3–20 seconds | 6.5 |
| `maxSpinSeconds` | 3–25 seconds; use at least the minimum | 9.5 |
| `minTurns` | Integer 3–20 | 6 |
| `soundEnabled` | Boolean | `true` |
| `showTextOnWheel` | Boolean | `false` |
| `showProbabilities` | Legacy compatibility flag; no main-page odds toggle | `true` |

`manual` keeps the main wheel spinning until **Stop** is pressed. It does not
change weighted selection into a skill-based stopping game. Wheel positions are
shuffled by the application per session; XML ordering does not group segments.

Optional motion attributes also belong on `settings`. When absent, these usually
retain that browser's saved motion preferences. Values in the last column are
fresh-browser defaults; specify them explicitly for a portable preset.

| Attribute | Values / limits | Fresh default |
| --- | --- | --- |
| `maxTurns` | Integer 3–24; use at least `minTurns` | 9 |
| `spinUpMinSeconds` / `spinUpMaxSeconds` | Minimum 0.1–10; maximum from minimum to 12 | 0.7 / 1.4 |
| `spinDownMinSeconds` / `spinDownMaxSeconds` | Minimum 0.3–20; maximum from minimum to 25 | 3 / 5 |
| `dramaEnabled` | Boolean | `true` |
| `dramaChance` | Integer 0–100 percent | 35 |
| `dramaCreepMinDegrees` / `dramaCreepMaxDegrees` | Minimum 5–160; maximum from minimum to 180 | 30 / 80 |
| `showSlowIcon` | Boolean | `true` |
| `iconPreviewStartPercent` | Integer 10–80 | 35 |

Motion preferences are handled by `FortuneModel.readXmlFile` / the UI import and
`downloadXml` / Save XML. A direct `xmlToConfig` → `configToXml` round trip does
**not** retain these extra motion attributes. Old `dramaExtraMinTurns` /
`dramaExtraMaxTurns` attributes are compatibility inputs; use degrees in new files.

## Groups and completion

Place definitions inside `groups`:

```xml
<group id="opening" name="Opening" icon="✦" color="#73516d"
       activeAtStart="true" completion="empty">
  <onComplete><group ref="next-chapter" /></onComplete>
</group>
```

| Attribute / child | Meaning |
| --- | --- |
| `id` | Stable group ID |
| `name` | Display name, up to 40 characters |
| `icon`, `color` | Presentation |
| `activeAtStart` | Initially unlocked; explicitly activate at least one group |
| `completion="empty"` | Default: complete when every enabled member is permanently removed |
| `completion="required"` | Also allow completion when all enabled, marked members meet their requirements |
| `onComplete/group ref` | Groups to unlock after this group completes |
| `completionLabel` | Legacy label, up to 40 characters; not a programmable variable |

For `required` completion, mark selected forfeits with
`requiredForCompletion="true"`. Marked `once` entries must be accepted once;
marked `spins` entries must exhaust all their uses; marked `forever` entries must
have an accepted occurrence. At least one enabled marked entry is needed for this
early completion path. Full exhaustion still completes either mode.

Completion deactivates the group, including any remaining optional entries.
An empty group does not auto-complete. Disabled members do not count. Cooldowns
and unmet prerequisites do **not** count as permanent removal. A `forever` entry
prevents exhaustion, so avoid it in `empty` groups intended to finish.

If every group has `activeAtStart="false"`, the importer activates the first one.
Do not use this fallback to define the intended starting state.

## Forfeits (wheel entries)

Place entries inside `forfeits`. `group` is the XML name, even though the internal
JavaScript property is `levelId`.

| Attribute | Values / limits | XML default |
| --- | --- | --- |
| `id` | Unique stable forfeit ID | Generated if absent; specify it |
| `name` | Up to 60 characters | `Forfeit` |
| `group` | Existing group ID | First group |
| `icon` / `color` | Short icon / six-digit hex | `🎯` / `#64748b` |
| `weight` | 0.1–100, decimals allowed | 1 |
| `category` | Display label, up to 30 characters | `Challenge` |
| `animation` | `zoom`, `shake`, `pulse`, `flash`, `confetti` | `zoom` |
| `lifetime` | `once`, `spins`, `forever` | `forever` |
| `lifetimeSpins` | Integer 1–999, used for `spins` | 3 |
| `cooldown` | Integer 0–99 accepted-result steps before eligibility returns | 0 |
| `eventType` | See below | `normal` |
| `timerSeconds` | Integer 0–3600; 0 disables timer | 0 |
| `mystery` | Hide identity on wheel until reveal | `false` |
| `enabled` | Include entry in the game | `true` |
| `requiredForCompletion` | Mark a group milestone member | `false` |

Optional child elements are `description` (up to 240 characters), `requires`,
`unlocks` and `modifierWheel`.

**Weights are relative, not percentages.** Among eligible entries with weights
1, 2 and 3, initial probabilities are 1/6, 2/6 and 3/6. Runtime weight modifiers
can change these. Eligibility includes active group, enabled entry, remaining
uses, met prerequisites and cooldown. Use `enabled="false"`, not weight zero,
to disable an entry; zero weight is clamped to 0.1.

`lifetime="spins" lifetimeSpins="3"` means **accept this particular forfeit three
times, then remove it**, not remove it after three wheel spins. Card selections
count too. A cooldown decreases on committed results, including card results.
Avoid leaving every available entry on cooldown with no other way to progress.

### Special entry types

| `eventType` | Current behavior |
| --- | --- |
| `normal` | Ordinary result; may still have unlocks, prerequisites and a modifier |
| `unlock` | Ordinary result with unlock presentation; targets still require `unlocks` |
| `spinAgain` | Starts another wheel spin after accepting/closing the result |
| `randomize` | Changes eligible active weights with random 0.6–1.6× multipliers for the session |
| `cardPick` | After acceptance, draws from the configured Fate deck |
| `goodCard`, `badCard`, `doubleOrNothing` | Legacy wheel entry types; current accepted-result flow routes them to the configured Fate deck. Do not use them to force a particular card |
| `doubleSpin`, `immunity` | Legacy token counters; do not use as substitutes for double reveals or a complete immunity mechanic |

For new games use `normal`, `unlock`, `spinAgain`, `randomize` and `cardPick`.
For a Double or Nothing **card**, configure `fateDeck/card type="doubleOrNothing"`.
Card type IDs are not additional valid `eventType` values.

## Three ways to unlock content

1. **One result unlocks a group:** put `unlocks` inside that forfeit. This fires
   on its accepted selection, even when it has uses remaining.
2. **Several results or repeat counts unlock a group:** use a root-level rule.
3. **Finishing a chapter unlocks the next:** use the group's `onComplete`.

An individual entry can additionally wait for other entries through `requires`:

```xml
<requires mode="all">
  <forfeit ref="first-key" />
  <forfeit ref="second-key" />
</requires>
<unlocks><group ref="next-chapter" /></unlocks>
```

These are children of a `forfeit`, not root-level elements. `requires` accepts
`all` (default) or `any`; each referenced entry must have been accepted at least
once. It does not wait for that entry's lifetime to be exhausted. Both the parent
group and the prerequisite condition must allow an entry before it can appear.

For counted conditions, put the following inside root-level `rules`:

```xml
<rule id="combined-key" name="Two keys twice" mode="all"
      minOccurrences="2" enabled="true">
  <conditions>
    <forfeit ref="first-key" />
    <forfeit ref="second-key" />
  </conditions>
  <unlocks><group ref="next-chapter" /></unlocks>
</rule>
```

`minOccurrences` is an integer 1–99, default 1. With `all`, **each** referenced
entry must reach the threshold. With `any`, at least one must. This is not a
combined total across the listed entries. Rule names allow 60 characters.
The referenced entries need enough available uses to meet the count.

Do not invent `<variables>`, `naked="true"`, expressions or event scripts. A
completion label can be recorded as legacy session metadata, but no generic
variable-condition evaluator exists. Represent “after these preparation steps,
unlock this group” using prerequisites, rules or completion transitions.

## Modifier wheels attached to a forfeit

```xml
<modifierWheel enabled="true" chance="75" type="minutes"
               min="1" max="5" step="1" />
```

Place it inside a forfeit. `enabled` defaults false; `chance` is a 0–100 percent
trigger chance, default 100. Always specify `type`.

| Type | Result |
| --- | --- |
| `number` | Numeric instruction from the range; does not multiply weight or repetitions |
| `minutes` | Replaces the result timer with the chosen minutes, capped at 60 minutes |
| `binary` | Equal-probability True / False instruction; does not set a game variable |
| `custom` | Weighted named outcomes with optional timer multipliers |

Ranges use integer `min` 0–999, `max` 1–999 and `step` 1–999. Specify max ≥ min.
Defaults are 1, 6 and 1. At most 24 outcomes are generated; large ranges increase
the effective step, so the exact maximum might not appear. Minutes clamp to 60.
The player can keep the original rather than apply the optional modifier.

```xml
<modifierWheel enabled="true" chance="100" type="custom">
  <outcome name="Half time" weight="2" timerMultiplier="0.5">Use half the original timer.</outcome>
  <outcome name="Extra time" weight="1" timerMultiplier="1.5">Use a longer timer.</outcome>
</modifierWheel>
```

Custom outcomes: maximum 24; name 60 characters, text 240 characters,
weight 0.1–100 (default 1), timerMultiplier 0.25–4 (default 1). Custom multipliers
affect an existing timer only. They cannot unlock groups, create conditions or
change the main wheel's weight. A minutes modifier can create a timer on an
otherwise untimed entry.

## Fate deck

Use `<fateDeck><card type="..." count="..." /></fateDeck>`. Counts are integers
0–30 per card. Set all 12 explicitly. Zero excludes a card; all zero disables
the deck. A new session refills it. Drawing consumes a copy; undoing forfeits
does not return that card. XML cannot define new card effects.

| Card ID | Default copies if omitted | Effect |
| --- | --- | --- |
| `nothing` | 3 | Leaves the current result unchanged |
| `skip` | 3 | Cancels the pending original result |
| `swap` | 3 | Reveals an eligible replacement for the pending original |
| `doubleForfeit` | 3 | Current result plus one extra; two total when drawn without an original |
| `doubleOrNothing` | 3 | 50/50 small wheel: cancel or double |
| `pickYourPoison` | 1 | Keep known result or choose an unknown replacement |
| `fateRoulette` | 1 | With an original: Keep, Skip, Swap or Double; without one: Nothing, Swap, Double or Triple |
| `tripleTrouble` | 1 | Current result plus two extras; three total without an original |
| `rarest` | 1 | Replaces original with an eligible lowest-effective-weight result; ties random |
| `chaosWeights` | 1 | Random 0.25–3× multipliers for active entries; distinct from the `randomize` entry |
| `devilFive` | 1 | Random eligible group, up to five distinct available results revealed one by one |
| `sealedEnvelopes` | 0 | Choose one concealed result from two or three envelopes |

Direct card candidates are only `normal` / `unlock` entries and must be eligible.
The card does not spin the large wheel again. If too few candidates exist, the
app cannot manufacture the requested count. Devil's Five retains a pending
original when used from a result and adds its group batch; allow five eligible
ordinary entries in a group if you want the full batch. Its batch is chosen when
opened, so later unlocks do not add new slots to an already prepared batch.

Only accepted results apply uses, history, completion and unlocks. A replacement
or skipped original does not apply those effects. Card reveals still need their
result acceptance. There is no Decline button. Pause preserves a batch for later.

### Envelopes and sequential reveals

```xml
<reveals envelopeCount="3" envelopeHint="group" autoplay="false">
  <group id="opening" />
  <group id="next-chapter" />
</reveals>
```

`envelopeCount` is 2 or 3 (default 3). `envelopeHint` is `none` (default), `group`
or `duration`. The child group IDs restrict envelope candidates; they do not
unlock those groups. No child groups means all eligible groups. Use existing
IDs and include a `sealedEnvelopes` deck count greater than zero to enable it.

`autoplay="true"` automatically reveals the next sequential result after the
previous one is accepted; it does not auto-accept. Default false. Only the chosen,
accepted envelope changes the game; its unchosen alternatives do not.

## Optional card artwork

Use `<cardImages />` for built-in defaults. The supported `image` keys are the
12 card IDs above plus `back` for the shared reverse side.

Each override is an `image` element with a `card` attribute and its actual data
URL as text: `data:image/png;base64,...`, `data:image/jpeg;base64,...` or
`data:image/webp;base64,...`. The entire data URL must be at most 120,000 characters
with uninterrupted Base64. External URLs, local paths, SVG and invented Base64
are not supported overrides. Missing or failed artwork falls back to default.

The easiest workflow is **Edit → Game settings → Fate deck → Upload image**, then
**Apply changes → Save XML**. The editor accepts PNG/JPEG/WebP up to 12 MiB and
compresses them to fit. Preserve the exported data verbatim when editing XML.
Use **Use default** to remove an override. Remember the whole-file size limit.

## Validation checklist

Before delivering an AI-generated file:

- Parse it as XML and check the exact root, element names, escaping and UTF-8.
- Verify unique IDs, valid group assignments and every `ref` / envelope group ID.
- Use at least one active group with an enabled, initially eligible entry.
- Trace the path into every intended group. Avoid circular dependencies or keys
  locked inside the group they are supposed to unlock.
- Check lifetimes against required occurrence counts. For `empty` completion,
  give every enabled member a finite lifetime; special entries count too.
- Check each `required` group has appropriate enabled marked members.
- Ensure cooldowns, group filters and direct-card eligibility leave usable choices.
- Explicitly set all 12 deck counts and valid settings/modifier ranges.
- Check description/name limits, image encoding and the 2,000,000-byte file limit.
- Load through the real application's **Load XML**, inspect the editor, apply,
  then Save XML and reload it. Check retained fields, not just parse success.
- Play through acceptance, repeated uses and transitions. Verify replaced
  originals do not unlock anything. Reset the session between different trials.

Developers can validate parsing with the actual core scripts loaded in the same
order as `index.html`: `features.js`, `model.js`, `dependency-model.js`,
`progression-model.js`, `spin-settings.js`. Use `FortuneModel.readXmlFile(file)`
for the full import path, especially motion preferences. `xmlToConfig` and
`configToXml` cover the core configuration plus dependency/progression extensions.
These methods update compatibility sidecars; use an isolated browser/test context.

The source of truth is [model.js](../src/core/model.js),
[features.js](../src/core/features.js),
[dependency-model.js](../src/core/dependency-model.js),
[progression-model.js](../src/core/progression-model.js),
[spin-settings.js](../src/core/spin-settings.js),
[app.js](../src/play/app.js), [fate-deck.js](../src/play/fate-deck.js) and
[batch-reveal.js](../src/play/batch-reveal.js). Update this guide when their XML
contract or behavior changes; do not treat older brainstorming as implemented features.
