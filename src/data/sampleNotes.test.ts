import { describe, expect, it, beforeEach } from 'vitest';
import { sampleNotes } from './sampleNotes';
import { createLocalStorageStore } from '../storage/localStorageStore';

describe('sampleNotes — stable ids (bug 3 regression)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the same five ids on every call so StrictMode double-invocation cannot produce ten samples', () => {
    const first = sampleNotes();
    const second = sampleNotes();

    const firstIds = first.map((n) => n.id);
    const secondIds = second.map((n) => n.id);

    expect(firstIds).toHaveLength(5);
    expect(secondIds).toHaveLength(5);
    expect(secondIds).toEqual(firstIds);

    // Distinct across the set, so we do not confuse "same five" with "one repeated".
    expect(new Set(firstIds).size).toBe(5);
  });

  it('seeding twice into a NotesStore results in exactly five notes, not ten', async () => {
    const store = createLocalStorageStore();

    // First seeding pass.
    for (const note of sampleNotes()) {
      await store.put(note);
    }
    // Second seeding pass — mirrors StrictMode invoking the seed effect twice.
    for (const note of sampleNotes()) {
      await store.put(note);
    }

    const listed = await store.list();
    expect(listed).toHaveLength(5);
    expect(new Set(listed.map((n) => n.id)).size).toBe(5);
  });
});
