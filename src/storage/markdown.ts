import type { Note } from '../types';

/**
 * Markdown + YAML-frontmatter (de)serialiser. Zero dependencies.
 *
 * The frontmatter shape is fixed and small: five keys, always emitted in the
 * same order, always with the same encoding. That makes the parser strict but
 * predictable, which is what a persistence layer wants.
 *
 * String values (title) and array-of-string values (tags) are always emitted
 * as JSON literals. That way a title containing a colon, a quote, or a
 * newline round-trips through JSON.parse without needing a real YAML engine,
 * and it is still readable in an editor. id, createdAt, updatedAt are bare
 * because their character sets are constrained.
 *
 * Body is everything after the closing `---` line and one optional blank
 * separator line. A body may itself contain a line of three dashes: only the
 * first `---` after the opening one closes the frontmatter, so that is safe.
 */

const FM_OPEN = '---\n';
const FM_CLOSE = '\n---';

/** Round-trip invariant: parse(serialise(note)) deepEquals note. */
export const serialiseNote = (note: Note): string => {
  const lines = [
    '---',
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `tags: ${JSON.stringify(note.tags)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
    '',
    note.body,
  ];
  return lines.join('\n');
};

export interface ParseResult {
  ok: true;
  note: Note;
}

export interface ParseError {
  ok: false;
  error: string;
}

export const parseNote = (text: string): ParseResult | ParseError => {
  if (!text.startsWith(FM_OPEN)) {
    return { ok: false, error: 'missing opening frontmatter delimiter' };
  }

  const afterOpen = text.slice(FM_OPEN.length);
  const closeIndex = findFrontmatterClose(afterOpen);
  if (closeIndex === -1) {
    return { ok: false, error: 'missing closing frontmatter delimiter' };
  }

  const frontmatter = afterOpen.slice(0, closeIndex);
  let rest = afterOpen.slice(closeIndex + FM_CLOSE.length);
  if (rest.startsWith('\n')) rest = rest.slice(1);
  if (rest.startsWith('\n')) rest = rest.slice(1);
  const body = rest;

  const fields: Record<string, string> = {};
  for (const raw of frontmatter.split('\n')) {
    if (raw.trim() === '') continue;
    const colon = raw.indexOf(':');
    if (colon === -1) {
      return { ok: false, error: `malformed frontmatter line: ${raw}` };
    }
    const key = raw.slice(0, colon).trim();
    const value = raw.slice(colon + 1).trim();
    fields[key] = value;
  }

  const id = fields.id;
  if (!id) return { ok: false, error: 'missing id' };

  const title = parseJsonString(fields.title, 'title');
  if (typeof title !== 'string') return title;

  const tags = parseJsonStringArray(fields.tags, 'tags');
  if (!Array.isArray(tags)) return tags;

  const createdAtRaw = fields.createdAt;
  if (!createdAtRaw) return { ok: false, error: 'missing createdAt' };

  const updatedAtRaw = fields.updatedAt;
  if (!updatedAtRaw) return { ok: false, error: 'missing updatedAt' };

  const createdAt = normaliseDate(createdAtRaw);
  const updatedAt = normaliseDate(updatedAtRaw);

  return {
    ok: true,
    note: {
      id,
      title,
      tags,
      createdAt: createdAt ?? '',
      updatedAt: updatedAt ?? '',
      body,
    },
  };
};

/**
 * Try to accept the range of ISO-ish forms other editors and hand-written
 * files produce, so a stray reformat does not cost the user a note.
 *
 * Accepts: bare ISO ("2026-09-04T17:00:00.000Z"), quoted ISO
 * (`"2026-09-04T17:00:00Z"`), space instead of `T`, missing milliseconds,
 * missing timezone. Returns a canonical ISO string or null. A null is not a
 * failure: the caller (the folder store) falls back to file mtime or now(),
 * because losing a whole note because a date is unparseable is unacceptable.
 */
export const normaliseDate = (raw: string): string | null => {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  if (s === '') return null;

  const candidates = [s];
  if (s.includes(' ') && !s.includes('T')) {
    candidates.push(s.replace(' ', 'T'));
  }

  for (const c of candidates) {
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
};

/**
 * Slugify a title into filename-safe characters. Called by the folder store
 * to produce readable filenames alongside the id suffix, so a human browsing
 * the folder sees something meaningful.
 */
export const slugify = (title: string): string => {
  const cleaned = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : 'untitled';
};

/** filename convention: <slug>-<id>.md */
export const noteFilename = (note: Note): string =>
  `${slugify(note.title)}-${note.id}.md`;

const findFrontmatterClose = (afterOpen: string): number => {
  let searchFrom = 0;
  while (true) {
    const idx = afterOpen.indexOf(FM_CLOSE, searchFrom);
    if (idx === -1) return -1;
    const after = afterOpen[idx + FM_CLOSE.length];
    if (after === undefined || after === '\n') return idx;
    searchFrom = idx + 1;
  }
};

const parseJsonString = (raw: string | undefined, field: string): string | ParseError => {
  if (raw === undefined) return { ok: false, error: `missing ${field}` };
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'string') {
      return { ok: false, error: `${field} must be a string` };
    }
    return value;
  } catch {
    return { ok: false, error: `${field} is not valid JSON` };
  }
};

const parseJsonStringArray = (
  raw: string | undefined,
  field: string
): string[] | ParseError => {
  if (raw === undefined) return { ok: false, error: `missing ${field}` };
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      return { ok: false, error: `${field} must be an array of strings` };
    }
    return value;
  } catch {
    return { ok: false, error: `${field} is not valid JSON` };
  }
};
