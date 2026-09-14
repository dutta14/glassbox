import type { Note } from '../types';
import type { NotesStore } from './types';
import { noteFilename, parseNote, serialiseNote } from './markdown';

/**
 * NotesStore over a FileSystemDirectoryHandle. One `.md` file per note,
 * identity carried in the frontmatter `id`, filename is a human-friendly
 * slug plus id. See glassbox-storage-architecture.md.
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

export const createFileSystemStore = (
  handle: FileSystemDirectoryHandle
): NotesStore => {
  const filenamesById = new Map<string, string>();

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

  const list = async (): Promise<Note[]> => {
    const byId = new Map<string, { note: Note; filename: string }>();

    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;

      const parsed = await readFile(entry);
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
    const fileHandle = await handle.getFileHandle(name, { create: true });
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
        await handle.removeEntry(oldName);
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
      for await (const entry of handle.values()) {
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
      await handle.removeEntry(name);
    } catch {
      // Unknown id or already deleted. Silent by contract.
    }
    filenamesById.delete(id);
  };

  return {
    kind: 'folder',
    label: handle.name,
    isAvailable: isFolderStoreSupported,
    list,
    put,
    remove,
  };
};
