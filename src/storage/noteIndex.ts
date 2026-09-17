import type { NoteMeta, Note, NoteFormat } from '../types';

/**
 * A sidecar index of what is in the notes folder.
 *
 * Without it, opening the app means reading every note file just to draw a
 * list of titles, which scales with the size of the library rather than with
 * what the reader is actually looking at. With it, opening reads one file.
 *
 * It lives beside `notes/` rather than inside it, because the folder note
 * store treats every file it finds in `notes/` as a note, and an index sitting
 * among them would be one bad glob away from being quoted back at the user as
 * their own writing.
 *
 * It is a cache, never the source of truth. The markdown files are the record.
 * Anything unreadable here is discarded and rebuilt from the files themselves,
 * so a corrupt or truncated index costs a slow load, never a lost note.
 */
export const INDEX_FILENAME = 'glassbox-index.json';

/** Bumped when the entry shape changes. A mismatch rebuilds rather than guesses. */
export const INDEX_VERSION = 1;

const isFormat = (value: unknown): value is NoteFormat => value === 'prose' || value === 'verse';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Drop the body, remember where the note came from.
 *
 * `format` is omitted when it is the default, because absent already means
 * prose everywhere else in the app and the index is a derived cache with no
 * round trip to preserve. Written out, it would repeat itself once per note
 * across a library of several hundred to say nothing.
 */
export const toMeta = (note: Note, filename: string): NoteMeta => {
  const { title, id, tags, createdAt, updatedAt, format } = note;
  return {
    id,
    title,
    tags,
    createdAt,
    updatedAt,
    filename,
    ...(format && format !== 'prose' ? { format } : {}),
  };
};

export const serialiseIndex = (entries: NoteMeta[]): string =>
  `${JSON.stringify({ version: INDEX_VERSION, entries }, null, 2)}\n`;

/**
 * Read one entry, or null if it could not be trusted.
 *
 * An entry missing an id or a filename is unusable: there would be no way to
 * fetch the note it claims to describe. Softer fields are defaulted, because a
 * note with a missing title should still appear in the list where the reader
 * can find and fix it.
 */
const parseEntry = (value: unknown): NoteMeta | null => {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.filename)) return null;

  return {
    id: entry.id,
    filename: entry.filename,
    title: typeof entry.title === 'string' ? entry.title : '',
    tags: Array.isArray(entry.tags) ? entry.tags.filter(isNonEmptyString) : [],
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    ...(isFormat(entry.format) ? { format: entry.format } : {}),
  };
};

/**
 * Parse a whole index, or null when it cannot be used at all.
 *
 * Null means "rebuild from the files". That is the safe direction: the cost is
 * one slow load, and the alternative is showing the reader a library that does
 * not match what is on their disk.
 */
export const parseIndex = (text: string): NoteMeta[] | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const { version, entries } = raw as { version?: unknown; entries?: unknown };
  if (version !== INDEX_VERSION) return null;
  if (!Array.isArray(entries)) return null;

  const parsed = entries.map(parseEntry).filter((entry): entry is NoteMeta => entry !== null);

  // Two files can claim the same id, usually because a sync tool copied one.
  // Newest wins, matching how the folder store resolves the same collision.
  const byId = new Map<string, NoteMeta>();
  for (const entry of parsed) {
    const existing = byId.get(entry.id);
    if (!existing || entry.updatedAt > existing.updatedAt) byId.set(entry.id, entry);
  }
  return [...byId.values()];
};
