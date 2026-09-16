# Glassbox Conversations PM Spec

## Goal
Let users keep separate chat transcripts for different lines of thinking, while preserving the promise that every answer is a quote from something they wrote.

## User stories
1. As a user, I want each new line of questioning to live in its own conversation, so that old answers do not mix with my current task.
2. As a user, I want the first prompt to title the conversation, so that I can recognize the chat without the app inventing a summary.
3. As a user, I want conversations listed beside my notes, so that I can switch between notes and chats from one place.
4. As a user, I want to delete conversations one at a time, so that I can remove old transcripts without touching my notes.
5. As a keyboard-only user, I want focus to move to a predictable rail item after deletion, so that I never lose my place.
6. As a screen reader user, I want active chat, active note, deleted note, and load error states announced clearly, so that I understand what changed.
7. As a user without a connected folder, I want conversations to keep working in browser storage, so that I can use Glassbox before choosing a folder.

## Acceptance criteria

### Conversations model and creation
26. A conversation record is created only when the user submits the first valid prompt in a draft chat.
27. Clicking the rail entry labelled "New chat" opens a draft chat with no active conversation id and no saved conversation record.
28. Clicking "New chat" while already viewing an unsent draft leaves the composer text unchanged and creates no record.
29. Clicking a note while viewing an unsent draft abandons that draft. Clicking "New chat" again opens an empty composer.
30. Submitting the first prompt in a draft creates one conversation, appends the user message and assistant message to it, and makes that conversation active.
31. Submitting later prompts while a saved conversation is active appends messages only to that active conversation.
32. The conversation title is the first submitted prompt after the existing composer trim behavior. The stored title is the submitted text with no generated wording.
33. Conversation ids are generated independently of titles. File names use the conversation id, so title characters never affect disk paths.
34. Conversations are sorted in the rail by updatedAt descending. A conversation moves to the top after a new prompt is submitted to it.
35. Two conversations may have identical titles. Both are shown as separate rows with their own updated time.

### Rail layout and active state
36. The left rail contains one shared scroll area with the Chats section above the Notes section.
37. The "New chat" entry appears at the top of the Chats section and is always visible when the rail is expanded.
38. A draft with no messages appears only as the active "New chat" entry. It does not create a conversation row.
39. When there are no saved conversations, the Chats section shows the empty state copy from the content spec below.
40. A saved active conversation row uses the same selected-row treatment as an active note row and sets `aria-current="true"`.
41. When a saved conversation or draft chat is active, no note row is visually selected and no note row has `aria-current`.
42. When a note is active, no conversation row and no "New chat" entry has `aria-current`.
43. Conversation rows expose a per-row delete control using the same menu pattern as note rows.
44. The rail remains usable when the Chats and Notes sections together exceed the viewport height. There is one scrollbar for both sections.

### Replaces existing AC 24
24. Replacement: Deleting a conversation removes only that conversation after confirmation. Notes and other conversations remain unchanged.

### Deletion behavior
45. Selecting delete on a conversation opens a confirm dialog before anything is removed.
46. Confirming deletion removes the conversation from persistent storage and from the rail.
47. Canceling deletion keeps the conversation unchanged and returns focus to the delete control that opened the dialog.
48. If the deleted conversation is currently active, the next conversation in the current sorted list becomes active. If there is no next conversation, the previous conversation becomes active. If there are no conversations left, the app opens the draft chat state.
49. After deleting the active conversation, keyboard focus moves to the newly active conversation row. If no conversation remains, focus moves to "New chat".
50. If the deleted conversation is not active, the current main panel stays unchanged.
51. After deleting a conversation that was not active, keyboard focus moves to the nearest remaining conversation row at the deleted row's position. If there is no remaining conversation, focus moves to "New chat".
52. Focus must never fall to `<body>` after a conversation delete.
53. The old "Clear chat" button is removed from the chat panel and cannot be reached by pointer, keyboard, or screen reader.

### Persistence
54. When a folder is connected, conversations persist as JSON files in a `chats/` subfolder of the selected folder.
55. When a folder is connected, notes are read from and written to a `notes/` subfolder of the selected folder.
56. When no folder is connected, conversations persist to localStorage under the new conversations storage key.
57. The old localStorage transcript is ignored. It is not migrated into a conversation and it is not shown.
58. If localStorage is unavailable, conversations work in memory for the current session and the existing storage warning behavior is shown.
59. A malformed conversation file or malformed localStorage conversation entry is skipped during load. The app continues loading valid conversations.
60. If one or more conversations are skipped because they are malformed, the app shows the warning copy from the content spec below.
61. A valid conversation file must contain id, title, messages, createdAt, and updatedAt with the expected types. Messages use the same strict validation as the existing chat transcript.

### Titles and display limits
62. The composer continues to reject whitespace-only prompts. A whitespace-only prompt cannot create a conversation.
63. A punctuation-only prompt is valid if it passes the existing composer trim behavior. It becomes the stored title.
64. Conversation row title text is rendered on one line with truncation in the rail.
65. The full title is available to assistive technology through the row's accessible name.
66. Newlines in the first prompt are preserved in the stored title. In rail display and accessible names, newline characters are collapsed to single spaces.
67. If a conversation title is missing, not a string, or blank after trimming because of hand editing, the row uses the fallback title from the content spec.

### Source links in old conversations
68. Past assistant messages keep their quoted text even if the cited note is later deleted.
69. If a cited note still exists, clicking "Jump to note" opens that note in the editor and clears any active conversation highlight.
70. If a cited note was deleted, the source control is disabled when possible and exposes the deleted-note copy from the content spec.
71. If a stale source click happens before the disabled state updates, the app stays on the current conversation and announces the deleted-note copy from the content spec.
72. Silent failure is not acceptable for a deleted source.

## Content spec

### Rail
- Chats section heading: "Chats"
- New draft entry label: "New chat"
- Empty chats title: "No chats yet"
- Empty chats body: "Ask a question to start a chat."
- Conversation fallback title: "Untitled chat"
- Conversation row secondary prefix: "Updated "

### Delete conversation confirm dialog
- Title template: `Delete "{conversationTitle}"?`
- Body: "This deletes this conversation. Your notes stay unchanged."
- Confirm button: "Delete"
- Cancel button: "Cancel"

### Source and status text
- Deleted source tooltip and disabled label: "This note was deleted."
- Deleted source live announcement: "This note was deleted."
- Malformed conversations warning: "Some chats could not be loaded."
- Draft opened announcement: "New chat ready."
- Conversation deleted announcement: "Chat deleted."
- Active conversation announcement template: `Chat opened: {conversationTitle}`

## Edge cases
1. Clicking "New chat" while already in an unsent draft with typed text keeps the typed text. The action is a no-op because the user is already in the fresh draft state.
2. Clicking a note while in an unsent draft abandons the draft text. Returning with "New chat" opens an empty composer.
3. A draft with no messages creates no rail row. The "New chat" entry is marked active.
4. A saved active conversation is indicated with the active row style and `aria-current="true"`. While any chat is active, note highlight is cleared.
5. Deleting the active conversation selects the next conversation, then the previous conversation, then the draft state. Focus follows the selected conversation row or the "New chat" entry.
6. Deleting a conversation that is not active leaves the viewed conversation or note unchanged. Focus moves to the nearest remaining chat row or to "New chat".
7. With no conversations, the Chats section shows "No chats yet" and "Ask a question to start a chat." The "New chat" entry remains available.
8. Clicking a source whose note was deleted tells the user "This note was deleted." The app does not silently ignore the click.
9. Very long first prompts are stored as submitted up to the existing 2000 character limit. Rail display truncates visually to one line.
10. Whitespace-only prompts cannot be submitted. They create no conversation.
11. Punctuation-only prompts can be submitted. The punctuation becomes the title.
12. First prompts with newlines are stored with newlines. Rail display collapses them to spaces so the row stays one line.
13. First prompts with characters unsafe for filenames are safe because the filename is based on id, not title.
14. Identical first prompts create identical visible titles. The user distinguishes them by updated time, position, active state, and transcript content after opening.
15. Corrupt or hand-edited invalid JSON conversation files are skipped. Valid chats still load, and the warning "Some chats could not be loaded." is shown.
16. With no folder connected, conversations use localStorage. If localStorage fails, they remain available only until refresh, matching the existing in-memory fallback behavior.
17. Existing old transcript data under `glassbox.chat.v1` is dropped from the product experience. It is neither read nor deleted by this feature.

## Out of scope
- Renaming conversations.
- Generated conversation titles.
- Conversation search.
- Pinned conversations.
- Exporting conversations.
- Sharing conversations.
- Multi-select delete.
- Undo after delete.
- Migrating old localStorage transcripts.
- Migrating existing root-level notes into `notes/`.
- Moving files for the user.
- Editing past messages.
- Branching a conversation from an old message.
- Per-conversation draft preservation after leaving the draft for a note.
- Sync, accounts, or cloud storage.

## Open questions
None. The founder and architect decisions above are sufficient for engineering and QA to proceed.
