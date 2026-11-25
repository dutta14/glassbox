import type { Book, Note } from "../types";
import { UNDATED, yearKeyOf } from "./groupByYear";

const timeOf = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
};

interface Keyed {
  book: Book;
  empty: boolean;
  /** Last year among the chapters' written dates, or null with none readable. */
  endYear: number | null;
  /** Latest written date, in ms. -Infinity when none is readable. */
  latest: number;
}

const keyOf = (book: Book, noteById: ReadonlyMap<string, Note>): Keyed => {
  let endYear: number | null = null;
  let latest = -Infinity;
  for (const id of book.chapterIds) {
    const note = noteById.get(id);
    if (!note) continue;
    const year = yearKeyOf(note);
    if (year === UNDATED) continue;
    endYear = endYear === null ? Number(year) : Math.max(endYear, Number(year));
    latest = Math.max(latest, timeOf(note.createdAt));
  }
  return { book, empty: book.chapterIds.length === 0, endYear, latest };
};

/**
 * The rail's Collections order. Empty collections first, newest created first,
 * so one just made stays where it was left. Then by end year, newest first (the
 * last year in the "YYYY–YYYY" on the row), ties broken by the latest written
 * date, then by title. A collection whose chapters have no readable date has
 * no end year and follows those that do.
 */
export const orderCollections = (
  books: readonly Book[],
  notes: readonly Note[],
): Book[] => {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const byTitle = (a: Keyed, b: Keyed) =>
    a.book.title.localeCompare(b.book.title);

  return books
    .map((book) => keyOf(book, noteById))
    .sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? -1 : 1;
      if (a.empty) {
        const created = timeOf(b.book.createdAt) - timeOf(a.book.createdAt);
        return created !== 0 && !Number.isNaN(created)
          ? created
          : byTitle(a, b);
      }
      if ((a.endYear === null) !== (b.endYear === null)) {
        return a.endYear === null ? 1 : -1;
      }
      if (a.endYear !== null && b.endYear !== null) {
        if (a.endYear !== b.endYear) return b.endYear - a.endYear;
        if (a.latest !== b.latest) return b.latest - a.latest;
      }
      return byTitle(a, b);
    })
    .map(({ book }) => book);
};
