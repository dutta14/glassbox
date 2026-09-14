import type { Note } from '../types';
import type { NotesStore } from './types';
import { loadNotes, saveNotes } from './notes';

/**
 * localStorage-backed NotesStore. This is the default and the fallback when
 * the browser has no File System Access API. Behaviour is identical to what
 * shipped before this refactor: a single JSON blob under
 * `glassbox.notes.v1`, rewritten on every put or remove.
 *
 * put and remove are per-note in the interface, but the underlying blob is
 * still whole-library. That is fine here because localStorage.setItem is
 * atomic and there is no partial-write risk. The folder store, where the
 * per-note guarantee actually matters, comes next.
 */

const isStorageAvailable = (): boolean => {
  try {
    const probe = '__glassbox_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
};

export const createLocalStorageStore = (): NotesStore => {
  const readAll = (): Note[] => loadNotes();

  const writeAll = (notes: Note[]): void => {
    saveNotes(notes);
  };

  return {
    kind: 'local',
    label: 'This browser',
    isAvailable: isStorageAvailable,

    list: async (): Promise<Note[]> => readAll(),

    put: async (note: Note): Promise<void> => {
      const notes = readAll();
      const idx = notes.findIndex((n) => n.id === note.id);
      if (idx >= 0) notes[idx] = note;
      else notes.push(note);
      writeAll(notes);
    },

    remove: async (id: string): Promise<void> => {
      const notes = readAll().filter((n) => n.id !== id);
      writeAll(notes);
    },
  };
};
