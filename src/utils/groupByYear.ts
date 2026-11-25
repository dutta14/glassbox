import type { Note } from "../types";

export const UNDATED = "Undated";

export interface YearGroup {
  /** The year as text, or UNDATED. Doubles as the fold key. */
  key: string;
  notes: Note[];
}

const parse = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Year of createdAt in the reader's own calendar, or UNDATED when the stamp
    is missing or unreadable. */
export const yearKeyOf = (note: Note): string => {
  const d = parse(note.createdAt);
  return d ? String(d.getFullYear()) : UNDATED;
};

/** "June 15". The year is the heading above the row, so it is left off. Empty
    for a note with no valid date, so its row simply has no date line. */
export const monthDayOf = (note: Note): string => {
  const d = parse(note.createdAt);
  return d
    ? d.toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : "";
};

/**
 * Years newest first, notes within a year newest first, and the undated
 * notes last in the order they came in. Never a fake year for a bad date.
 */
export const groupByYear = (notes: readonly Note[]): YearGroup[] => {
  const byYear = new Map<string, Note[]>();
  for (const note of notes) {
    const key = yearKeyOf(note);
    const bucket = byYear.get(key);
    if (bucket) bucket.push(note);
    else byYear.set(key, [note]);
  }

  const time = (note: Note) => new Date(note.createdAt).getTime();
  const dated = [...byYear.entries()]
    .filter(([key]) => key !== UNDATED)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([key, items]) => ({
      key,
      notes: [...items].sort((a, b) => time(b) - time(a)),
    }));

  const undated = byYear.get(UNDATED);
  return undated ? [...dated, { key: UNDATED, notes: undated }] : dated;
};
