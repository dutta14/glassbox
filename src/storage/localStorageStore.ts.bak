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

    // Reads from memory in one go, so there is no progress to report. The
    // callback still fires once, so callers that render from batches behave
    // the same on either backend rather than only being exercised on disk.
    list: async (onBatch?: (notes: Note[]) => void): Promise<Note[]> => {
      const notes = readAll();
      if (onBatch && notes.length > 0) {
        try {
          onBatch(notes);
        } catch {
          /* Progress is advisory. A crash while drawing must not cost the
             reader their library, so the full list is still returned. */
        }
      }
      return notes;
    },

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
