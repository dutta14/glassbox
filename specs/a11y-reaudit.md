# Glassbox A11y Re-audit

## Part A — Regression check

Contrast recomputed (WCAG 2 formula) against current tokens `--text-tertiary #8a919c`, `--conf-low #e58585`:

| fg on bg | ratio |
|---|---|
| tertiary on surface-0 #0b0d10 | **6.13** |
| tertiary on surface-1 #12151a | **5.76** |
| tertiary on surface-2 #171b21 | **5.44** |
| tertiary on surface-3 #1e232b | **4.97** |
| tertiary on surface-quote #131922 | **5.56** |
| tertiary on surface-4 #262c36 | 4.42 — but surface-4 is only used by `.skip-link`, which pairs it with `--text-primary` (11.98:1). Zero tertiary consumers land on surface-4. |
| conf-low on surface-3 | **6.03** |
| conf-low on surface-4 | **5.36** |

| Prev. | Status | Evidence |
|---|---|---|
| C1 tertiary contrast | ✅ | every real pairing ≥ 4.97:1 |
| C2 tablist arrows | ✅ | `handleTablistKey` (`App.tsx:203`) handles Arrow/Home/End; skips disabled Editor when no note |
| M1 `role="application"` | ✅ | 0 occurrences |
| M2 duplicate live region | ✅ (by deletion) | GlassBox removed; only `role="log"` is polite; reasoning panel `aria-live="off"` + `inert` when collapsed |
| M3 log echoes user msg | ⚠️ overshot — see **B2** |
| M4 storage popover focus | ✅ | `closeAndRestore()` returns focus to trigger on Esc/outside/action; first menu btn focused on open; downgraded to `role="group"` + `aria-haspopup="dialog"` |
| M5 focus after delete | ✅ | `handleDeleteNote` + `pendingFocus` (`App.tsx:139`) moves focus to next note item / New-note btn |
| M6 focus after empty-state new note | ✅ | `NoteEditor` `useLayoutEffect:44` focuses title for empty new note |
| M7 confidence colour-alone (summary) | ✅ | tier as text ("High/Medium/Low confidence" / "No match"); refusal uses ring vs. filled dot |
| M8 ranked colour-alone | ✅ | `.candidate__tier-text` visible + `aria-label` includes `{tier} confidence` |
| M9 untitled citations | ✅ | fallback `Jump to untitled note: {snippet}` |
| M10 conf-low on surface-4 | ✅ | 5.36:1 — **and I was wrong before**: with `#e58585` this pairing passes AA. My earlier 4.35 number was overstated. |
| M11 `window.confirm` | ✅ | 0 occurrences; ConfirmDialog in use (see B1) |
| m1 skip-link `tabIndex=-1` | ✅ |
| m2 boot h1/landmark | ✅ | boot state is `<main>` + sr-only `<h1>` |
| m3 persistent Conversation h2 | ✅ | `<h2 class="sr-only">Conversation</h2>` |
| m4 editor tags `role="group"` | ✅ |
| m5 msg intent aria-label | ✅ (by move) | intent chip lives in reasoning card now |
| m6 composer counter | ✅ | `aria-hidden="true"` |
| m7 44×44 hit area | AAA, unchanged, not blocking |
| m8 forced-colors focus | ✅ | `@media (forced-colors: active)` outline fallback in tokens.css |
| m9 conflict role=alert on load | ✅ | `seenConflictIdsRef` — only new conflicts are `alert`, pre-existing are `status` |
| m10 redundant `aria-live` on log | ✅ | removed |

---

## Part B — New findings

### B1. ConfirmDialog does not make background inert — **Major**
- **WCAG 4.1.2, 2.4.3** (modal-dialog contract)
- **File:** `src/components/ConfirmDialog.tsx:66–107`
- **Problem:** Tab trap works, but VoiceOver/NVDA virtual-cursor users can rotor/arrow into the notes rail, tabs, chat log, reasoning summaries, and skip link while the alertdialog is open. `aria-modal="true"` promises modality; nothing enforces it. Backdrop only intercepts mouse. No `inert` on siblings, no `aria-hidden` on the app root, no native `<dialog>`.
- **Fix:** on open, set `inert` on every sibling of `.confirm-backdrop` under `<body>` (or wrap the app and inert the wrapper). Remove on close. Cleaner: migrate to `<dialog>` + `showModal()` which gives inertness free.

### B2. User's own chat messages are removed from the AT tree — **Major**
- **WCAG 1.3.1, 4.1.2**
- **File:** `src/components/ChatMessage.tsx:21` — `<li className="msg msg--user" aria-hidden="true">`
- **Problem:** the fix for the old M3 (log announcing the echo) overshoots. SR users can no longer review their own questions when scrolling the transcript with browse-mode / heading nav. An answer that starts "Yes, on Tuesday" has no discoverable question above it, breaking the Q/A pairing for the users who most need to scroll back.
- **Fix:** stop suppressing the whole `<li>`. Options: (a) keep it accessible, drop `role="log"` from `<ol>`, add a small sr-only `aria-live="polite"` mirror inside each new assistant message that speaks only the answer summary; or (b) apply `aria-hidden="true"` only for the first ~500ms after mount and then strip it, so append-time announcements skip the echo but browse mode still finds it.

### B3. "Clear chat" restores focus to an unmounted button — **Major**
- **WCAG 2.4.3**
- **File:** `src/components/ChatPanel.tsx:118–128`
- **Problem:** `onConfirm` calls `onClear()` then `rAF(() => clearButtonRef.current?.focus())`. But `.chat__clear` renders only when `messages.length > 0`; after clear, ref is `null`, focus falls to `<body>`. Same failure mode as the prior M5.
- **Fix:** focus a persistent element — the composer textarea is the natural target: `document.getElementById('composer-input')?.focus()` inside the rAF.

### B4. Tab `aria-controls` targets an element that isn't in the DOM — **Minor**
- **WCAG 4.1.2**
- **File:** `src/App.tsx:312, 324` — tab `aria-controls` references `chat-panel` / `editor-panel`, but only the active panel is mounted (`:340,352`).
- **Fix:** render both panels always and toggle `hidden`, per the ARIA APG tab pattern. Otherwise drop the `aria-controls`.

### B5. Every assistant message emits a `role="region"` landmark — **Minor**
- **WCAG 1.3.1** (best practice; landmark noise)
- **File:** `src/components/ReasoningDisclosure.tsx:122` — `role="region" aria-label="Reasoning for this answer"` per message. In a 15-message chat, the SR landmarks list shows 15 identically-named regions, drowning out the real landmarks.
- **Fix:** use `role="group"` (labelable, not a landmark), or drop the role and rely on the disclosure button as the entry point.

### B6. CandidateRow coverage % is not in the accessible name — **Minor**
- **WCAG 1.1.1**
- **File:** `src/components/CandidateRow.tsx:72` — `<span aria-hidden="true">{coveragePct}% match</span>`, and `accessibleName()` (`:27`) does not include it.
- **Fix:** append `, coverage ${coveragePct}%` to the aria-label so SR users get the same "how much of the query this passage covered" signal.

### B7. Editor tabpanel has no accessible heading — **Minor**
- **WCAG 2.4.6**
- **File:** `src/components/NoteEditor.tsx:74` — `<section role="tabpanel" aria-labelledby="tab-editor">` labels itself "Editor" but has no `<h2>`; heading nav skips it. ChatPanel already does the right thing with sr-only "Conversation".
- **Fix:** add `<h2 className="sr-only">Editor</h2>` at the top of the section.

### B8. Reasoning panel briefly non-inert on first mount — **Minor / edge**
- **WCAG 4.1.3**
- **File:** `src/components/ReasoningDisclosure.tsx:38–44` — `inert` is applied by a `useEffect` after commit. Between commit and effect, the panel is in the DOM without `inert`, so some SRs may include the panel content in the polite append announcement for a new assistant message.
- **Fix:** render `inert` (and belt-and-braces `aria-hidden={!expanded}`) inline based on state, not imperatively.

### Confirmed correct on the new surface
- Disclosure: real `<button>`, `aria-expanded` + `aria-controls={useId()}`, chevron/dot/sep are `aria-hidden`, tier is text (WCAG 1.4.1 satisfied on collapsed row AND ranked list).
- `role="log"` is implicitly polite; `.reason__panel` is `aria-live="off"` and `inert` when collapsed → no wall-of-reasoning dump on message append (subject to B8's tiny window).
- Escape inside the panel collapses and returns focus to the summary button; `stopPropagation` is bounded to React synthetics so it doesn't clobber the window-level ConfirmDialog listener.
- ConfirmDialog initial focus lands on the SAFE action (Cancel), has `aria-modal`, `aria-labelledby`, `aria-describedby`, Tab trap, Escape cancel, outside-click cancel. NoteEditor caller restores focus to Delete on cancel.
- `prefers-reduced-motion`: the grid-rows height animation is genuinely suppressed. Global `*{ transition-duration: 0.01ms !important }` in tokens.css overrides the component's own reduced-motion opacity fade to also snap, and `.reason__panel-wrap { transition: none }` reinforces it. Content remains reachable in both modes.
- Old mobile "Glass" tab gone; no dead references; tablist keyboard model handles disabled-Editor correctly.
- Landmarks after removal of the third pane: still one `<main>`, one `<aside>` (Notes), one banner region as needed; no orphans.
- Heading hierarchy: h1 (sr-only "Glassbox: ask your notes") → h2 (Notes, Conversation) → h3 (Ranked passages, Why this ranking / Why nothing matched). Sane apart from B7.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| Major | 3 (B1, B2, B3) |
| Minor | 5 (B4–B8) |

**Shippability: not shippable as is — fix B1 and B2 before ship; B3 same-day; B4–B8 in the follow-up sprint.**

B1 (background not inert while alertdialog is open) is the only issue that actually prevents an AT user from completing a common flow safely. B2 (user messages removed from AT tree) is a well-intentioned regression that will be visible to anyone auditing with VoiceOver. B3 is a small focus bug on the Clear-chat path.

Both prior Criticals and all eleven prior Majors are genuinely resolved. The redesign to inline reasoning is, on net, an accessibility improvement over the old three-pane layout: fewer live regions, no `role="application"` weight, and the disclosure is the correct primitive for progressive disclosure of a reasoning trace.
