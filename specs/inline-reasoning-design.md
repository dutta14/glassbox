# Glassbox — Inline Reasoning Revision

This is a delta on `glassbox-design.md`. It does not replace it. Every token,
type value, colour, easing, and confidence tier from that spec still holds.
The only thing changing is where the reasoning lives and how the layout
reflows now that the right pane is gone.

---

## 1. Layout

### From three panes to two

```
┌──────────────┬─────────────────────────────────────────────────┐
│              │                                                 │
│  NOTES RAIL  │              CENTER STAGE                       │
│  260px       │              flex: 1                            │
│              │                                                 │
│              │   Chat column is a fixed reading measure,       │
│              │   centred inside the stage. The stage itself    │
│              │   fills the remaining viewport width.           │
│              │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

### The chat column

The stage fills all remaining horizontal space. The chat log inside it does
not. It sits inside a centred column so the measure stays readable.

```css
:root {
  /* NEW */
  --chat-column: 46rem;      /* 736px, ~68ch at var(--text-md) */
  --chat-gutter: var(--space-8);
}

.chat__log,
.composer {
  width: min(var(--chat-column), 100% - 2 * var(--chat-gutter));
  margin-inline: auto;
}
```

Rationale. At `var(--text-md)` (15px) with the default font stack, 46rem
lands at roughly 68 characters per line. That is inside the 45–75 character
window committed to in section 4 of the original spec. Going wider destroys
scannability of the quoted passages, which is the whole point.

The user question bubble is still right-aligned inside this column. The
assistant message still left-aligned. Do not widen the assistant column
"because there is now space." The space is intentional whitespace.

### The stage tabs and notes rail

Both stay. No change to `Chat / Editor` tab strip. No change to the notes
rail width, list interactions, or search. Removing the right pane does not
promote the tabs to anything else.

The one small change: the tab strip and composer are now centred to the chat
column, so their inner content aligns with the messages. The tab strip
background still spans the full stage width, only its content is centred:

```css
.stage__tabs {
  /* strip spans the stage */
}
.stage__tabs-inner {
  width: min(var(--chat-column), 100% - 2 * var(--chat-gutter));
  margin-inline: auto;
  display: flex;
  gap: var(--space-1);
}
```

### New breakpoints

The old spec had a 1100px minimum for three-pane and a 992px collapse point.
Both are gone. Two-pane fits comfortably below 900px.

| Width | Behaviour |
|---|---|
| ≥ 900px | Notes rail 260px + stage. Chat column 46rem, centred. |
| 720 – 899px | Notes rail 240px + stage. Chat column narrows to `min(100% - 2 * var(--space-6), 44rem)`. |
| 560 – 719px | Notes rail collapses to a 56px icons-only strip (as in the old 768–991px behaviour). Chat column fills the stage minus `var(--space-4)` gutters on each side. |
| < 560px | Same single-column tab-bar mobile layout from the original spec, minus the `Glass` tab. Two tabs only: `Notes`, `Chat`. Editor still swaps in via the Chat/Editor tab strip inside the Chat view. |

Delete the `Glass` mobile tab. Its badge dot logic is dead.

---

## 2. The Collapsed Summary Row

This is the whole design. Get this right and the feature works. Get it wrong
and users will treat it as chrome and never open it.

### Anatomy

```
┌────────────────────────────────────────────────────────────────┐
│ ▸  ● High confidence  ·  from Q3 planning  ·  3 of 142 passages│
└────────────────────────────────────────────────────────────────┘
   ↑  ↑                    ↑                    ↑
   |  confidence dot       source note          candidates
   chevron (rotates on expand)
```

The row sits directly beneath the quoted passage, inside the assistant
message, indented to align with the quote's left edge.

### Content and word order

Fixed sequence, left to right:

1. **Chevron** (affordance)
2. **Confidence dot** (visual tier signal)
3. **Confidence label** (text, non-colour tier signal — see WCAG note below)
4. Middle-dot separator `·`
5. **Source phrase**: `from {noteTitle}` (or refusal copy)
6. Middle-dot separator `·`
7. **Passage count**: `{shown} of {considered} passages`

### The four copy variants

Confidence has three tiers. Refusal is a fourth state and needs its own
copy, not a low-tier variant.

| State | Dot | Copy |
|---|---|---|
| High | filled, `--conf-high` | `High confidence · from {noteTitle} · {n} of {m} passages` |
| Medium | filled, `--conf-med` | `Medium confidence · from {noteTitle} · {n} of {m} passages` |
| Low | filled, `--conf-low` | `Low confidence · from {noteTitle} · {n} of {m} passages` |
| Refused | outline ring, `--text-tertiary` | `No match · nothing in your notes covered this · {m} passages searched` |

Rules for the copy:
- Passage count uses the real numbers. `n` is `answer.trace.results.length`
  (typically 3), `m` is `answer.trace.candidatesConsidered`.
- If only one passage was ranked, say `1 of {m} passages`, not `1 passage`.
- If `m` is 0 (empty corpus), the refusal reads
  `No match · you have no notes yet`.
- Truncate `noteTitle` at 32 characters with an ellipsis. The full title is
  still readable when the row is expanded.

No em-dashes. No "not X, but Y". Read every string aloud.

### The non-colour signal (WCAG 1.4.1)

The confidence label carries the tier in plain English: `High confidence`,
`Medium confidence`, `Low confidence`, `No match`. The dot reinforces it.
Users who cannot perceive the dot colour still read the tier from the label.
This satisfies 1.4.1 the same way the original inline confidence indicator
did in section 6 of the spec.

The refusal state uses a **different shape** as well: a 1px outline ring
instead of a filled dot. That is a second non-colour signal, so a user
scanning without reading still sees "this one is different."

```css
.reason__summary .conf__dot {
  /* filled dot for high/med/low, tokens as in original spec */
}
.reason__summary[data-state="refused"] .conf__dot {
  background: transparent;
  border: 1.5px solid var(--text-tertiary);
}
```

### Typography

Every text piece in the row uses the same size and weight. No hierarchy
inside the row. The row itself is subordinate to the quote above it.

| Element | Token |
|---|---|
| Font size | `var(--text-xs)` (12px) |
| Weight | `var(--weight-medium)` (500) |
| Colour, confidence label | `var(--text-secondary)` |
| Colour, `from`, `·`, count text | `var(--text-tertiary)` |
| Colour, note title | `var(--text-secondary)` |
| Letter-spacing | `0`; the row is prose, not chrome. Do not uppercase. |
| Numerals | `font-variant-numeric: tabular-nums` on the count |

The confidence label is NOT tinted with the tier colour. The dot carries
that already. Tinting the text as well doubles the colour signal for
sighted users and starts to feel loud when three of these stack in the
scroll. Reserve tier colour for the dot and for the score number in the
expanded candidate list.

### The chevron

On the left, not the right. Left because English reading order runs
left-to-right and the chevron sets the semantic frame for the row: "this is
a disclosure, and here is its label."

- Size: 12px square, `stroke-width: 1.5`, current colour `var(--text-tertiary)`.
- Points right when collapsed. Rotates 90° clockwise on expand.
- Visually part of the button hit-target. Do not float it separately.

### Row layout, dimensions, and relationship to the quote

```css
.reason {
  margin-top: var(--space-2);   /* small gap under the quote */
}

.reason__summary {
  display: inline-flex;         /* NOT full-width */
  align-items: center;
  gap: var(--space-2);
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  padding-inline-start: var(--space-1);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background-color var(--dur-instant) var(--ease-out),
    border-color var(--dur-instant) var(--ease-out);
}
```

Key choices:
- **Inline-flex, not block.** The row hugs its content. A full-width row
  would compete with the quote for visual weight. Hugging content puts it
  in its place: a footnote, not a card.
- **No background, no border by default.** It reads as a link-like
  affordance. Hover and focus add chrome.
- **28px min-height.** Above the 24px minimum click target for a
  low-priority inline control and gives the chevron room to breathe.
  For mobile, bump to 40px min-height (see states section).
- **Padding is deliberately tight** so the row does not feel like a card.
  It is a caption.

The gap between the quote and the summary is `var(--space-2)` (8px). Small
on purpose. The reasoning belongs to the quote above it. A large gap would
suggest they are peers.

Do not add a rule, divider, or shadow above or below the row. The
whitespace does the separation work.

---

## 3. The Expanded State

When expanded, the summary row stays visible (chevron now rotated), and a
content region appears beneath it.

### What earns its place

The old right panel had five sections. Not all survive.

| Original section | Keep, cut, or compress |
|---|---|
| Intent | Keep. One line, top of expanded block. |
| Confidence dot + score number | Cut. Already in the summary row. Do not repeat. |
| Query terms | Keep. Chips wrap. |
| Chunks considered count | Compress. Merged into the summary row copy (`{n} of {m} passages`). Remove as a labelled `<dl>` row. |
| Ranked candidates list | Keep. This is the goods. |
| Reason string | Keep. Below the list. |

The chunks-considered number moved into the collapsed row on purpose. That
piece of information is the strongest honesty signal we have ("I looked at
142 things and only 3 were close"), and it belongs in the glanceable
summary, not two clicks deep.

### Layout of the expanded block

```
┌────────────────────────────────────────────────────────┐
│  Intent   search                                       │
│  Terms    [ decide → decid ]  [ hiring → hire ]        │
│                                                        │
│  Ranked passages                                       │
│  ─────────────────────────────────────────────────────  │
│  #1  0.42  ▓▓▓▓▓▓▓░  Q3 planning            83% match │
│      We are going to hold the L5 backfill until Q4… │
│                                                        │
│  #2  0.31  ▓▓▓▓▓░░░  1:1 with Priya          51% match │
│      Priya asked about the hiring bar…                 │
│                                                        │
│  #3  0.19  ▓▓▓░░░░░  Interview loop notes    34% match │
│      Onsite feedback for last Friday…                  │
│                                                        │
│  Why this ranking                                      │
│  Term "hire" appears in three notes. Q3 planning has   │
│  the tightest cluster of matched terms in one passage. │
└────────────────────────────────────────────────────────┘
```

### CSS scaffolding

```css
.reason__panel {
  margin-top: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
```

The expanded panel gets a card because it now has to stand on its own on
the page. The collapsed row leaned on the quote above it, but the expanded
content is a block of structured data and needs a clear boundary.

Surface is `--surface-1`, one level up from the canvas. Same as the old
right pane. This preserves the "instrument panel" mental model.

### Intent and Terms rows

Two-column mini-grid, not the old `<dl>`. The dl had 100px labels which
looks heavy inline.

```css
.reason__panel-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--space-4);
  row-gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.reason__panel-meta dt {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-top: 2px; /* baseline nudge to align with chip */
}
.reason__panel-meta dd {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
}
```

The intent value is the same `.pill` component. The terms use the same
`.term` chip component. Both survive from the original spec unchanged.

If there are no terms after stopword removal, the terms row copy is:
`None after removing common words.` (`--text-xs`, `--text-tertiary`,
italic off.) This copy exists today; keep it.

### The reason string

Below the ranked list, separated by a 1px `--border-subtle` divider and
`var(--space-4)` padding.

```
Why this ranking
{reason string, plain English, one to two sentences}
```

- Label: `var(--text-xs)`, `var(--weight-semibold)`, `--text-tertiary`,
  uppercase, letter-spacing 0.04em.
- Body: `var(--text-sm)`, `--text-secondary`, `--leading-normal`.

The old spec labelled this row `Reason`. Rewriting to `Why this ranking`
because at inline width the label sits alongside prose and needs to read
as a sub-heading, not a form field.

### What if there are no ranked results (refusal)

The panel still expands. It shows:

- Intent row.
- Terms row.
- No "Ranked passages" section (do not render an empty list).
- A single explanatory block:
  `Why nothing matched — {reason string}`.

The refusal is honest work. Do not hide the trace just because there are no
hits.

---

## 4. Ranked Candidate Rows

The original component (`CandidateRow.tsx`) survives, but three details
change now that the score bar is expected in-band.

### Score visualisation, rescaled

Scores in practice range from about 0.1 to 0.5. A raw bar filled to
`score * 100%` looks like every result is broken. The bar has to be
rescaled to the real distribution.

Approach: **relative scaling to the top candidate in the current answer.**

```ts
const topScore = results[0]?.score ?? 1;
const fill = Math.max(0.08, Math.min(1, score / topScore));
```

- The best candidate is always fully filled.
- Every other candidate is a proportion of the best, so the visual gap
  matches the numeric gap.
- Minimum 8% fill so a very weak candidate is still a visible sliver, not
  an invisible line. Below 8% it looks broken.

Do not scale against a global maximum like 0.5. The score distribution
depends on the corpus and shifts every session. Relative-to-best is
honest, always fills the visible range, and preserves the ranking's
"how much better is #1 than #2" answer.

### Bar visuals

- Width: 64px.
- Height: 4px.
- Track: `var(--surface-3)`, radius `var(--radius-sm)`.
- Fill: tier colour (`--conf-high` / `--conf-med` / `--conf-low`), radius
  `var(--radius-sm)`.
- Position: between the score number and the source title in the head row.

```css
.candidate__bar {
  width: 64px;
  height: 4px;
  background: var(--surface-3);
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  overflow: hidden;
}
.candidate__bar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width var(--dur-state) var(--ease-out);
}
```

`transition: width` is safe here because these bars only re-render when a
new assistant message arrives; they never animate during scroll or hover.

The tier colour on the bar duplicates the tier colour on the score number,
which is intentional and cheap. It gives shape-based readers a length cue
in addition to the numeric one. Users who cannot perceive tier colour still
read the numeric score in tabular numerals; the length shows the relative
ranking.

### Coverage as a percentage

The original spec showed coverage as an implicit fraction next to the
score. Move it to the right end of the head row and format as a percentage,
rounded to nearest whole number: `83% match`. Percentages read faster than
fractions inline.

```css
.candidate__coverage {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
```

If coverage is not available on the candidate object, drop the cell. Do
not render a placeholder.

### Head row order

```
#{rank}  {score}  {bar}  {noteTitle, ellipsis, link colour}  {coverage}
```

Widths: rank 24px, score `min-content` (about 32px, tabular), bar 64px,
title `1fr`, coverage `min-content`. Gap `var(--space-3)` between cells.

### Selected row

`.candidate--selected` still gets `background: var(--accent-100)` and the
inset 2px `--accent-500` left indicator. The candidate corresponding to
the quoted passage is always selected. This does not change.

---

## 5. States

For the whole `.reason` disclosure (summary row + panel):

| State | Treatment |
|---|---|
| **collapsed, default** | Summary row: transparent background, transparent border, chevron points right. |
| **hover** | Summary row background `var(--surface-2)`, border `var(--border-subtle)`. Chevron colour lifts to `var(--text-secondary)`. Confidence label lifts to `var(--text-primary)`. Duration `var(--dur-instant)` (100ms). No hover on touch (`@media (hover: hover)`). |
| **focus-visible** | `outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-md);` on the summary row button. Uses the existing focus token from `tokens.css`. |
| **active (mouse down)** | Summary row background `var(--surface-3)`. Same duration. |
| **expanded** | Chevron rotates to point down (90° clockwise). Summary row stays visible with the same hover/focus rules. Panel appears below (see motion). |
| **refusal variant** | `data-state="refused"` on the summary row. Dot switches to outline ring. Copy switches. Confidence label reads `No match`. Panel, if expanded, hides the "Ranked passages" section and shows only intent, terms, and the "Why nothing matched" reason. |
| **touch** | On viewports below 560px, summary row `min-height: 40px`, chevron 16px. Hit area stays 44px effective via padding. |

The `.candidate__button` inside the expanded panel keeps its existing
hover, focus, and selected states. No change.

---

## 6. Motion

### The height-animation trap

Animating `height: 0` → `height: auto` does not work. Animating to a
hardcoded pixel value gets stale the moment content changes. The correct
technique is the CSS grid trick.

```css
.reason__panel-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-state) var(--ease-in-out);
}
.reason[aria-expanded="true"] .reason__panel-wrap {
  grid-template-rows: 1fr;
}
.reason__panel-wrap > .reason__panel {
  overflow: hidden;
  min-height: 0;
}
```

The grid track goes from `0fr` to `1fr`, which is animatable, and the
child's intrinsic content height defines what `1fr` resolves to. No
JavaScript measurement, no hardcoded height, no jank when content changes.

### Timings

| Property | Duration | Easing |
|---|---|---|
| `grid-template-rows` (panel open/close) | `var(--dur-state)` (220ms) | `var(--ease-in-out)` |
| Panel opacity | `var(--dur-state)` (220ms) | `var(--ease-out)` when opening, `var(--ease-in)` when closing |
| Chevron `transform: rotate` | `var(--dur-micro)` (150ms) | `var(--ease-out)` |
| Summary row hover chrome | `var(--dur-instant)` (100ms) | `var(--ease-out)` |

Opacity should crossfade slightly ahead of height on open so the content
appears to fade in as the space appears. On close, opacity leads out so
the space collapses onto empty pixels rather than shrinking visible text.

```css
.reason__panel { opacity: 0; transition: opacity var(--dur-state) var(--ease-in); }
.reason[aria-expanded="true"] .reason__panel {
  opacity: 1;
  transition: opacity var(--dur-state) var(--ease-out);
  transition-delay: 60ms; /* start after the grid begins expanding */
}
```

### Reduced motion

Wrap the grid transition in a `no-preference` media query. Reduced-motion
users get an instant open, with a short opacity crossfade so the state
change is still perceptible.

```css
@media (prefers-reduced-motion: no-preference) {
  .reason__panel-wrap {
    transition: grid-template-rows var(--dur-state) var(--ease-in-out);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reason__panel-wrap { transition: none; }
  .reason__panel { transition: opacity 150ms linear; }
  .reason .chevron { transition: none; }
}
```

The global `prefers-reduced-motion` override from `tokens.css` already
zeroes transition durations, so the `reduce` block above re-establishes
the safe opacity crossfade at 150ms. Same pattern the original spec used
for the glass box collapse.

---

## 7. Accessibility

### The disclosure pattern

**Use a `<button>` with `aria-expanded` and `aria-controls`.** Do not use
`<details>` / `<summary>`.

Why:
- `<details>` gives browsers full control over the open/close, including
  the height animation. It fights the grid-rows animation.
- `<details>` announcements vary widely across screen readers (some say
  "expandable group," some say nothing on state change).
- We already need custom keyboard behaviour (Escape collapses, see below)
  which `<details>` cannot deliver without JS anyway.
- A button with `aria-expanded` is announced consistently: NVDA and JAWS
  say "expanded" / "collapsed"; VoiceOver says "expanded" / "collapsed"
  on the same element on state change.

Markup:

```html
<div class="reason" data-state="high">        <!-- container -->
  <button
    type="button"
    class="reason__summary"
    aria-expanded="false"
    aria-controls="msg-a1-reasoning"
  >
    <svg class="chevron" aria-hidden="true">…</svg>
    <span class="conf__dot" aria-hidden="true"></span>
    <span class="conf__label">High confidence</span>
    <span class="reason__sep" aria-hidden="true">·</span>
    <span class="reason__source">from Q3 planning</span>
    <span class="reason__sep" aria-hidden="true">·</span>
    <span class="reason__count">3 of 142 passages</span>
  </button>

  <div class="reason__panel-wrap">
    <div
      class="reason__panel"
      id="msg-a1-reasoning"
      role="region"
      aria-label="Reasoning for this answer"
      aria-live="off"
      hidden
    >
      …intent, terms, ranked passages, why this ranking…
    </div>
  </div>
</div>
```

`hidden` is toggled in sync with `aria-expanded`. When expanded, remove
`hidden` before the animation starts so the content is measurable and
announceable. When collapsing, remove `hidden` on `transitionend`.

Do not put an accessible name on the button using `aria-label` or
`aria-describedby`. The visible text inside already reads as a full
sentence: "High confidence, from Q3 planning, 3 of 142 passages." That is
the accessible name, and it is exactly what a screen reader user needs
before deciding whether to expand.

### The live region question, this is load-bearing

The chat log is `<ol role="log" aria-live="polite">`. Everything inside it
that changes will be announced. If the reasoning panel sits inside the log
and starts hidden, then unhides on expand, screen readers will read the
entire reasoning dump on expand. Worse, on a fresh assistant message they
will read the summary row PLUS the panel if the panel renders in the same
frame.

**Decision: the reasoning panel is inside the log DOM but outside the live
region announcement.** Set `aria-live="off"` explicitly on
`.reason__panel`, and keep the panel `hidden` on initial render for new
messages. The `aria-live="off"` overrides the inherited `polite` from the
`<ol>`.

For a new assistant message, the announced content is exactly what the
original spec specified: the confidence tier, the source note, and the
passage. The collapsed summary row's text is announced as part of that
message body, which is fine — it is 12 words and gives the user useful
context.

For the expand action, the button's own `aria-expanded` toggling to `true`
is announced by screen readers automatically ("expanded"). The user then
navigates into the panel by continuing to Tab or using the screen reader's
region navigation, because we labelled the panel with
`role="region" aria-label="Reasoning for this answer"`.

For the collapse action, `aria-expanded` toggles to `false` ("collapsed").
Focus stays on the summary button.

**We do not fire any custom live-region announcement on expand.** The
built-in `aria-expanded` announcement is enough. Adding a redundant
"Reasoning shown" announcement doubles the audio work for zero information.

### Keyboard

- `Tab` reaches the summary row after the message's `Open note` button
  (which stays where it is in the original spec, right after the quote).
- `Enter` or `Space` toggles the disclosure.
- `Escape`, when focus is inside `.reason__panel`, collapses and returns
  focus to `.reason__summary`.
- All standard focus-visible ring behaviour from the original spec applies.

### Contrast

Every text token, dot colour, and surface colour reused here is the same
one that was already validated in the original spec's section 9. The one
new element is `.reason__panel` on `--surface-1`. Its text uses
`--text-secondary` (8.1:1 on `--surface-1`, AAA) and `--text-primary`
(13.4:1, AAA) as in the original spec.

The refusal state's outline-ring dot (1.5px border,
`--text-tertiary` #6b727c on `--surface-0`) has 4.6:1 contrast, above the
3:1 threshold WCAG 1.4.11 requires for a UI component boundary.

### Screen reader summary

On a new assistant message: "High confidence. From Q3 planning. We are
going to hold the L5 backfill until Q4 and prioritize the two L4
requisitions instead. Open note, button. High confidence, from Q3
planning, 3 of 142 passages, collapsed, button."

On expand: "expanded."

On collapse: "collapsed."

No redundant re-reading of the answer. No dump of the reasoning tree
into the live region. The reasoning is on-demand.

---

## 8. What to Delete

Now that the right pane is gone, remove the following. Anything not listed
survives.

### Components

- `src/components/GlassBox.tsx` — delete the whole file. Its content moves
  into a new `ReasoningDisclosure` component (or inlined into `ChatMessage`,
  engineer's call), but the panel itself is gone.

### Styles

- `src/styles/GlassBox.css` — delete. Any rules that survive move into the
  new inline disclosure stylesheet:
  - `.glassbox__summary`, `.glassbox__row`, `.glassbox__reason`,
    `.glassbox__subtitle` — recreate as `.reason__panel-*` equivalents.
  - `.pill`, `.term`, `.terms` — these are shared and used elsewhere. Move
    them to a shared `chips.css` if they are not already global.
- All CSS rules targeting `.glassbox--collapsed`, `.glassbox__expand`,
  `.glassbox__expand-label`, `.glassbox__header`, `.glassbox__collapse`,
  `.glassbox__body`, `.glassbox__empty`, `.glassbox__candidates` —
  delete entirely.

### App shell

- In `App.tsx`, remove the `<GlassBox />` render, the `collapsed` /
  `onToggleCollapsed` state, the selected-message-id state used solely for
  driving the panel, and the `Cmd/Ctrl+/` keyboard shortcut for toggling
  the panel.
- Remove the `--rail-glass`, `--rail-glass-collapsed` tokens from
  `tokens.css`. They are dead. Keep every other token.
- Remove the mobile `Glass` tab from the sub-560px layout described in
  section 7 of the original spec.

### Chat message

- In `ChatMessage.tsx`, remove the `Show reasoning` / `Showing reasoning`
  button, the `isSelected` prop, the `onSelect` prop, and the
  `aria-controls="glassbox"` reference. Replace with the new inline
  `.reason` disclosure sitting between `.msg__actions` and the end of the
  `<li>`, or between the quote and `.msg__actions`. Recommendation:
  disclosure sits BELOW `.msg__actions`, so the primary action (`Open note`)
  stays closest to the quote and the reasoning is one further step away.
  Reasoning is secondary; `Open note` is primary.

### Tests

- Delete tests that assert glass-box collapse/expand behaviour at the app
  level. Add new tests for `.reason` disclosure inside `ChatMessage`:
  default collapsed, keyboard toggle, `aria-expanded` state, focus return
  on collapse, refusal-variant copy.

### Documentation

- Any README section or in-app tour string that references "the glass
  box" as a right-hand panel needs to be updated to "inline reasoning
  under each answer." This is Avery's problem, but flag it for the same
  PR.

---

## Summary of the design commitments in this revision

1. Two panes. Chat column capped at 46rem centred in the stage.
2. Collapsed row is one line: chevron, dot, tier label, source, passage
   count. It hugs its content. It sits directly under the quote.
3. Confidence carries a text label always. Refusal uses a different shape
   (outline ring) as a second non-colour cue.
4. Expanded panel gets a card at `--surface-1`. Intent, terms, ranked
   list, "Why this ranking." Duplicate score/confidence data drops.
5. Ranked bars scale relative to the top score in the current answer,
   with an 8% floor. Coverage becomes a percentage.
6. Height animates via the CSS grid rows trick. 220ms open, 220ms close.
   Reduced motion gets an instant open plus 150ms opacity fade.
7. Native button with `aria-expanded` and `aria-controls`, not
   `<details>`. Panel has `aria-live="off"` and sits inside the polite
   log without being announced on expand.
8. The right pane, its component, its stylesheet, its tokens, its
   shortcut, and its mobile tab are all deleted.
