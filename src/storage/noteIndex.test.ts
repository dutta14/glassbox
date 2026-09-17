import { describe, it, expect } from 'vitest';
import { INDEX_VERSION, parseIndex, serialiseIndex, toMeta } from './noteIndex';
import type { Note, NoteMeta } from '../types';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'The seawall',
  body: 'The lights came on one at a time.',
  tags: ['verses'],
  createdAt: '2010-12-28T00:00:00.000Z',
  updatedAt: '2010-12-28T00:00:00.000Z',
  ...overrides,
});

const meta = (overrides: Partial<NoteMeta> = {}): NoteMeta => ({
  id: 'n1',
  title: 'The seawall',
  tags: ['verses'],
  createdAt: '2010-12-28T00:00:00.000Z',
  updatedAt: '2010-12-28T00:00:00.000Z',
  filename: 'the-seawall-n1.md',
  ...overrides,
});

describe('toMeta', () => {
  it('keeps what the list needs and drops the body', () => {
    const result = toMeta(note(), 'the-seawall-n1.md');

    expect(result).toEqual(meta());
    expect(result).not.toHaveProperty('body');
  });

  it('carries the format through so verse can be marked before it is opened', () => {
    expect(toMeta(note({ format: 'verse' }), 'f.md').format).toBe('verse');
  });

  it('omits the format for prose so prose entries stay as small as the files', () => {
    expect(toMeta(note({ format: 'prose' }), 'f.md')).not.toHaveProperty('format');
  });
});

describe('the index round trip', () => {
  it('returns what it was given', () => {
    const entries = [meta(), meta({ id: 'n2', filename: 'b.md', format: 'verse' })];

    expect(parseIndex(serialiseIndex(entries))).toEqual(entries);
  });

  it('writes a trailing newline so the file is a well formed text file', () => {
    expect(serialiseIndex([meta()]).endsWith('\n')).toBe(true);
  });
});

/**
 * Every rejection below costs one slow load and nothing else, because the
 * caller rebuilds from the markdown files. That asymmetry is why these lean
 * towards throwing the index away rather than trusting a damaged one.
 */
describe('an index that cannot be trusted', () => {
  it('rejects text that is not JSON at all', () => {
    expect(parseIndex('half a file, truncated by a sync')).toBeNull();
  });

  it('rejects an index written by a newer version of the app', () => {
    expect(parseIndex(JSON.stringify({ version: INDEX_VERSION + 1, entries: [] }))).toBeNull();
  });

  it('rejects an index with no version, which predates this format', () => {
    expect(parseIndex(JSON.stringify({ entries: [] }))).toBeNull();
  });

  it('rejects entries that are not a list', () => {
    expect(parseIndex(JSON.stringify({ version: INDEX_VERSION, entries: {} }))).toBeNull();
  });

  it('reads an empty index as an empty library rather than a failure', () => {
    expect(parseIndex(JSON.stringify({ version: INDEX_VERSION, entries: [] }))).toEqual([]);
  });
});

describe('an index with damaged entries', () => {
  /* Throws rather than returning null so that a wholesale rejection fails
     loudly here, instead of surfacing as a confusing null further down. */
  const withEntries = (entries: unknown[]): NoteMeta[] => {
    const parsed = parseIndex(JSON.stringify({ version: INDEX_VERSION, entries }));
    if (parsed === null) throw new Error('the whole index was rejected');
    return parsed;
  };

  /* Dropping one bad row keeps the rest of the library reachable. Rejecting
     the whole file would hide hundreds of good notes behind one bad line. */
  it('skips an entry with no id and keeps the rest', () => {
    expect(withEntries([{ filename: 'a.md' }, meta()])).toEqual([meta()]);
  });

  it('skips an entry with no filename, which could never be fetched', () => {
    expect(withEntries([{ id: 'x' }, meta()])).toEqual([meta()]);
  });

  it('skips entries that are not objects', () => {
    expect(withEntries([null, 'a string', 7, meta()])).toEqual([meta()]);
  });

  it('keeps a note whose title is missing so it can still be found and fixed', () => {
    const result = withEntries([{ id: 'n9', filename: 'n9.md' }]);

    expect(result).toEqual([{ id: 'n9', filename: 'n9.md', title: '', tags: [], createdAt: '', updatedAt: '' }]);
  });

  it('drops tags that are not strings rather than rendering them', () => {
    expect(withEntries([{ ...meta(), tags: ['verses', 3, null, 'prose'] }])[0].tags).toEqual([
      'verses',
      'prose',
    ]);
  });

  it('treats an unrecognised format as prose, the same as the markdown parser', () => {
    expect(withEntries([{ ...meta(), format: 'sonnet' }])[0]).not.toHaveProperty('format');
  });

  it('keeps the newest of two entries claiming the same id', () => {
    const older = meta({ filename: 'copy.md', updatedAt: '2010-12-28T00:00:00.000Z' });
    const newer = meta({ filename: 'real.md', updatedAt: '2024-01-01T00:00:00.000Z' });

    expect(withEntries([older, newer])).toEqual([newer]);
    expect(withEntries([newer, older])).toEqual([newer]);
  });
});
