import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

const AUTOSAVE_MS = 500;

class RecordingStore implements NotesStore {
  readonly kind = 'local' as const;
  readonly label = 'update-guard';
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

const seed = (store: RecordingStore, note: Note): void => {
  store.disk.set(note.id, note);
};

const mkNote = (id: string, body: string): Note => ({
  id,
  title: 'T',
  body,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/**
 * Permanent regression guard for the "updated read before reducer runs" bug
 * in useNotes.updateNote.
 *
 * The historic bug: `updateNote` used
 *
 *   let updated: Note | null = null;
 *   setNotes(prev => {
 *     const next = prev.map(n => (n.id === id ? (updated = build(n)) : n));
 *     return sortByUpdated(next);
 *   });
 *   if (updated !== null) scheduleWrite(updated);
 *
 * React's function-form updater is called during the render phase, not
 * synchronously at dispatch, so `updated` was still null when the `!== null`
 * guard ran. `scheduleWrite` was never called. UI reflected the edit but the
 * store never saw a put, and on reload the edit was lost.
 *
 * The fix computes the next note from `notesRef.current` OUTSIDE `setNotes`
 * and calls `scheduleWrite` unconditionally.
 *
 * These tests fail if anyone reintroduces the closure-over-reducer pattern.
 */
describe('useNotes.updateNote — edits must reach the store through scheduleWrite', () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes exactly one put with the edited body to the store after a single updateNote and debounce flush', async () => {
    const store = new RecordingStore();
    seed(store, mkNote('n', 'original body'));
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      result.current.updateNote('n', { body: 'edited body' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].id).toBe('n');
    expect(store.putCalls[0].body).toBe('edited body');
    // And the original body is NOT what got persisted — a regression where the
    // reducer captured pre-edit state and re-wrote it would show 'original body'.
    expect(store.putCalls[0].body).not.toBe('original body');
  });

  it('persists the edited title to the store after updateNote with a title patch', async () => {
    // Both branches of the patch (title, body) go through the same
    // schedule-outside-setNotes path. Guarding both means the fix does not
    // silently regress on one axis.
    const store = new RecordingStore();
    seed(store, mkNote('n', 'body stays'));
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      result.current.updateNote('n', { title: 'edited title' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].title).toBe('edited title');
    expect(store.putCalls[0].body).toBe('body stays');
  });

  it('survives a store round trip: the edited body is what list() returns after debounce flush', async () => {
    // End-to-end guard: not just "put was called with X", but "reading the
    // store back returns X". A bug that put stale state would still call
    // put but with the wrong body; this test catches that too.
    const store = new RecordingStore();
    seed(store, mkNote('n', 'v0'));
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      result.current.updateNote('n', { body: 'v1-round-trip' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    const listed = await store.list();
    const roundTripped = listed.find((n) => n.id === 'n');
    expect(roundTripped).toBeDefined();
    expect(roundTripped!.body).toBe('v1-round-trip');
    // And the pre-edit body is provably not present.
    expect(roundTripped!.body).not.toBe('v0');
  });

  it('reaches the store on the very first updateNote after mount, not only on subsequent edits', async () => {
    // Guard against a regression where the first edit lands nowhere because
    // `notesRef.current` has not yet caught up with post-bootstrap state.
    const store = new RecordingStore();
    seed(store, mkNote('n', 'v0'));
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    // First edit — no prior warm-up.
    await act(async () => {
      result.current.updateNote('n', { body: 'v-first' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].body).toBe('v-first');
  });
});
