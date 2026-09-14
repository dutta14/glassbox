import type { Note } from '../types';
import type { NotesStore } from './types';

/**
 * Copy every note in `source` into `dest`, with `dest` taking priority on
 * collision. Concretely: notes in `source` are written to `dest` only if
 * `dest` does not already have that id, OR the source copy is newer.
 *
 * This is the shape needed both for migration (localStorage -> folder) and
 * for the reverse case (folder -> localStorage on disconnect). Neither side
 * is ever blindly overwritten.
 */
export const mergeStores = async (
  source: NotesStore,
  dest: NotesStore
): Promise<void> => {
  const [srcNotes, destNotes] = await Promise.all([source.list(), dest.list()]);
  const destById = new Map<string, Note>(destNotes.map((n) => [n.id, n]));

  for (const note of srcNotes) {
    const existing = destById.get(note.id);
    if (!existing || note.updatedAt > existing.updatedAt) {
      await dest.put(note);
    }
  }
};
