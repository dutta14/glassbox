# Glassbox — Design Spec

## 1. Layout and Information Architecture

Three-pane persistent layout on desktop. No modal switching between "notes mode" and "chat mode" because that's the exact context cost we're trying to eliminate.

```
┌──────────────┬────────────────────────────────┬──────────────────┐
│              │                                │                  │
│  NOTES RAIL  │       CENTER STAGE             │  GLASS BOX       │
│  260px       │       flex: 1, min 480px       │  360px           │
│              │                                │                  │
│  - Search    │   Two modes, toggled by tab:   │  Contextual to   │
│  - New note  │   [ Chat ] [ Editor ]          │  the last        │
│  - Note list │                                │  assistant msg.  │
│              │   Chat is the default.         │                  │
│              │   Clicking a note in the rail  │  Collapsible to  │
│              │   opens Editor with that note. │  40px rail.      │
│              │   Clicking a citation in chat  │                  │
│              │   opens Editor scrolled to     │                  │
│              │   the passage.                 │                  │
│              │                                │                  │
└──────────────┴────────────────────────────────┴──────────────────┘
```

**Total min width: 1100px** for full three-pane. Below that, glass box collapses to a rail.

Why this structure:
- Notes rail is persistent because the corpus is the product. The user must always see what they're querying.
- Center stage swaps between Chat and Editor, but state is preserved on both sides. The chat scroll position and the editor cursor position survive tab switches.
- Glass box is persistent by default because the "show your work" behavior is the differentiator. Hiding it behind a click would signal it's optional. It is not optional. It is the reason the product exists. A user can collapse it, but the default is open.

The chat and the glass box are semantically linked: the glass box always reflects the most recent assistant message (or the one the user last clicked). Selecting a different message updates the glass box in place with a 150ms crossfade.

---

## 2. Design Tokens

```css
:root {
  /* ---------- Surfaces (dark-first, layered luminosity) ---------- */
  --surface-0: #0b0d10;   /* app canvas */
  --surface-1: #12151a;   /* rails, glass box */
  --surface-2: #171b21;   /* cards, message bubbles (assistant) */
  --surface-3: #1e232b;   /* hover, active list item */
  --surface-4: #262c36;   /* elevated (dropdowns, popovers) */
  --surface-quote: #131922; /* quoted-passage tint, blue-shifted */

  /* ---------- Text ---------- */
  --text-primary:   #ecedef;  /* body, primary content */
  --text-secondary: #a9b0ba;  /* labels, metadata */
  --text-tertiary:  #6b727c;  /* placeholders, timestamps */
  --text-inverse:   #0b0d10;  /* on accent fills */
  --text-quote:     #d8dde4;  /* quoted passage body */

  /* ---------- Borders ---------- */
  --border-subtle:  #1f2530;
  --border-default: #2a323e;
  --border-strong:  #3a4453;
  --border-focus:   #7aa2ff;

  /* ---------- Accent (single hue, used sparingly) ---------- */
  --accent-500: #7aa2ff;      /* interactive, focus rings */
  --accent-600: #5f8cf5;      /* hover */
  --accent-100: #7aa2ff1f;    /* selected row tint (12% alpha) */

  /* ---------- Confidence (semantic, three tiers) ---------- */
  --conf-high:   #4ec9a4;     /* >= 0.75 */
  --conf-med:    #e0b155;     /* 0.45 - 0.74 */
  --conf-low:    #d97070;     /* < 0.45 */
  --conf-high-bg: #4ec9a41a;
  --conf-med-bg:  #e0b1551a;
  --conf-low-bg:  #d970701a;

  /* ---------- Spacing (4px base, strict) ---------- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ---------- Typography ---------- */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
               "Liberation Mono", monospace;

  /* type scale: 12, 13, 14, 15, 17, 20, 24 */
  --text-xs:   12px;  /* metadata, timestamps, glass box labels */
  --text-sm:   13px;  /* UI chrome, tags, buttons */
  --text-base: 14px;  /* default body */
  --text-md:   15px;  /* chat messages */
  --text-lg:   17px;  /* editor body, quoted passage */
  --text-xl:   20px;  /* note titles */
  --text-2xl:  24px;  /* section headings, editor title input */

  --leading-tight:  1.35;
  --leading-normal: 1.55;
  --leading-relaxed: 1.7;   /* editor + quoted passages */

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;

  /* tabular for confidence numbers, similarity scores */
  --num-tabular: "tnum" 1, "lnum" 1;

  /* ---------- Radii ---------- */
  --radius-sm: 4px;    /* tags, chips */
  --radius-md: 8px;    /* buttons, inputs */
  --radius-lg: 12px;   /* cards, message bubbles */
  --radius-xl: 16px;   /* modal-scale */

  /* ---------- Shadows (soft, dark-mode aware) ---------- */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45);
  --shadow-focus: 0 0 0 2px var(--surface-0),
                  0 0 0 4px var(--border-focus);

  /* ---------- Motion ---------- */
  --dur-instant: 100ms;
  --dur-micro:   150ms;   /* hover, focus, toggle */
  --dur-state:   220ms;   /* panel open, message appear */
  --dur-layout:  320ms;   /* pane collapse, mode switch */

  --ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-in:     cubic-bezier(0.55, 0.06, 0.68, 0.19);
  --ease-in-out: cubic-bezier(0.65, 0.05, 0.36, 1);

  /* ---------- Layout ---------- */
  --rail-notes: 260px;
  --rail-glass: 360px;
  --rail-glass-collapsed: 40px;
  --stage-min: 480px;
  --measure: 68ch;   /* reading measure for editor + chat */
}
```

---

## 3. Component Hierarchy

```html
<div class="app" role="application" aria-label="Glassbox">

  <!-- NOTES RAIL -->
  <aside class="notes-rail" aria-label="Notes">
    <header class="notes-rail__header">
      <h2 class="notes-rail__title">Notes</h2>
      <button class="btn btn--icon" aria-label="New note" data-action="new-note">
        <svg aria-hidden="true">...</svg>
      </button>
    </header>
    <div class="notes-rail__search" role="search">
      <input type="search" class="input input--search"
             placeholder="Filter notes" aria-label="Filter notes"/>
    </div>
    <nav class="notes-rail__list" aria-label="Note list">
      <ul role="list">
        <li>
          <a class="note-item" role="button" tabindex="0"
             aria-current="true" data-note-id="...">
            <span class="note-item__title">Q3 planning</span>
            <span class="note-item__preview">We discussed the roadmap...</span>
            <span class="note-item__meta">
              <time datetime="2026-09-13">Today</time>
              <span class="note-item__tags">
                <span class="tag">work</span>
              </span>
            </span>
          </a>
        </li>
      </ul>
    </nav>
  </aside>

  <!-- CENTER STAGE -->
  <main class="stage" aria-label="Main workspace">
    <div class="stage__tabs" role="tablist">
      <button role="tab" aria-selected="true" aria-controls="chat-panel"
              id="tab-chat" class="tab tab--active">Chat</button>
      <button role="tab" aria-selected="false" aria-controls="editor-panel"
              id="tab-editor" class="tab">Editor</button>
    </div>

    <!-- CHAT -->
    <section id="chat-panel" role="tabpanel" aria-labelledby="tab-chat"
             class="chat">
      <ol class="chat__log" role="log" aria-live="polite"
          aria-relevant="additions" aria-label="Conversation">

        <li class="msg msg--user">
          <div class="msg__bubble">What did I decide about hiring?</div>
        </li>

        <li class="msg msg--assistant" data-msg-id="a1"
            aria-labelledby="msg-a1-label">
          <span id="msg-a1-label" class="sr-only">Assistant answer</span>

          <div class="msg__meta">
            <span class="conf" data-tier="high"
                  aria-label="Confidence: high, 0.87">
              <span class="conf__dot" aria-hidden="true"></span>
              <span class="conf__label">High confidence</span>
              <span class="conf__value">0.87</span>
            </span>
            <span class="msg__intent">search</span>
          </div>

          <blockquote class="quote">
            <p class="quote__body">
              We are going to hold the L5 backfill until Q4 and prioritize
              the two L4 requisitions instead.
            </p>
            <footer class="quote__source">
              <span class="quote__source-label">from</span>
              <a class="quote__source-link" href="#note-42"
                 data-note-id="42" data-passage-offset="128">
                Q3 planning
              </a>
              <span class="quote__source-date">
                <time datetime="2026-09-10">Sep 10</time>
              </span>
            </footer>
          </blockquote>

          <div class="msg__actions">
            <button class="btn btn--ghost" data-action="open-source"
                    aria-label="Open source note">Open note</button>
            <button class="btn btn--ghost" data-action="toggle-glass"
                    aria-expanded="true" aria-controls="glassbox">
              Show reasoning
            </button>
          </div>
        </li>

      </ol>

      <form class="composer" role="search" aria-label="Ask your notes">
        <label class="sr-only" for="composer-input">Ask a question</label>
        <textarea id="composer-input" class="composer__input"
                  rows="1" placeholder="Ask your notes"></textarea>
        <button type="submit" class="btn btn--primary composer__send"
                aria-label="Send">
          <svg aria-hidden="true">...</svg>
        </button>
      </form>
    </section>

    <!-- EDITOR (hidden when chat tab active) -->
    <section id="editor-panel" role="tabpanel" aria-labelledby="tab-editor"
             class="editor" hidden>
      <input class="editor__title" aria-label="Note title"
             placeholder="Untitled"/>
      <div class="editor__tags" role="group" aria-label="Tags">
        <span class="tag tag--removable">
          work
          <button aria-label="Remove tag work">×</button>
        </span>
        <input class="editor__tag-input" placeholder="Add tag"
               aria-label="Add tag"/>
      </div>
      <textarea class="editor__body" aria-label="Note body"></textarea>
      <footer class="editor__meta">
        <span>Edited <time datetime="...">2 min ago</time></span>
        <button class="btn btn--danger-ghost" data-action="delete">Delete</button>
      </footer>
    </section>
  </main>

  <!-- GLASS BOX -->
  <aside id="glassbox" class="glassbox" aria-label="Reasoning for answer">
    <header class="glassbox__header">
      <h2 class="glassbox__title">
        <svg aria-hidden="true">...</svg>
        Reasoning
      </h2>
      <button class="btn btn--icon" data-action="collapse-glass"
              aria-label="Collapse reasoning panel">
        <svg aria-hidden="true">...</svg>
      </button>
    </header>

    <dl class="glassbox__summary">
      <div class="glassbox__row">
        <dt>Intent</dt>
        <dd><span class="pill">search</span></dd>
      </div>
      <div class="glassbox__row">
        <dt>Confidence</dt>
        <dd>
          <span class="conf" data-tier="high">
            <span class="conf__dot"></span>
            <span class="conf__value">0.87</span>
          </span>
        </dd>
      </div>
      <div class="glassbox__row">
        <dt>Query terms</dt>
        <dd class="terms">
          <span class="term">decide <em>→ decid</em></span>
          <span class="term">hiring <em>→ hire</em></span>
        </dd>
      </div>
      <div class="glassbox__row">
        <dt>Chunks considered</dt>
        <dd class="num">142</dd>
      </div>
    </dl>

    <section class="glassbox__candidates" aria-label="Ranked candidates">
      <h3 class="glassbox__subtitle">Ranked passages</h3>
      <ol class="candidates" role="list">
        <li class="candidate candidate--selected">
          <div class="candidate__head">
            <span class="candidate__rank">1</span>
            <span class="candidate__score">0.87</span>
            <span class="candidate__source">Q3 planning</span>
          </div>
          <p class="candidate__snippet">
            We are going to hold the L5 backfill until Q4...
          </p>
        </li>
        <li class="candidate">
          <div class="candidate__head">
            <span class="candidate__rank">2</span>
            <span class="candidate__score">0.61</span>
            <span class="candidate__source">1:1 with Priya</span>
          </div>
          <p class="candidate__snippet">
            Priya asked about the hiring bar...
          </p>
        </li>
      </ol>
    </section>
  </aside>

</div>
```

---

## 4. Visual Spec per Component

### Note item (`.note-item`)
- Padding: `var(--space-3) var(--space-4)` (12/16)
- Border-bottom: `1px solid var(--border-subtle)`
- Title: `var(--text-sm)` / `var(--weight-semibold)` / `var(--text-primary)` / line-height 1.35
- Preview: `var(--text-xs)` / regular / `var(--text-secondary)` / 1 line, ellipsis
- Meta row: `var(--text-xs)` / `var(--text-tertiary)`, margin-top `var(--space-2)`
- Selected: background `var(--accent-100)`, left border 2px `var(--accent-500)` (inset via box-shadow to avoid layout shift)
- Height: minimum 68px (comfortable touch target, three lines)

### Editor title (`.editor__title`)
- `var(--text-2xl)` / `var(--weight-semibold)` / `var(--text-primary)`
- Line-height `var(--leading-tight)`, no border, background transparent
- Padding: `var(--space-4) var(--space-6)`
- Placeholder color `var(--text-tertiary)`

### Editor body (`.editor__body`)
- `var(--text-lg)` (17px) / `var(--weight-regular)` / `var(--text-primary)`
- Line-height `var(--leading-relaxed)` (1.7)
- Max-width: `var(--measure)` (68ch), horizontally centered in stage
- Padding: `var(--space-6)`
- Background `var(--surface-0)` (canvas, for a paper-like feel)

### Chat message, user (`.msg--user`)
- Right-aligned, max-width `min(72ch, 80%)`
- Bubble background `var(--surface-3)`
- Text `var(--text-primary)` / `var(--text-md)` / line-height `var(--leading-normal)`
- Padding `var(--space-3) var(--space-4)`
- Radius `var(--radius-lg)`, with `border-bottom-right-radius: var(--space-1)` to feel directional
- Margin-bottom `var(--space-6)`

### Chat message, assistant (`.msg--assistant`)
- Full-width column, no bubble around the whole thing. The quoted passage IS the message.
- Stacked children with `var(--space-3)` between: meta → quote → actions
- Max-width `var(--measure)`, left-aligned

### Quoted passage (`.quote`)  — the most important component
- Background `var(--surface-quote)` (blue-shifted, distinct from any user-typed area)
- Left border: 3px solid `var(--accent-500)`
- Padding `var(--space-5) var(--space-6)`
- Radius: 0 on the left edge (border-radius `0 var(--radius-lg) var(--radius-lg) 0`)
- Body: `var(--text-lg)` (17px) / `var(--weight-regular)` / `var(--text-quote)` / line-height `var(--leading-relaxed)`
- Font family: same sans as body. We do NOT switch to serif or mono; the passage is the user's own writing and should look like it.
- No quote marks in glyph form. The visual container is the quotation. Adding "" would be redundant chrome.

### Source attribution (`.quote__source`)
- Below the passage, inside the quote block, margin-top `var(--space-3)`, separated by 1px border-top `var(--border-subtle)`, padding-top `var(--space-3)`
- Font: `var(--text-xs)` / `var(--weight-medium)` / `var(--text-secondary)`
- Format: `from  Q3 planning · Sep 10`
- `.quote__source-link` is the note title, styled as a link: `var(--accent-500)`, underline on hover, underline-offset 3px

### Confidence indicator inline (`.conf`)
- Row: dot 8px + label + value, gap `var(--space-2)`
- Dot: 8px circle, color from `--conf-{tier}`
- Label: `var(--text-xs)` / `var(--weight-medium)` / `var(--text-secondary)`
- Value: `var(--text-xs)` / `var(--weight-semibold)` / color from `--conf-{tier}` / `font-variant-numeric: tabular-nums`

### Glass box panel (`.glassbox`)
- Background `var(--surface-1)`
- Left border 1px `var(--border-subtle)`
- Header padding `var(--space-4) var(--space-5)`, border-bottom 1px `var(--border-subtle)`
- Title `var(--text-sm)` / `var(--weight-semibold)` / `var(--text-secondary)`, with a 14px SVG "atom/schematic" icon before it
- Summary rows: `dt` in `var(--text-xs)` / `var(--text-tertiary)` / uppercase / letter-spacing 0.04em; `dd` in `var(--text-sm)` / `var(--text-primary)` / tabular numerals
- Row padding `var(--space-3) var(--space-5)`, border-bottom `var(--border-subtle)`

### Candidate row (`.candidate`)
- Padding `var(--space-3) var(--space-5)`
- Border-bottom `var(--border-subtle)`
- Head row: `rank` (mono, `var(--text-tertiary)`), `score` (tabular, tier-colored, `var(--weight-semibold)`), `source` (link-styled, ellipsis)
- Snippet: `var(--text-xs)` / `var(--text-secondary)` / line-height 1.5 / max 2 lines with `-webkit-line-clamp: 2`
- Selected (matches shown quote): background `var(--accent-100)`, left inset shadow 2px `var(--accent-500)`

### Composer (`.composer`)
- Sticky bottom of chat, `var(--space-4) var(--space-6)` padding
- Background `var(--surface-0)` with top gradient fade (32px, from transparent to canvas) above it so messages don't hard-clip
- Input: `var(--surface-2)` background, 1px border `var(--border-default)`, radius `var(--radius-lg)`, min-height 44px, padding `var(--space-3) var(--space-4)`, auto-grows to 6 lines then scrolls
- Send button: 36×36, `var(--accent-500)` background, `var(--text-inverse)` icon, radius `var(--radius-md)`

---

## 5. States

For every interactive element:

| State | Treatment |
|---|---|
| **default** | Base tokens as specified |
| **hover** | Surfaces shift up one level (e.g. `--surface-2` → `--surface-3`). Links: color → `--accent-600`, underline appears. Duration 100ms ease-out. No hover on touch. |
| **focus-visible** | `outline: none` + `box-shadow: var(--shadow-focus)` (2px canvas gap + 2px `--border-focus` ring). Applies to every focusable element without exception. |
| **active** | Surfaces shift up one more level, or 4% brightness drop on accent fills. No scale transforms. |
| **disabled** | `opacity: 0.4`, `cursor: not-allowed`, `pointer-events: none` on buttons, `aria-disabled="true"` |
| **loading (composer send)** | Icon swaps to a 16px spinner (SVG, 900ms rotate). Input remains editable. `aria-busy="true"` on the form. |
| **loading (chat, waiting for retrieval)** | A single skeleton message appears below the last user message: 3 shimmer bars (60%, 90%, 40% widths) with a 1200ms shimmer. Since retrieval is local and fast, this typically shows for under 100ms. `role="status" aria-label="Searching your notes"`. |
| **empty — notes rail** | Centered stack: 40×40 outline SVG (page + plus), title "No notes yet" (`--text-sm` / semibold), body "Create your first note to start asking questions." (`--text-xs` / secondary), primary button "New note". |
| **empty — chat** | Centered in stage: title "Ask your notes anything" (`--text-2xl`), body "Every answer is a quote from something you wrote." (`--text-md` / secondary), max-width 44ch. Below: 3 example prompts as ghost buttons ("What did I write about hiring?", "Show me #work notes", "How many notes do I have?"). |
| **empty — glass box** | "Ask a question to see the reasoning behind the answer." (`--text-sm` / `--text-tertiary`), centered, max-width 32ch. |
| **error — retrieval failed** | Assistant message renders with `data-tier="low"` confidence, body reads: "I could not find this in your notes." No quote block. Below: "Try rephrasing, or check that the topic exists in a note." (`--text-xs` / `--text-secondary`). Glass box still fills in with what was attempted. |
| **error — save failed** | Inline banner at top of editor: 1px `--conf-low` border, `--conf-low-bg` background, `--text-sm`, "Could not save. Retrying." with a retry button. |

---

## 6. The Confidence Indicator

This is the single most important honesty signal in the product. The design has to make "how sure am I" instantly readable at three levels of attention: glance, scan, and inspect.

**Three tiers, not a continuous gradient.** A 0.62 and a 0.68 do not deserve different colors. Tiers force the system to commit.

| Tier | Range | Color token | Label |
|---|---|---|---|
| High | 0.75 – 1.00 | `--conf-high` (#4ec9a4, teal-green) | "High confidence" |
| Medium | 0.45 – 0.74 | `--conf-med` (#e0b155, amber) | "Medium confidence" |
| Low | 0.00 – 0.44 | `--conf-low` (#d97070, muted red) | "Low confidence" |

Below 0.35, the system does NOT quote a passage at all. It returns "I could not find this in your notes" with the low-tier styling. Quoting a bad match with a warning is worse than not quoting.

**The visual treatment, three levels of detail:**

1. **Glance (chat meta row above every assistant message):** 8px filled circle in the tier color + the tier label in `--text-xs` medium + the numeric score in `--text-xs` semibold tabular. Total footprint: about 140px wide, 16px tall.

2. **Scan (glass box summary):** same dot + numeric score, larger (dot 10px, number `--text-sm` semibold).

3. **Inspect (glass box candidates list):** each candidate shows a tabular score to two decimals in its tier color. The selected one has a filled left indicator; the rest are text-only. This lets the user see the gap between #1 (0.87) and #2 (0.61) at a glance.

**Why no bar or progress ring:** A bar implies "how much of a thing" (like battery). Confidence is not a fill quantity, it's a category with a number attached. A dot with a label is honest about that. It also survives colorblindness because the label ("High/Medium/Low") always accompanies the color.

**Contrast check:**
- `#4ec9a4` on `#12151a`: contrast 8.4:1. Passes AAA.
- `#e0b155` on `#12151a`: contrast 9.2:1. Passes AAA.
- `#d97070` on `#12151a`: contrast 5.1:1. Passes AA for text, AAA for large text.

The dot alone would fail for users who can't perceive color. The paired label makes this WCAG 1.4.1 compliant.

---

## 7. Responsive Behavior

**≥ 1200px** — Full three-pane as specified.

**992 – 1199px** — Glass box narrows to 320px. Notes rail stays 260px. Stage minimum drops to 400px. If content still doesn't fit, glass box collapses to a 40px vertical rail with a rotated "Reasoning" label and the current-answer confidence dot. Click expands to a floating panel (overlay, `--shadow-lg`, closes on outside click). Not a persistent open pane at this width.

**768 – 991px** — Notes rail collapses to icons-only strip, 56px wide. Note titles show on hover as a tooltip (150ms delay). A hamburger at the top of the rail expands it to a floating 280px overlay. Glass box behaves as the 992-1199 collapsed rail on the right (40px, click to overlay).

**480 – 767px** — Single column. The three surfaces become three tabs at the bottom (mobile-style tab bar, 56px tall): `Notes`, `Chat`, `Glass`. Each is a full-screen view. Glass tab shows a badge dot when there's new reasoning to inspect. Composer stays sticky above the tab bar.

**< 480px** — Same single-column tab layout. Editor title `--text-xl` instead of `--text-2xl`. Editor body max-width becomes 100%, padding drops to `var(--space-4)`. Chat messages max-width becomes 100%. Quote left border stays 3px.

Touch targets on mobile: every interactive element minimum 44×44px. Tab bar items 56px tall. Send button grows to 44×44.

---

## 8. Motion Spec

| Trigger | Property | Duration | Easing | Reduced motion |
|---|---|---|---|---|
| Hover on button/link | `background-color`, `color` | 100ms | `--ease-out` | Same, unchanged (no spatial movement) |
| Focus ring appears | `box-shadow` | 100ms | `--ease-out` | Instant (0ms) |
| Tab switch (Chat ↔ Editor) | opacity crossfade + 4px Y offset on incoming | 220ms | `--ease-out` | Opacity crossfade only, no offset, 150ms |
| Assistant message appears | opacity 0→1 + 8px Y translate (from below) | 220ms | `--ease-out` | Opacity only, 150ms |
| Glass box content updates (new answer selected) | opacity crossfade of the summary + candidates | 150ms | `--ease-in-out` | Same, this is already opacity-only |
| Glass box collapse/expand | `width` and content opacity | 320ms | `--ease-in-out` | Instant width change, opacity 150ms |
| Notes rail overlay open (mobile) | `translateX(-100%)` → `0` | 220ms | `--ease-out` | Opacity fade only, 150ms |
| Composer send loading spinner | 360° rotate, infinite | 900ms | linear | Replace with static "…" glyph |
| Skeleton shimmer (loading state) | background-position sweep | 1200ms | linear, infinite | Static solid `--surface-3` bars, no animation |
| Note-item hover | `background-color` | 100ms | `--ease-out` | Same |

**How the assistant message appears (critical):**

Retrieval is instant. We must not fake typing. The message appears as one whole block: the meta row, the full quote, the actions, all together, with a single 220ms opacity+translate entrance. That's it. A user who's worked with LLMs will notice the absence of streaming and understand: this system already had the answer.

If retrieval takes more than 120ms (a large corpus), a skeleton renders in place first, then swaps for the real message with a crossfade. Never chunk-reveal the passage word by word. That would be a lie about how retrieval works.

**Reduced motion global override:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* Opacity-only variants applied via a body class on top of this */
}
```
Then a `body.reduced-motion` class re-enables opacity crossfades (which are safe) at 150ms, because instant state swaps can also disorient. This gives users the state feedback without spatial motion.

---

## 9. Accessibility Notes

**Landmarks and roles:**
- `<aside>` for notes rail (`aria-label="Notes"`) and glass box (`aria-label="Reasoning for answer"`).
- `<main>` for the stage (`aria-label="Main workspace"`).
- Chat log: `<ol role="log" aria-live="polite" aria-relevant="additions">`. `polite`, not `assertive`, because the user initiated the request and is expecting a response, not being interrupted.
- Tabs use full `role="tablist"` / `role="tab"` / `role="tabpanel"` with `aria-selected` and `aria-controls`.

**Announcements:**
- New assistant message: because the log has `aria-live="polite"`, the message content is announced automatically. To avoid a wall of text, the announced content is `"{tier} confidence. From {note title}. {passage.}"`. Everything else in the message (intent pill, buttons) uses `aria-hidden` on decorative wrappers so it does not enter the announcement.
- Confidence: `.conf` has `aria-label="Confidence: {tier}, {score}"`. Individual visual pieces inside are `aria-hidden`.
- Glass box updates: `aria-live="polite"` on the summary `dl`. When the user asks a new question, the summary re-announces with intent and confidence only ("Intent: search. Confidence: high, 0.87.").

**Focus management:**
- After sending a message: focus stays on the composer input. Do not steal focus to the new assistant message. The live region does the announcement work.
- After clicking "Open note" from a citation: the Editor tab activates, the target note loads, focus moves to the passage location in the textarea, and the textarea scrolls that offset into view. `aria-live="polite"` announces "Opened Q3 planning".
- After clicking "Show reasoning" (in mobile / collapsed): focus moves to the glass box heading (`tabindex="-1"` on the `h2`, focused programmatically).
- After collapsing the glass box: focus returns to the trigger button.
- Escape key: in mobile overlay mode, closes the notes overlay or the glass overlay and returns focus to the trigger.

**Keyboard:**
- Composer: `Enter` sends. `Shift+Enter` inserts newline. `Cmd/Ctrl+K` from anywhere focuses the composer.
- Notes rail: arrow keys move selection within the list (roving tabindex), `Enter` opens the note in the editor.
- Tabs: arrow keys switch between Chat and Editor tabs per WAI-ARIA tab pattern.
- Global: `Cmd/Ctrl+N` creates a new note. `Cmd/Ctrl+/` toggles the glass box.

**Tab order:**
1. Skip link ("Skip to main workspace")
2. Notes rail: search input → new-note button → note list (roving)
3. Stage: tabs → active panel content (chat log messages are not in tab order; their action buttons are) → composer
4. Glass box: collapse button → candidate list (roving)

**Contrast (all against their actual backgrounds):**
- `--text-primary` #ecedef on `--surface-0` #0b0d10: 15.1:1 (AAA)
- `--text-primary` on `--surface-2` #171b21: 13.4:1 (AAA)
- `--text-secondary` #a9b0ba on `--surface-1` #12151a: 8.1:1 (AAA)
- `--text-tertiary` #6b727c on `--surface-1`: 4.6:1 (AA for normal text, AAA for large)
- `--accent-500` #7aa2ff on `--surface-0`: 7.2:1 (AAA for text)
- `--border-focus` on `--surface-0` (focus ring): 7.2:1 — highly visible

**Touch targets:** Notes rail items 68px tall (way above 44px). Send button 36px on desktop, 44px on mobile. All icon buttons 36×36 with 8px hit-area padding to reach 44×44 effective. Tab bar on mobile 56px.

**Text sizing:** Everything scales with root font-size. No `px` on font-size for body content in the CSS above? Correction: use `rem` in production. All the `px` values in the token block should be authored as `rem` (assume `1rem = 16px`; `13px = 0.8125rem`, `14px = 0.875rem`, `15px = 0.9375rem`, `17px = 1.0625rem`). This lets users zoom via browser text-size preferences without breaking layout.

**Reduced transparency:** The composer top-fade gradient degrades to a solid `--surface-0` background on `prefers-reduced-transparency`.

**Screen reader shortcut:** A visually-hidden `<h1>Glassbox: ask your notes</h1>` at the top of `<main>` so heading navigation lands somewhere meaningful.
