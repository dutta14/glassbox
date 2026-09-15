# Glassbox storage architecture: local folder persistence

Author: Alex (Staff Architect)
Status: approved by Anindya, not yet implemented

## Decision

Notes are stored as **one Markdown file per note in a real folder on disk**, chosen by
the user through the File System Access API. The user syncs that folder to Google Drive
themselves through the Drive desktop client. The app knows nothing about Drive.

Chrome and Edge only. This is an accepted constraint, chosen deliberately.

## Why a folder of files rather than one JSON blob

Google Drive resolves conflicts per file. If the whole library is one `notes.json`, then
editing note A on the laptop and note B on the desktop produces a conflicted copy of the
entire library and one machine's work is lost. With one file per note, those two edits
touch different files and both survive.

It also means the notes remain useful without this app. They are plain Markdown with
YAML frontmatter, readable in any text editor, greppable, diffable, and compatible with
Obsidian and similar tools. A notes app that traps your notes in its own format is a
notes app you cannot leave.

## File format

Filename: `<slug-of-title>-<short-id>.md`, for example `postgres-index-tuning-k3f9a2.md`.
The slug is for humans browsing the folder. The id suffix guarantees uniqueness when two
notes share a title and survives retitling.

```markdown
---
id: k3f9a2mq-x1
title: Postgres index tuning
tags: [postgres, performance]
createdAt: 2026-09-04T17:00:00.000Z
updatedAt: 2026-09-07T17:00:00.000Z
---

Body text starts here.
```

`id` is the source of truth for identity, never the filename. A user renaming a file in
Finder must not create a duplicate note.

## Module boundaries

```
src/storage/
  types.ts            NotesStore interface
  localStorageStore.ts   existing behaviour, default and fallback
  fileSystemStore.ts     directory handle, one file per note
  markdown.ts            serialise / parse frontmatter, no dependencies
  handleStore.ts         persists the FileSystemDirectoryHandle in IndexedDB
```

```ts
export interface NotesStore {
  readonly kind: 'local' | 'folder';
  readonly label: string;          // shown in the UI, e.g. the folder name
  list(): Promise<Note[]>;
  put(note: Note): Promise<void>;  // create or update, one file write
  remove(id: string): Promise<void>;
  isAvailable(): boolean;
}
```

`put` and `remove` are per-note on purpose. A whole-library `save(notes)` would rewrite
every file on every keystroke, which would make Drive sync thrash and would lose the
per-file conflict benefit described above.

The engine never imports any of this. `useNotes` is the only consumer.

## Handle persistence and permissions

The `FileSystemDirectoryHandle` is stored in IndexedDB, because it is a structured-clone
object and cannot go in localStorage.

On reload, Chrome does not automatically restore write permission. The sequence is:

1. Read the handle from IndexedDB.
2. `handle.queryPermission({ mode: 'readwrite' })`.
3. If `granted`, use it silently.
4. If `prompt`, the app must NOT call `requestPermission` on load. Chrome requires a
   user gesture. Show a "Reconnect folder" button and call it from the click handler.
5. If `denied`, fall back to localStorage and tell the user plainly.

This is the single most common way File System Access integrations break. Getting it
wrong produces an app that silently stops saving after a reload.

## Migration

On first connecting a folder, if localStorage holds notes, write all of them into the
folder, then mark localStorage as migrated. Do not delete the localStorage copy
immediately; keep it as a fallback for one release. Never silently discard user data
because a write to a new backend appeared to succeed.

If the chosen folder already contains `.md` files, adopt them rather than overwriting.
Union by `id`; for a collision, last-write-wins on `updatedAt`.

## Deletion and tombstones

Deleting a note deletes its file. No tombstone file is needed here, because there is
exactly one folder and it is the source of truth. Tombstones would only be required if
we were merging two independent replicas, which we are not: Drive gives us a single
synced folder, not multi-master replication.

The consequence to accept: if Drive has not finished syncing a delete and the user opens
the app on another machine, the file reappears until sync completes. This is Drive's
behaviour and the app should not try to out-clever it.

## Reload and external edits

The folder can change underneath the app, either from Drive syncing or the user editing a
file in another editor. The app re-reads the folder on window focus and reconciles by
`updatedAt`. If a note changed on disk while it was open and dirty in the editor, prefer
the in-memory version and warn. Silent data loss is worse than a warning.

## What this does not solve

No real-time collaboration. No merge of concurrent edits to the same note; Drive will
produce a conflicted copy and the user resolves it. Both are acceptable for a personal
notes app and neither is worth a backend.

## Risks

- The async refactor of `useNotes` touches every caller. Do it before more UI lands.
- Autosave must be debounced and must not write while a previous write is in flight, or
  Chrome will queue writes and the file can end up truncated. Serialise writes per note.
- `showDirectoryPicker` requires a user gesture and a secure context. GitHub Pages is
  HTTPS, so production is fine; `localhost` is also a secure context.
