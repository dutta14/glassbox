import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotes } from './useNotes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

/**
 * Gap #3 — AC 25 storage-unavailable bootstrap.
 *
 * When localStorage throws on every read AND every write, the app must still
 * come up to a `ready` state, seed exactly the five sample notes ONCE per
 * mount (not per render), and not loop. `hasSeeded()` returns false under a
 * throwing storage, which puts the seeding block on the runaway path if the
 * effect ever re-fires without cancellation. This test guards the boundary:
 * exactly five puts, not zero, not "runaway many".
 */

class InMemoryStore implements NotesStore {
  readonly kind = 'local' as const;
  readonly label = 'no-ls';
  disk = new Map<string, Note>();
  putCalls: Note[] = [];
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(note: Note): Promise<void> {
    this.putCalls.push({ ...note, tags: [...note.tags] });
    this.disk.set(note.id, { ...note });
  }
  async remove(id: string): Promise<void> {
    this.disk.delete(id);
  }
}

describe('useNotes bootstrap — Gap #3 / AC 25 storage unavailable', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let setSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Real localStorage.clear works before we install the throwing spies.
    localStorage.clear();
    getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError: read denied');
    });
    setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError: write denied');
    });
    removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('QuotaExceededError: remove denied');
    });
  });

  afterEach(() => {
    getSpy.mockRestore();
    setSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('reaches ready status even when localStorage throws on both read and write', async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('seeds exactly five sample notes on first bootstrap under a throwing storage, not zero and not a runaway count', async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    expect(store.putCalls.length).toBe(5);
    // Ids are the stable sample ids, meaning seeding did not loop and generate
    // fresh ids each pass.
    const uniqueIds = new Set(store.putCalls.map((n) => n.id));
    expect(uniqueIds.size).toBe(5);
    for (const id of uniqueIds) {
      expect(id.startsWith('sample-')).toBe(true);
    }
  });

  it('seeds at most five sample notes across StrictMode double-effect firing under a throwing storage', async () => {
    // A regression where the "already seeded" recheck is dropped, combined
    // with hasSeeded() returning false due to throws, would put ten sample
    // notes on disk. Cap: five.
    const store = new InMemoryStore();
    const { rerender, result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    // Force a re-render on the same hook + same store. This does not
    // re-fire the useEffect (dep unchanged) but a regression that
    // moved seeding out of the effect would blow this up.
    rerender();
    rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.putCalls.length).toBeLessThanOrEqual(5);
    expect(store.disk.size).toBe(5);
  });
});
