import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

/**
 * Gap #6 — AC 3: sidebar sort ties must be deterministic and total.
 *
 * `sortByUpdated` sorts by `updatedAt` descending. When two notes have
 * identical `updatedAt`, ES2019 Array.sort is stable, so the input order
 * is preserved. The bootstrap path feeds the sort from `store.list()`,
 * whose iteration order is Map insertion order. So identical-timestamp
 * notes end up in the sidebar in the same order they were inserted into
 * the store, on every mount, on every run.
 *
 * If the platform sort is ever swapped for something unstable, or if
 * `sortByUpdated` is rewritten to secondary-key on something engine-defined
 * (like an object identity comparison), this test will fail.
 */

class InMemoryStore implements NotesStore {
  readonly kind = 'local' as const;
  readonly label = 'tie';
  disk = new Map<string, Note>();
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(n: Note): Promise<void> {
    this.disk.set(n.id, { ...n });
  }
  async remove(id: string): Promise<void> {
    this.disk.delete(id);
  }
}

const iso = '2026-01-01T00:00:00.000Z';
const later = '2026-06-01T00:00:00.000Z';

const mk = (id: string, updatedAt: string): Note => ({
  id,
  title: id,
  body: '',
  tags: [],
  createdAt: iso,
  updatedAt,
});

describe('useNotes sort — Gap #6 / AC 3 sidebar tie-breaks', () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
  });

  it('preserves store insertion order when three notes share an identical updatedAt', async () => {
    const store = new InMemoryStore();
    // Insert in a specific, non-alphabetical order so we can prove insertion
    // order wins over id-alphabetical (which would be a natural but wrong
    // secondary key to introduce).
    store.disk.set('gamma', mk('gamma', iso));
    store.disk.set('alpha', mk('alpha', iso));
    store.disk.set('beta', mk('beta', iso));

    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    const ids = result.current.notes.map((n) => n.id);
    expect(ids).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('produces the same order across two independent mounts when notes share an identical updatedAt', async () => {
    const build = (): InMemoryStore => {
      const s = new InMemoryStore();
      s.disk.set('gamma', mk('gamma', iso));
      s.disk.set('alpha', mk('alpha', iso));
      s.disk.set('beta', mk('beta', iso));
      return s;
    };

    const s1 = build();
    const r1 = renderHook(() => useNotes(s1));
    await vi.waitFor(() => expect(r1.result.current.status).toBe('ready'));
    const ids1 = r1.result.current.notes.map((n) => n.id);

    const s2 = build();
    const r2 = renderHook(() => useNotes(s2));
    await vi.waitFor(() => expect(r2.result.current.status).toBe('ready'));
    const ids2 = r2.result.current.notes.map((n) => n.id);

    expect(ids1).toEqual(ids2);
  });

  it('places a note with a later updatedAt ahead of tied earlier notes, and preserves insertion order among the ties', async () => {
    const store = new InMemoryStore();
    store.disk.set('gamma', mk('gamma', iso));
    store.disk.set('newest', mk('newest', later));
    store.disk.set('alpha', mk('alpha', iso));
    store.disk.set('beta', mk('beta', iso));

    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    const ids = result.current.notes.map((n) => n.id);
    expect(ids[0]).toBe('newest');
    // Ties among the remaining three preserve their store insertion order.
    expect(ids.slice(1)).toEqual(['gamma', 'alpha', 'beta']);
  });
});
