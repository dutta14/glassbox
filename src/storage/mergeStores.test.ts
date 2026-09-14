import { describe, it, expect } from 'vitest';
import { mergeStores } from './mergeStores';
import { createLocalStorageStore } from './localStorageStore';
import type { NotesStore } from './types';
import type { Note } from '../types';

const mk = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'n1',
  title: overrides.title ?? 'Title',
  body: overrides.body ?? 'body',
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
});

/**
 * An in-memory NotesStore for merge tests. Simpler than the real backends so
 * assertions target merge behaviour, not storage quirks. Records every put()
 * call so tests can assert that dest was NOT written when it should not be.
 */
const makeMemoryStore = (initial: Note[] = []): NotesStore & { puts: Note[]; removed: string[] } => {
  const map = new Map<string, Note>(initial.map((n) => [n.id, n]));
  const puts: Note[] = [];
  const removed: string[] = [];
  return {
    kind: 'local',
    label: 'memory',
    isAvailable: () => true,
    list: async () => [...map.values()],
    put: async (note) => {
      puts.push(note);
      map.set(note.id, note);
    },
    remove: async (id) => {
      removed.push(id);
      map.delete(id);
    },
    puts,
    removed,
  };
};

describe('mergeStores', () => {
  it('copies a note that exists only in source into dest', async () => {
    const source = makeMemoryStore([mk({ id: 'only-source', body: 'src' })]);
    const dest = makeMemoryStore([]);
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('only-source');
    expect(listed[0].body).toBe('src');
  });

  it('leaves a note that exists only in dest untouched', async () => {
    const source = makeMemoryStore([]);
    const dest = makeMemoryStore([mk({ id: 'only-dest', body: 'kept' })]);
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('only-dest');
    expect(listed[0].body).toBe('kept');
    expect(dest.puts).toHaveLength(0);
  });

  it('unions notes: source-only and dest-only both survive', async () => {
    const source = makeMemoryStore([mk({ id: 's', body: 'from-source' })]);
    const dest = makeMemoryStore([mk({ id: 'd', body: 'from-dest' })]);
    await mergeStores(source, dest);
    const ids = (await dest.list()).map((n) => n.id).sort();
    expect(ids).toEqual(['d', 's']);
  });

  it('writes the source copy when source is strictly newer', async () => {
    const source = makeMemoryStore([
      mk({ id: 'shared', body: 'NEW', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    const dest = makeMemoryStore([
      mk({ id: 'shared', body: 'OLD', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].body).toBe('NEW');
    // Absence of the old content is as important as presence of the new one.
    expect(listed.some((n) => n.body === 'OLD')).toBe(false);
    expect(dest.puts).toHaveLength(1);
  });

  it('does NOT overwrite a dest note that is newer than source', async () => {
    const source = makeMemoryStore([
      mk({ id: 'shared', body: 'STALE', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    const dest = makeMemoryStore([
      mk({ id: 'shared', body: 'FRESH', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].body).toBe('FRESH');
    // Prove the older content did not replace the newer one.
    expect(listed.some((n) => n.body === 'STALE')).toBe(false);
    // And prove dest.put was never called for this id, so the "only strictly
    // newer" rule is enforced at the write, not just the visible result.
    expect(dest.puts).toHaveLength(0);
  });

  it('does not overwrite when source and dest updatedAt are equal (strictly newer only)', async () => {
    const when = '2026-03-01T00:00:00.000Z';
    const source = makeMemoryStore([mk({ id: 'shared', body: 'SRC', updatedAt: when })]);
    const dest = makeMemoryStore([mk({ id: 'shared', body: 'DEST', updatedAt: when })]);
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed[0].body).toBe('DEST');
    expect(dest.puts).toHaveLength(0);
  });

  it('is a no-op when source is empty', async () => {
    const source = makeMemoryStore([]);
    const dest = makeMemoryStore([mk({ id: 'd' })]);
    await expect(mergeStores(source, dest)).resolves.toBeUndefined();
    expect(dest.puts).toHaveLength(0);
    expect((await dest.list()).map((n) => n.id)).toEqual(['d']);
  });

  it('is a no-op when both source and dest are empty', async () => {
    const source = makeMemoryStore([]);
    const dest = makeMemoryStore([]);
    await expect(mergeStores(source, dest)).resolves.toBeUndefined();
    expect(dest.puts).toHaveLength(0);
    expect(await dest.list()).toEqual([]);
  });

  it('works end-to-end with a real localStorage-backed dest', async () => {
    localStorage.clear();
    const source = makeMemoryStore([mk({ id: 'x', body: 'seeded' })]);
    const dest = createLocalStorageStore();
    await mergeStores(source, dest);
    const listed = await dest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('x');
    expect(listed[0].body).toBe('seeded');
  });
});
