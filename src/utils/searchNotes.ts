import type { Note } from "../types";

export interface TextPart {
  text: string;
  hit: boolean;
}

/** Lower-cased and trimmed, so surrounding spaces never turn into a search. */
export const normalizeQuery = (query: string): string =>
  query.trim().toLowerCase();

/** Case-insensitive substring match on title, body and tags. `query` is
    expected already normalised. */
export const noteMatches = (note: Note, query: string): boolean => {
  if (!query) return false;
  return (
    note.title.toLowerCase().includes(query) ||
    note.body.toLowerCase().includes(query) ||
    note.tags.join(" ").toLowerCase().includes(query)
  );
};

const time = (note: Note): number => {
  const t = new Date(note.createdAt).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/** Every note that matches, newest first by createdAt, with undated notes
    last. An empty query matches nothing. */
export const searchNotes = (notes: readonly Note[], query: string): Note[] => {
  const q = normalizeQuery(query);
  if (!q) return [];
  return notes
    .filter((note) => noteMatches(note, q))
    .sort((a, b) => time(b) - time(a));
};

export const titleHasHit = (note: Note, query: string): boolean => {
  const q = normalizeQuery(query);
  return q !== "" && note.title.toLowerCase().includes(q);
};

/** The text split into runs, with every occurrence of the query flagged. */
export const splitByHits = (text: string, query: string): TextPart[] => {
  const q = normalizeQuery(query);
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const parts: TextPart[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(q, from);
    if (at < 0) break;
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length > 0 ? parts : [{ text, hit: false }];
};

const LEAD = 40;
const WINDOW = 110;

/**
 * One line of body around the first hit: about 40 characters before it, 110 in
 * all, with an ellipsis at whichever end was cut. Null when the body has no
 * hit, so a tag-only match shows no snippet.
 */
export const bodySnippet = (note: Note, query: string): string | null => {
  const q = normalizeQuery(query);
  if (!q) return null;
  const flat = note.body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(q);
  if (at < 0) return null;
  const start = Math.max(0, at - LEAD);
  const end = Math.max(start + WINDOW, at + q.length);
  return (
    (start > 0 ? "… " : "") +
    flat.slice(start, end).trim() +
    (end < flat.length ? " …" : "")
  );
};

/** "June 15, 2026", or empty when the date cannot be read. */
export const fullDateOf = (note: Note): string => {
  const d = new Date(note.createdAt);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
};
