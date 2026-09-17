import { useMemo } from "react";
import type { Note } from "../types";

export interface NoteNeighbours {
  /** The note created before this one, reached by "Previous". */
  previous: Note | null;
  /** The note created after this one, reached by "Next". */
  next: Note | null;
}

/**
 * The notes either side of the open one, in the order they were written.
 *
 * Ordered by createdAt rather than by updatedAt, which is what the rail sorts
 * on. The rail's order is deliberately restless: it surfaces whatever you
 * touched last, so it reshuffles as you type. Navigation cannot work that way.
 * Keyed on updatedAt, a single keystroke would move the open note to the front,
 * making it the newest note and dropping its "Next" link mid-sentence.
 *
 * createdAt never changes, so the sequence is fixed and Previous still leads
 * where it led a moment ago.
 */
export const useNoteNeighbours = (
  notes: Note[],
  selectedId: string | null,
): NoteNeighbours =>
  useMemo(() => {
    if (selectedId === null) return { previous: null, next: null };

    // Newest first, matching how the rail and the blog both read. The id is a
    // tiebreak so notes created in the same millisecond still have one fixed
    // order rather than swapping between renders.
    const ordered = [...notes].sort(
      (x, y) =>
        y.createdAt.localeCompare(x.createdAt) || x.id.localeCompare(y.id),
    );

    const index = ordered.findIndex((note) => note.id === selectedId);
    if (index === -1) return { previous: null, next: null };

    return {
      previous: ordered[index + 1] ?? null,
      next: index > 0 ? ordered[index - 1] : null,
    };
  }, [notes, selectedId]);
