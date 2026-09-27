import type { Book, Note } from "../types";

/**
 * A shelf is not a list. It is a physical claim about the archive: this year
 * was thick, that one was thin, and you can see which is which from across the
 * room before you read a single word.
 *
 * Two things stand on the shelf. Books, which the writer bound on purpose, and
 * years, which are everything else that happened in those twelve months. A year
 * with no loose notes gets no volume, because an empty book on a shelf is a lie
 * about the archive rather than a fact about it.
 */
export interface Spine {
  kind: "book" | "year";
  /** A book id, or "year:2014". Stable enough to key a list and a route. */
  id: string;
  label: string;
  /** Notes bound into this volume. This is what thickness means. */
  count: number;
  /** Spine thickness in px. */
  width: number;
  /** Spine height in px, varied so the shelf does not look machine-cut. */
  height: number;
  /** Every note in it was machine-written. */
  ai: boolean;
  /** Index into the spine palette, stable per volume. */
  tone: number;
}

/** Thinnest a spine may be drawn. Below this the label stops being readable. */
const MIN_WIDTH = 20;
/** Thickest. A year of 131 notes should dominate, but not eat a whole shelf. */
const MAX_WIDTH = 76;
const MIN_HEIGHT = 152;
const MAX_HEIGHT = 192;

/**
 * Deterministic, so a volume keeps the same height and colour between renders.
 * Any cheap string hash would do; this one is only asked to scatter.
 */
const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const AI_TAG = "ai-generated";

/**
 * Thickness rises with the square root of the count, not the count itself.
 *
 * The archive is lopsided: one year holds 131 notes and another holds one. Left
 * linear, the small years collapse to a line you cannot click and cannot read.
 * The square root keeps the big year visibly the biggest while leaving the
 * quiet years thick enough to be a book.
 */
const widthFor = (count: number, largest: number): number => {
  if (largest <= 1) return MIN_WIDTH;
  const span = Math.sqrt(largest) - 1;
  const reach = span === 0 ? 0 : (Math.sqrt(Math.max(count, 1)) - 1) / span;
  return Math.round(MIN_WIDTH + reach * (MAX_WIDTH - MIN_WIDTH));
};

const heightFor = (id: string): number =>
  MIN_HEIGHT + (hash(id) % (MAX_HEIGHT - MIN_HEIGHT + 1));

const yearOf = (note: Note): string => note.createdAt.slice(0, 4);

const isAi = (note: Note): boolean => note.tags.includes(AI_TAG);

/**
 * Every spine in the archive, oldest first.
 *
 * Book membership comes from the books themselves. It is tempting to guess it
 * from note titles, and that guess is wrong by a wide margin: chapter titles
 * are not uniformly formatted, so a title pattern finds a small fraction of the
 * chapters actually bound. The books know which notes are theirs. Ask them.
 */
export const buildSpines = (notes: Note[], books: Book[]): Spine[] => {
  const byId = new Map(notes.map((note) => [note.id, note]));

  const bound = new Set<string>();
  for (const book of books) {
    for (const id of book.chapterIds) bound.add(id);
  }

  /* A book sorts by its earliest chapter, so it stands where it was written
     rather than where it happened to be created as a record. */
  const bookSpines = books.map((book) => {
    const chapters = book.chapterIds
      .map((id) => byId.get(id))
      .filter((note): note is Note => note !== undefined);
    const earliest = chapters.reduce(
      (soonest, note) => (note.createdAt < soonest ? note.createdAt : soonest),
      chapters[0]?.createdAt ?? "9999",
    );
    return {
      sortKey: earliest,
      kind: "book" as const,
      id: book.id,
      label: book.title.trim() || "Untitled",
      count: book.chapterIds.length,
      ai: chapters.length > 0 && chapters.every(isAi),
    };
  });

  /* Everything not bound into a book belongs to its year. */
  const loose = new Map<string, Note[]>();
  for (const note of notes) {
    if (bound.has(note.id)) continue;
    const year = yearOf(note);
    const group = loose.get(year);
    if (group) group.push(note);
    else loose.set(year, [note]);
  }

  const yearSpines = [...loose.entries()].map(([year, group]) => ({
    sortKey: year,
    kind: "year" as const,
    id: `year:${year}`,
    label: year,
    count: group.length,
    ai: group.every(isAi),
  }));

  const merged = [...bookSpines, ...yearSpines].sort((a, b) =>
    a.sortKey === b.sortKey
      ? a.id.localeCompare(b.id)
      : a.sortKey.localeCompare(b.sortKey),
  );

  const largest = merged.reduce((max, item) => Math.max(max, item.count), 0);

  return merged.map(({ sortKey: _sortKey, ...item }) => ({
    ...item,
    width: widthFor(item.count, largest),
    height: heightFor(item.id),
    tone: hash(item.id) % 9,
  }));
};

/**
 * Break the spines into shelves that fit the case.
 *
 * Books fill left to right and wrap when the next one will not fit, which is
 * what a shelf does. The last shelf is usually part empty. That is honest, and
 * it is also the only part of the picture that says there is room to grow.
 */
export const packShelves = (
  spines: Spine[],
  shelfWidth: number,
  gap = 2,
): Spine[][] => {
  if (shelfWidth <= 0) return spines.length > 0 ? [spines] : [];

  const shelves: Spine[][] = [];
  let current: Spine[] = [];
  let used = 0;

  for (const spine of spines) {
    const needs = current.length === 0 ? spine.width : spine.width + gap;
    if (current.length > 0 && used + needs > shelfWidth) {
      shelves.push(current);
      current = [spine];
      used = spine.width;
    } else {
      current.push(spine);
      used += needs;
    }
  }
  if (current.length > 0) shelves.push(current);
  return shelves;
};

/**
 * How far the last book on a shelf may lean into the gap beside it.
 *
 * A book next to a gap does not fall into the gap. It slides its base out and
 * rests its top against its neighbour, so it leans away from the gap, not
 * toward it. Only worth drawing when the gap is wide enough to be obvious.
 */
export const LEAN_DEGREES = -10;
const LEAN_MIN_GAP = 46;

export const leanOffset = (
  shelf: Spine[],
  shelfWidth: number,
  gap = 2,
): number | null => {
  if (shelf.length < 2) return null;
  const used = shelf.reduce(
    (total, spine, index) => total + spine.width + (index === 0 ? 0 : gap),
    0,
  );
  if (shelfWidth - used < LEAN_MIN_GAP) return null;
  const last = shelf[shelf.length - 1];
  /* Rotating about the corner that touches the board swings the book sideways;
     slide it back by that much so its top rests on the neighbour instead of
     overlapping it. */
  return Math.round(last.height * Math.sin((-LEAN_DEGREES * Math.PI) / 180));
};
