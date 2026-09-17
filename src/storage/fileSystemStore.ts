import type { Note } from '../types';
import type { NotesStore } from './types';
import { noteFilename, parseNote, serialiseNote } from './markdown';

/**
 * NotesStore over a FileSystemDirectoryHandle. One `.md` file per note,
 * identity carried in the frontmatter `id`, filename is a human-friendly
 * slug plus id. See glassbox-storage-architecture.md.
 *
 * Notes live in a `notes/` subfolder of the folder the user picked, and
 * conversations live beside them in `chats/`. Keeping them apart is not
 * tidiness. Every `.md` file in the scanned directory is read as a note, so a
 * transcript sharing that directory would be indexed and the retrieval engine
 * would start quoting the app's own past answers back as though the user had
 * written them.
 *
 * Two invariants that matter and are easy to break:
 *
 * 1. Writes must be serialised per file. `useNotes` already serialises per
 *    id; this store also handles the rename case: if a title changes, the
 *    new write goes to the new filename and the old file is deleted only
 *    AFTER the new write closes. A crash between them leaves both files;
 *    the next list() will union them and the newer wins.
 *
 * 2. Adoption is unioned, never blind-overwritten. A folder pre-populated by
 *    Obsidian, a git checkout, or the user's own editor is honoured. In a
 *    collision on `id`, the higher `updatedAt` wins.
 */

export const isFolderStoreSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export const NOTES_DIR = 'notes';

export const createFileSystemStore = (
  root: FileSystemDirectoryHandle
): NotesStore => {
  const filenamesById = new Map<string, string>();

  /* Resolved once and kept. Concurrent callers may each ask for it before the
     first resolves, which is harmless: getDirectoryHandle with create is
     idempotent. Caching the handle rather than the promise means a failure
     (permission revoked mid-session) is retried on the next call instead of
     being memoised forever. */
  let notesDir: FileSystemDirectoryHandle | null = null;
  const dir = async (): Promise<FileSystemDirectoryHandle> => {
    if (notesDir) return notesDir;
    notesDir = await root.getDirectoryHandle(NOTES_DIR, { create: true });
    return notesDir;
  };

  const readFile = async (
    fileHandle: FileSystemFileHandle
  ): Promise<{ note: Note; filename: string } | null> => {
    let file: File;
    try {
      file = await fileHandle.getFile();
    } catch {
      return null;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      return null;
    }
    const result = parseNote(text);
    if (!result.ok) return null;

    const fallbackIso = new Date(file.lastModified).toISOString();
    const note: Note = {
      ...result.note,
      createdAt: result.note.createdAt || fallbackIso,
      updatedAt: result.note.updatedAt || fallbackIso,
    };
    return { note, filename: fileHandle.name };
  };

  const READ_BATCH = 24;

  const list = async (): Promise<Note[]> => {
    const byId = new Map<string, { note: Note; filename: string }>();
    const handle = await dir();

    const entries: FileSystemFileHandle[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      entries.push(entry as FileSystemFileHandle);
    }

    // Read in parallel batches rather than one file at a time. Every note is
    // read on open, so with a library of several hundred the per-file latency
    // was multiplying by the size of the collection and showing up as a pause
    // before anything appeared. The batch is bounded because a few hundred
    // simultaneous file handles is its own kind of rude.
    const parsedEntries: Array<Awaited<ReturnType<typeof readFile>>> = [];
    for (let i = 0; i < entries.length; i += READ_BATCH) {
      parsedEntries.push(...(await Promise.all(entries.slice(i, i + READ_BATCH).map(readFile))));
    }

    // Kept as a separate pass so the newest-wins rule still sees the files in
    // directory order, exactly as the sequential version did.
    for (const parsed of parsedEntries) {
      if (!parsed) continue;
      const existing = byId.get(parsed.note.id);
      if (!existing || parsed.note.updatedAt > existing.note.updatedAt) {
        byId.set(parsed.note.id, parsed);
      }
    }

    filenamesById.clear();
    const notes: Note[] = [];
    for (const { note, filename } of byId.values()) {
      filenamesById.set(note.id, filename);
      notes.push(note);
    }
    return notes;
  };

  const writeFile = async (name: string, contents: string): Promise<void> => {
    const fileHandle = await (await dir()).getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }
  };

  const put = async (note: Note): Promise<void> => {
    const newName = noteFilename(note);
    const oldName = filenamesById.get(note.id);
    const contents = serialiseNote(note);

    await writeFile(newName, contents);
    filenamesById.set(note.id, newName);

    if (oldName && oldName !== newName) {
      try {
        await (await dir()).removeEntry(oldName);
      } catch {
        // The old file may already be gone (external delete, or a previous
        // rename that finished halfway). Nothing to do.
      }
    }
  };

  const remove = async (id: string): Promise<void> => {
    let name = filenamesById.get(id);
    if (!name) {
      // Cache cold: scan and populate. Cheaper on the second call.
      for await (const entry of (await dir()).values()) {
        if (entry.kind !== 'file') continue;
        if (!entry.name.toLowerCase().endsWith('.md')) continue;
        const parsed = await readFile(entry);
        if (parsed && parsed.note.id === id) {
          name = entry.name;
          break;
        }
      }
    }
    if (!name) return;

    try {
      await (await dir()).removeEntry(name);
    } catch {
      // Unknown id or already deleted. Silent by contract.
    }
    filenamesById.delete(id);
  };

  return {
    kind: 'folder',
    /* The folder the user picked, not the notes/ subfolder inside it. This is
       the name shown back to them as the connected folder. */
    label: root.name,
    isAvailable: isFolderStoreSupported,
    list,
    put,
    remove,
  };
};
