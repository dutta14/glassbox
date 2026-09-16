# Glassbox — PM Spec (Morgan)

## Goal
Let the user ask questions about their own notes and get back the exact passage they
wrote, with the retrieval reasoning visible, so they can trust every answer.

## Acceptance criteria

### Note CRUD
1. "New note" button creates a note with empty title/body, focuses the title field.
2. Typing autosaves within 500ms of last keystroke. No save button.
3. Sidebar shows title (or "Untitled") and updatedAt, sorted by updatedAt descending.
4. Note deletable from a per-note control; deletion asks for confirmation.
5. Tags entered as #word tokens inside the body; extracted into tags[] on save.
6. Notes persist to localStorage and reload on refresh.

### Chat / ask flow
7. Chat input accepts up to 2000 chars. Enter submits, Shift+Enter inserts newline.
8. Submitting appends a user message, then an assistant message.
9. Every assistant search answer renders the quoted passage verbatim, the source note
   title, and a "Jump to note" control that opens that note in the editor.
10. An assistant message NEVER contains text that was not either (a) typed by the user
    in a note, or (b) one of the fixed strings in src/engine/copy.ts.

### Glass box panel
11. Every assistant message has a "Show reasoning" toggle. Expanded it shows: matched
    intent, confidence (2dp), stemmed query terms as chips, count of chunks considered,
    and top 5 candidates with scores.
12. Each candidate row shows rank, score (2dp), source note title, first 140 chars.
13. Collapsed by default, EXCEPT the first assistant message of a session, expanded.
14. Clicking a candidate row opens that note in the editor.

### Confidence gate
15. If the top candidate fails the gate, return the exact notFound copy and show NO
    quoted passage. (Gate logic is owned by the engine, see router.ts GATE.)
16. Below the gate, the reasoning panel STILL renders and still lists the candidates
    with their sub-threshold scores, so the user can see why it refused.

### Intent routing
17. Intents: search, count, recent, tag, greeting, help, unknown. Always shown in panel.
18. count returns a deterministic integer response.
19. recent supports today / yesterday / this week / last week / this month.
20. tag triggers on #word, returns notes whose tags include it.
21. greeting and help return canned strings and skip retrieval.
22. unknown returns the unknown string and skips retrieval.

### Persistence
23. Notes persist across reloads. Conversations persist too.
24. Superseded by the conversations spec. "Clear chat" is removed. A chat is
    no longer a single transcript to empty, so the equivalent actions are
    starting a new chat and deleting one. See `conversations-pm-spec.md`.
25. If localStorage is unavailable, show a non-blocking banner and run in-memory.

## Edge cases
- Zero notes: chat input disabled with placeholder "Add a note first".
- One note: retrieval runs; the gate does the work.
- Note with empty body: title is still indexed.
- Query matches nothing: gate returns failure; panel shows sub-threshold candidates.
- Very long query: hard cap 2000 chars, counter appears at 1800+.
- Query of only stopwords: route to unknown, queryTerms: [].
- Duplicate notes: both indexed, both may appear as candidates. Correct, not a bug.
- Deleting a cited note: past messages keep their quoted text. "Jump to note" becomes
  disabled with tooltip "This note was deleted."
- Special characters: tokenizer splits on word boundaries, nothing crashes.

## Out of scope tonight
Editing past messages. A second search box in the sidebar. Rich text / markdown /
images. Folders, note linking, bulk operations. Export/import. Synonyms and spell
correction. Mobile polish (must not crash, need not be beautiful). Accounts/sync.
Answer templating of ANY kind, including "According to your note X..." connector prose.

## Resolved questions
1. SEED 5 sample notes on first run, tagged #sample, with a dismissible banner
   "These are sample notes so you can try the chat. Delete them anytime." and a
   "Delete all samples" action. An empty app demos nothing.
2. PERSIST chat history. The reasoning trace is the product; losing it on refresh
   destroys the trust story.
3. Quoted sources are FROZEN at cite time. Do not re-resolve. A transcript is a
   historical record. "Jump to note" resolves live and disables if the note is gone.
