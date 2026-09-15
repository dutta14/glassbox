# Glassbox Accessibility Audit

## Critical

### C1. `--text-tertiary` (#6b727c) fails 4.5:1 contrast wherever it is used as body text
- **WCAG 1.4.3 Contrast (Minimum) – Level AA**
- **Where:** `src/styles/tokens.css:11` defines the token. Measured contrast:
  - on `--surface-0` #0b0d10: **4.01:1** (borderline fail)
  - on `--surface-1` #12151a: **3.77:1**
  - on `--surface-2` #17​1b21: **3.56:1**
  - on `--surface-3` #1e232b: **3.25:1**
  - on `--surface-quote` #131922: **3.63:1**
- **Consumers (all normal text at 12–15px, so 4.5:1 applies):**
  - `src/styles/GlassBox.css:87` `.glassbox__row dt` – "Intent / Confidence / Query terms / Chunks / Reason" labels (12px on surface-1 = 3.77:1)
  - `src/styles/GlassBox.css:120` `.glassbox__value-muted` – the "—" placeholder and "None after removing common words"
  - `src/styles/GlassBox.css:171` `.glassbox__subtitle-count`
  - `src/styles/GlassBox.css:158` `.term em` – the "→ stem" hint
  - `src/styles/NoteListItem.css:44` `.note-item__meta` – the date and tag row under every note in the sidebar (12px on surface-1 = 3.77:1)
  - `src/styles/QuotedSource.css:26` `.quote__source-label` ("from") and `.quote__source-date` – 12px on `--surface-quote` = 3.63:1
  - `src/styles/CandidateRow.css:37` `.candidate__rank` – "#1" etc. next to every ranked passage
  - `src/styles/ChatMessage.css:65` `.msg__intent` – the intent pill on every answer (12px on surface-0 area = 4.01:1)
  - `src/styles/NoteEditor.css:63` `.editor__meta` – "Edited X min ago"
  - `src/styles/ChatInput.css:75` `.composer__counter`
  - `src/styles/App.css:110` `.app__error-detail`
  - `src/styles/App.css:98` `.stage__no-note` – "Select a note or create a new one."
- **Placeholders that also fail (SC 1.4.3 applies to visible text):**
  - `.notes-rail__search-input::placeholder` – "Filter notes"
  - `.composer__input::placeholder` – "Ask your notes anything…"
  - `.editor__body::placeholder` (text-lg 17px, not large text) – "Start writing…"
- **Who it affects:** users with low vision, users with age-related contrast sensitivity loss, anyone in bright ambient light. On mobile this is the difference between usable and not.
- **Fix:** raise `--text-tertiary` from #6b727c to at least **#8a919c** (≈5.0:1 on surface-1) or **#9199a3** (≈5.6:1). Verify all pairings recompute to ≥4.5:1. Or leave the token and re-tag these consumers to `--text-secondary` (#a9b0ba, which measures 7–8:1).

### C2. Tablist has no arrow-key navigation, breaking the WAI-ARIA tabs pattern
- **WCAG 2.1.1 Keyboard – Level A** (widget not fully operable by expected keys), and violates ARIA APG expectations that AT users rely on
- **File:** `src/App.tsx:222–246` – `<div role="tablist">` with two `role="tab"` buttons uses roving tabindex correctly but has **no `onKeyDown` handler**. `ArrowLeft` / `ArrowRight` / `Home` / `End` do nothing.
- **Who it affects:** screen reader users. When JAWS/NVDA/VoiceOver enter a tablist, the user is trained to press arrow keys to switch tabs. Nothing happens, so they conclude the widget is broken, or they tab away and lose the panel. This is not "nice to have" – it is the defined interaction contract for `role="tablist"`.
- **Fix:** add an `onKeyDown` on the tablist container that on `ArrowLeft`/`ArrowRight` moves the roving-tabindex focus to the previous/next tab, activates it (this app uses automatic activation), and calls `.focus()` on the target tab button. Handle `Home`/`End` as well.

---

## Major

### M1. `role="application"` on the app root suppresses screen-reader browse mode across the entire app
- **WCAG 4.1.2 Name, Role, Value – Level A** (misused role) / broad impact on operability
- **Files:** `src/App.tsx:30` (booting state) and `src/App.tsx:184` (ready state) – `<div className="app" role="application" aria-label="Glassbox">`.
- **Problem:** `role="application"` tells screen readers "this is a custom widget – disable virtual cursor and forward all keystrokes to the app." Glassbox is a document-shaped UI (headings, list items, prose quotes, a chat log). Suppressing browse mode means JAWS/NVDA users cannot use H (heading nav), K (link nav), or arrow keys to read prose – they can only Tab. This is one of the most damaging screen-reader anti-patterns.
- **Who it affects:** JAWS and NVDA users primarily; also affects VoiceOver quick-nav.
- **Fix:** delete `role="application"` on both lines. Keep the `aria-label` if you want a label on the container, but the natural role of a `<div>` (generic) is what you want here. The design spec calls for this role, but the design spec is wrong on this point.

### M2. Duplicate live-region announcements: the `glassbox__body` is `aria-live="polite"` in addition to the chat log
- **WCAG 4.1.3 Status Messages – Level AA** (announcement noise), and undermines the very fix cited in the brief
- **File:** `src/components/GlassBox.tsx:117` – `<div className="glassbox__body" aria-live="polite">` wraps the ENTIRE summary (intent, confidence, query terms, chunks considered, reason, ranked passages list).
- **Also:** `src/components/ChatPanel.tsx:88–95` – `<ol className="chat__log" role="log" aria-live="polite" aria-relevant="additions">`.
- **Problem:** every time the user submits a query, BOTH regions fire:
  1. The chat log announces the appended user message and appended assistant message (verbatim passage, source name, intent chip, action button labels).
  2. The glassbox body re-renders top-to-bottom because `answer` changed; `aria-live="polite"` on the container means the whole subtree ("Intent search Confidence 0.87 Query terms postgres index Chunks considered 12 Reason Top-scoring passage exceeded the threshold Ranked passages 3 …") is announced too.
  The prior sr-only fix removed one duplicate. **This is a second duplicate that still ships.** The design spec (section 9, "Live regions") explicitly says the polite region should be on the summary `dl` and should re-announce only "Intent and confidence" – not the whole panel.
- **Who it affects:** every screen reader user, on every question.
- **Fix:** remove `aria-live="polite"` from `.glassbox__body`. If you want an announcement when the reasoning updates, add a small visually-hidden `aria-live="polite"` node inside `<GlassBoxContent>` that renders only `"Intent: {intent}. Confidence: {tier}, {score}."` and updates when `answer.id` changes.

### M3. Chat log announces the user's own message back to them
- **WCAG 4.1.3 Status Messages – Level AA** (informational; noise degrades usability)
- **File:** `src/components/ChatPanel.tsx:88` – `role="log"` with `aria-live="polite"` wraps the whole `<ol>`. `useChat.append` (`src/hooks/useChat.ts:65`) appends BOTH the user message and the assistant message in one `setMessages`.
- **Problem:** the user just typed and pressed Enter; they know what they said. The polite region will read their own message, then the assistant answer. Verbose and confusing.
- **Fix:** either exclude user messages from the live region (render them inside `<li aria-hidden="true">` while keeping them visible – the log role still lists them), or move the live region so it wraps only the newest assistant message (add a small polite region below the log that mirrors the newest assistant message's announceable content, and mark the visible messages as not-live).

### M4. Storage popover: focus is not managed on open, on close, or on Escape
- **WCAG 2.4.3 Focus Order – Level A**, **3.2.1 On Focus** (partially), and violates the ARIA menu pattern
- **File:** `src/components/StorageControl.tsx:75–97, 133–155`
- **Problems:**
  1. **On open** (line 137, `onClick={() => setOpen((v) => !v)}`): focus stays on the trigger. Nothing tells the SR user the menu appeared beyond `aria-expanded` changing.
  2. **On close via Escape** (line 84, `if (e.key === 'Escape') setOpen(false)`): focus is lost. If the user had tabbed into a menu item, focus falls to `<body>` after the item's DOM node is removed.
  3. **On close via outside click** (line 79): same – focus goes wherever the mousedown target was.
  4. **On close via menu-item activation** (each button calls `setOpen(false)` then invokes an action): the button unmounts under the focused element, focus falls to `<body>`. Screen reader users have to re-navigate the whole app.
  5. **Menu pattern:** trigger claims `aria-haspopup="menu"` and children have `role="menuitem"`, but there is no arrow-key navigation between menu items, no `Home`/`End`, and no roving tabindex. If you commit to `role="menu"`, you owe the keyboard model.
- **Who it affects:** all keyboard-only and screen-reader users.
- **Fix:** simpler correct approach – downgrade to a disclosure, not a menu. Change `aria-haspopup="menu"` → remove, `role="menu"` → remove, `role="menuitem"` → remove. Then only fix the focus-return-on-close: capture the trigger ref, and on any close (Escape, outside click, or after an action) call `triggerRef.current?.focus()`. If you want to keep the menu semantics, additionally: on open, move focus to the first menuitem; implement arrow-key navigation and Home/End; keep focus trap while open.

### M5. Focus is lost after deleting a note
- **WCAG 2.4.3 Focus Order – Level A**
- **File:** `src/App.tsx:283–286` – `onDelete={() => { deleteNote(selectedNote.id); setActiveTab('chat'); }}` and `src/components/NoteEditor.tsx:100` – the focused "Delete" button lives inside the editor which unmounts.
- **Problem:** the Delete button is the focused element; on confirm, the whole `NoteEditor` unmounts (activeTab flips to 'chat'). Focus falls to `<body>`. Screen reader users lose their place at the top of the document.
- **Fix:** after `deleteNote`, programmatically move focus to a stable target. Reasonable options: focus the Chat tab button (it becomes active), or focus the "New note" button in NotesRail, or if there is a next note, select and focus its list item.

### M6. Focus is lost after the empty-state "New note" button is clicked
- **WCAG 2.4.3 Focus Order – Level A**
- **File:** `src/components/NotesRail.tsx:120–125` – the button lives inside `notes-rail__empty`, which is replaced by the `<ul>` of notes once one exists.
- **Fix:** after `onCreate`, move focus to the editor title input (the useEffect at `NoteEditor.tsx:41` already does this for empty new notes – verify it actually runs after the mount).

### M7. Confidence in the reasoning panel is conveyed by colour alone in compact variant
- **WCAG 1.4.1 Use of Color – Level A**
- **File:** `src/components/GlassBox.tsx:139–147` renders `<ConfidenceBadge … variant="compact" showLabel={false} />`. In `src/components/ConfidenceBadge.tsx:34–40`, when `showLabel` is false, the sighted user sees only a coloured dot and a coloured numeric value ("0.87" in green/yellow/red). No text tier and no shape difference between tiers.
- **Who it affects:** users with deuteranopia/protanopia see green and red as similar; the number magnitude helps but does not communicate the tier boundaries the product uses (0.7 = high, etc.). And the "Confidence" `dt` label sits beside a bare number with a dot – tier is not conveyed non-colourably.
- **Fix:** in the compact variant, either (a) also render the tier word as visible text (`showLabel={true}` next to the value), or (b) use tier-differentiated shapes (filled circle / half-filled / hollow) via CSS on `.conf__dot[data-tier]`. Option (a) is 5 characters of change and is the cleanest.

### M8. Ranked-passages list also relies on colour alone for tier
- **WCAG 1.4.1 Use of Color – Level A**
- **File:** `src/styles/CandidateRow.css:44–52` – the `.candidate__score` number colour is the only tier signal. The `data-tier` attribute is present but there is no text or shape.
- **Fix:** add a small tier text next to the score ("high" / "med" / "low" in an unstyled span, or an icon per tier).

### M9. Untitled note titles lose their accessible name in citations
- **WCAG 2.4.4 Link Purpose (In Context) – Level A**
- **Files:**
  - `src/components/QuotedSource.tsx:26` – `const title = source.noteTitle.trim() || 'Untitled';` then aria-label = `Jump to note ${title}` → announces "Jump to note Untitled" for every untitled note.
  - `src/components/CandidateRow.tsx:27` and 38 – same pattern for candidate rows: `aria-label="Open source note Untitled, rank 1, score 0.87"`.
- **Problem:** in a workspace with many drafts, every citation button is "Jump to note Untitled". A screen-reader user cannot distinguish them by name.
- **Fix:** disambiguate. Include the passage snippet or note ID in the accessible name, e.g. `aria-label={`Jump to untitled note: ${source.text.slice(0, 60)}`}` when the title is empty. Also give the user visual feedback that the target is untitled – acceptable as is, but the SR name must be unique enough to distinguish.

### M10. `--conf-low` on `--surface-3` and `--surface-4` fails contrast for text
- **WCAG 1.4.3 Contrast (Minimum) – Level AA**
- **Measured:** `--conf-low` #d97070 on `--surface-3` #1e232b = **4.89:1** (passes), on `--surface-4` #262c36 = **4.35:1** (fails).
- **Where:** `.storage-control__action--danger` on hover has `background: var(--conf-low-bg)` (translucent) over surface-2, and `.msg--selected` sets `background: var(--accent-100)` under an assistant message that may contain "No passage matched" in `--conf-low`. Also `.editor__delete` hovers to `--conf-low-bg` background.
- **Fix:** slightly lift `--conf-low` (e.g. #e58585 or #e78a8a) to pass 4.5:1 on surface-4.

### M11. Confirm dialogs are `window.confirm()` and interrupt focus flow with an unstyled modal
- **WCAG 2.4.3 Focus Order – Level A** (browser-level modal; effect: after confirm, focus depends on browser behaviour, usually returns fine, but on some browsers it goes to body)
- **Files:** `src/components/NoteEditor.tsx:63` and `src/components/ChatPanel.tsx:54` – both destructive actions use `window.confirm(...)`.
- **Problem:** browser confirm dialogs cannot be styled, cannot be tested for a11y, and on some assistive tech return focus to body. They are a defensible short-term choice, but flagging because you also have a "loading skeleton", empty states, and a live region – you clearly care. The confirm dialog is the weakest link.
- **Fix:** replace with an in-app modal that follows the ARIA dialog pattern (focus moves in on open, Escape closes, focus returns to the invoking button, focus trapped while open). Track-only if you cannot ship a dialog now.

---

## Minor

### m1. Skip link target `<main id="stage">` is not focusable
- **WCAG 2.4.1 Bypass Blocks – Level A** (works, but focus behaviour is inconsistent across browsers)
- **File:** `src/App.tsx:186` and `src/App.tsx:213`. The skip link (`href="#stage"`) points to a `<main>` with no `tabindex`. In WebKit and older Safari, focus does not move to the target on activation – only the viewport scrolls.
- **Fix:** add `tabIndex={-1}` to the `<main id="stage">` element so `.focus()` triggered by fragment navigation actually works.

### m2. `role="application"` boot state has no `<h1>` and no landmark
- **WCAG 2.4.6 Headings and Labels – Level AA** (transient)
- **File:** `src/App.tsx:27–35` – during "Loading your notes…", the DOM has only a div with `role="application"` and a status message; there is no heading and no main landmark. Brief but noticeable to a SR user landing on the page cold.
- **Fix:** render an sr-only `<h1>Glassbox</h1>` in the boot state too, and wrap the status in a `<main>`.

### m3. Empty-state `<h2>` inside chat panel disappears when chat has messages
- **WCAG 2.4.6 Headings and Labels – Level AA** – best practice
- **File:** `src/components/ChatPanel.tsx:73` – the only `<h2>` inside the stage is inside `chat__empty`. Once a conversation exists, the chat panel has no heading, so heading nav yields h1 Glassbox → h2 Notes → h2 Reasoning → h3 Ranked passages, with no landmark heading for the conversation itself.
- **Fix:** render a persistent visually-hidden `<h2>Conversation</h2>` at the top of the log.

### m4. `editor__tags` uses `aria-label` on a bare `<div>` with no role
- **WCAG 4.1.2 Name, Role, Value – Level A** (aria-label on role=generic is ignored)
- **File:** `src/components/NoteEditor.tsx:85` – `<div className="editor__tags" aria-label="Tags">`. The design spec calls for `role="group"`. Without a role, the aria-label is discarded by most SRs.
- **Fix:** add `role="group"`. (The div only renders when `note.tags.length > 0`, so it is not always present – that is fine.)

### m5. `msg__intent` sets an `aria-label` on the same node whose visible text differs slightly
- **WCAG 4.1.2** – minor
- **File:** `src/components/ChatMessage.tsx:49` – `<span aria-label={`Intent: ${answer.trace.intent}`}>{answer.trace.intent}</span>`. Because this is a non-interactive span, whether `aria-label` overrides the text depends on the SR. In practice most SRs will read the text and ignore the label on a generic span.
- **Fix:** either wrap the visible text in an aria-hidden span and place the label on a visually-hidden sibling, or drop the aria-label and rely on the visible text (the surrounding context "Intent" is already the meaning).

### m6. Composer counter is a live region that appears mid-typing
- **WCAG 4.1.3** – minor noise
- **File:** `src/components/ChatInput.tsx:96–99` – `<div className="composer__counter" aria-live="polite">…` conditionally rendered when the user hits 450+ characters. Because the element only enters the DOM at 450, its initial text is announced. Then every keystroke changes it, causing rapid polite announcements.
- **Fix:** render the counter node unconditionally (visually hide it under the threshold with `display:none` triggers no announcement, or use `visibility:hidden` with `aria-hidden`), or make it `role="status"` on a persistently mounted node whose text updates. Debounce the announcement or throttle to every 25 chars.

### m7. Send and icon buttons are 36×36 (below AAA 44×44 touch target)
- **WCAG 2.5.5 Target Size (Enhanced) – Level AAA** (not required for AA; WCAG 2.2 SC 2.5.8 minimum 24×24 is met)
- **Files:** `.composer__send` 36×36 (`ChatInput.css:63`), `.notes-rail__new` 36×36 (`NotesRail.css:36`), `.glassbox__collapse` 32×32 (`GlassBox.css:52`). Design spec claims "36×36 with 8px hit-area padding to reach 44×44 effective" but no such padding is present in CSS.
- **Fix:** if you want AAA, add invisible `padding` (or `::before` inset -4px) to reach a 44×44 hit area, or bump the CSS size. On mobile (`.composer__send`) is already fixed.

### m8. `outline: none` on all focus without a fallback for high-contrast mode
- **WCAG 1.4.11 Non-text Contrast – Level AA** (edge case)
- **File:** `src/styles/tokens.css:154–159` – `:focus { outline: none; } :focus-visible { outline: none; box-shadow: var(--shadow-focus); }`. The box-shadow-based ring is fine for normal rendering, but Windows High Contrast Mode / forced-colors ignores `box-shadow`, so the focus indicator disappears completely for those users.
- **Fix:** inside `@media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; outline-offset: 2px; } }`. Cheap belt-and-braces.

### m9. External-conflict banner uses `role="alert"` on every conflict at initial render
- **WCAG 4.1.3** – minor
- **File:** `src/App.tsx:216–228`. If a user opens the app and there are three pre-existing external conflicts, three assertive announcements fire in sequence on load.
- **Fix:** use `role="status"` (polite) since these are not time-critical, or aggregate into a single "3 notes changed on disk" alert with a details region.

### m10. `role="log"` chat container's ordered list is announced as a list of many items on entry
- Not a bug per se, but note that `role="log"` implicitly is `aria-live="polite"`; adding `aria-live="polite"` explicitly (`ChatPanel.tsx:91`) is redundant but harmless. This is a **commonly-botched-correctly** pattern – flagged only because reviewers ask.

---

## What is done correctly (worth noting)

- The previous sr-only-duplicate-announcement fix in ChatMessage is present: no hidden text mirrors the visible passage. That specific double-read is gone. (The new duplicate source is #M2, on the glassbox body, not this component.)
- Icon-only buttons all have `aria-label` (New note, Send, Collapse reasoning panel, Expand reasoning panel, Dismiss warning, Remove tag on editor removed – tags aren't removable in current impl). Good.
- Notes rail correctly uses `<aside aria-label>` → `<h2>` → `<nav aria-label>` → `<ul>` → `<li>` → `<button>`. Semantic, list-based, labelled. Textbook.
- Chat log uses `<ol>` with `role="log"` and `aria-relevant="additions"`. Correct pattern for a chat transcript, and `polite` (not `assertive`) is the right choice.
- Note-list items are real `<button>`s inside `<li>`s, not divs with `role="button"` and manual keydown handlers. This is a commonly-botched pattern that this codebase gets right.
- Roving tabindex on the tab buttons (`tabIndex={activeTab === 'chat' ? 0 : -1}`) is present. The pattern is half-implemented (missing arrow keys – see C2), but the roving half is correct.
- `prefers-reduced-motion` global override in `tokens.css:161–170` neutralises transitions and animations app-wide; `ChatMessage.css:22` additionally kills the msg-appear animation. Both belts, both braces.
- The confidence badge outer span has `aria-label="Confidence: {tier}, {score}"` and inner visual elements are `aria-hidden`. Correct grouping – SR users hear one clean phrase, not "dot high confidence 0.87".
- Focus-visible ring is design-system-driven (`--shadow-focus`), consistent everywhere, and applied on interactive elements that opt in (search input, storage trigger, ghost buttons, storage action buttons). The `:focus { outline: none }` is scoped to non-visible focus only, which is fine for mouse users.
- Chat input has a real `<label className="sr-only" htmlFor="composer-input">`, not just a placeholder. Correct.
- Note editor title and body inputs have `aria-label`s. Not ideal (real labels are better) but valid.

---

## Summary

| Severity | Count |
|---------|------|
| Critical | 2 |
| Major | 11 |
| Minor | 10 |

**Overall judgement: not shippable as is.**

The dark-theme contrast token (`--text-tertiary`) fails AA across every surface it lands on, and it is used for the reasoning panel labels, note-item metadata, ranked-passage ranks, and every citation date. This is a single-token fix that unblocks about a dozen consumers. That alone is a hard-stop for a WCAG 2.1 AA claim.

The tablist not responding to arrow keys is the second hard-stop: the ARIA pattern is announced ("tab, 1 of 2") and then broken – users will report the widget as unresponsive.

Once those two are fixed, the Major cluster is real user harm but tractable:
- `role="application"` (one line to delete)
- the glassbox live-region duplicate (one attribute to delete + one small mirror node)
- focus loss on note delete / storage popover close / empty-state action (a handful of `ref.focus()` calls)
- adding a text tier or shape to the compact confidence badge (one boolean flip)

The remaining Minors are polish that a follow-up sprint should absorb.

Recommended sequence: **C1 + C2 first** (blocks release). **M1–M8 next** (target: same PR or immediate follow-up). **M9–M11 and all Minors** in a hardening pass.
