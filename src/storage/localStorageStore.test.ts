import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalStorageStore } from './localStorageStore';
import type { Note } from '../types';

const STORAGE_KEY = 'glassbox.notes.v1';

const mk = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'n1',
  title: overrides.title ?? 'Title',
  body: overrides.body ?? 'Body',
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-02T00:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
});

describe('createLocalStorageStore', () => {
  it('declares itself as the "local" backend with the "This browser" label', () => {
    const store = createLocalStorageStore();
    expect(store.kind).toBe('local');
    expect(store.label).toBe('This browser');
    expect(store.isAvailable()).toBe(true);
  });

  it('round-trips list / put / remove for a single note', async () => {
    const store = createLocalStorageStore();
    expect(await store.list()).toEqual([]);

    const note = mk({ id: '1', title: 'First' });
    await store.put(note);
    expect(await store.list()).toEqual([note]);

    await store.remove('1');
    expect(await store.list()).toEqual([]);
  });

  it('put updates a note in place rather than duplicating it', async () => {
    const store = createLocalStorageStore();
    await store.put(mk({ id: '1', title: 'v1', body: 'first' }));
    await store.put(mk({ id: '1', title: 'v2', body: 'second' }));
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe('v2');
    expect(listed[0].body).toBe('second');
    // Prove the old copy is gone, not just that the new one is present.
    expect(listed.some((n) => n.title === 'v1')).toBe(false);
  });

  it('remove is a no-op for an unknown id', async () => {
    const store = createLocalStorageStore();
    await store.put(mk({ id: '1' }));
    await store.remove('does-not-exist');
    const listed = await store.list();
    expect(listed.map((n) => n.id)).toEqual(['1']);
  });

  it('drops a corrupt record from an otherwise valid array while keeping valid siblings', async () => {
    const good1 = mk({ id: 'good1' });
    const good2 = mk({ id: 'good2', title: 'Second' });
    const corrupt = { id: 42, title: 'wrong types', body: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([good1, corrupt, good2]));
    const store = createLocalStorageStore();
    const listed = await store.list();
    expect(listed.map((n) => n.id).sort()).toEqual(['good1', 'good2']);
    // Prove the corrupt record is gone, not just that the goods survived.
    expect(listed.some((n) => (n as unknown as { id: number }).id === 42)).toBe(false);
  });

  it('returns [] for malformed JSON under the key without throwing', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json at all');
    const store = createLocalStorageStore();
    await expect(store.list()).resolves.toEqual([]);
  });

  it('returns [] when the stored value is a non-array JSON structure', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: [mk()] }));
    const store = createLocalStorageStore();
    await expect(store.list()).resolves.toEqual([]);
  });
});
