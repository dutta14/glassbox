import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

const AUTOSAVE_MS = 500;

class InMemoryStore implements NotesStore {
  readonly kind = 'local' as const;
  readonly label = 'debounce-fixture';
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

/**
 * Gap #2 — AC 2 autosave debounce semantics.
 *
 * The debounce boundary lives in `scheduleWrite` (500ms coalescing timer).
 * These tests exercise it from both entry points that reach it:
 *
 *   - `createNote` calls `scheduleWrite` directly with the created note.
 *   - `updateNote` (after the fix to compute nextNote from notesRef.current
 *      outside setNotes) calls `scheduleWrite` on every edit.
 *
 * Assertions are on `store.putCalls.length` and the exact body persisted.
 * A regression to save-on-every-keystroke would produce five puts on a
 * five-keystroke burst, not one, and would fail these tests loudly.
 */
describe('useNotes autosave — Gap #2 / AC 2 debounce semantics (via createNote path)', () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not put a newly created note at 499ms after createNote', async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      result.current.createNote();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    });

    expect(store.putCalls).toEqual([]);
  });

  it('puts a newly created note exactly once at the 500ms boundary after createNote', async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    let created: Note;
    await act(async () => {
      created = result.current.createNote();
    });
    // 499ms silent.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    });
    expect(store.putCalls).toEqual([]);
    // Tick the boundary.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].id).toBe(created!.id);
  });

  it('produces one put per newly created note when creates are spaced beyond the 500ms window', async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    let a: Note;
    let b: Note;
    await act(async () => {
      a = result.current.createNote();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].id).toBe(a!.id);

    // 10ms of quiet is enough to prove we are demonstrably outside the previous
    // debounce window; then the second create + its own settle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      b = result.current.createNote();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(2);
    expect(store.putCalls[1].id).toBe(b!.id);
    expect(store.putCalls[1].id).not.toBe(a!.id);
  });

  it('coalesces two updateNote calls inside the 500ms window into exactly one put whose body is the second edit', async () => {
    const store = new InMemoryStore();
    // Seed a note on disk plus wait for bootstrap so the note is loaded into
    // React state; then edits go through the debounce path.
    store.disk.set('n', {
      id: 'n',
      title: 'T',
      body: 'v0',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    // Pre-mark seeded so bootstrap does not stack sample-note puts on top of
    // the ones we want to count.
    markSeeded();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    // Two edits inside one 500ms window: t=0 and t=200.
    await act(async () => {
      result.current.updateNote('n', { body: 'v1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await act(async () => {
      result.current.updateNote('n', { body: 'v2' });
    });
    // Fire the debounce boundary from the SECOND edit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].id).toBe('n');
    expect(store.putCalls[0].body).toBe('v2');
    // And the first edit is provably NOT what was persisted.
    expect(store.putCalls[0].body).not.toBe('v1');
  });

  it('coalesces a five-keystroke burst inside one debounce window into a single put carrying the final text', async () => {
    // A save-on-every-keystroke regression would produce five puts, not one.
    const store = new InMemoryStore();
    store.disk.set('n', {
      id: 'n',
      title: 'T',
      body: '',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    markSeeded();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    const keystrokes = ['h', 'he', 'hel', 'hell', 'hello'];
    for (const stroke of keystrokes) {
      await act(async () => {
        result.current.updateNote('n', { body: stroke });
        await vi.advanceTimersByTimeAsync(50); // 50ms between keys; well inside 500ms.
      });
    }
    // Let the debounce settle from the last keystroke.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].body).toBe('hello');
  });

  it('produces exactly two puts when two updateNote calls are separated by more than the 500ms window', async () => {
    const store = new InMemoryStore();
    store.disk.set('n', {
      id: 'n',
      title: 'T',
      body: 'v0',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    markSeeded();
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    // First edit + let it flush.
    await act(async () => {
      result.current.updateNote('n', { body: 'v1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].body).toBe('v1');

    // Then wait 10ms of quiet outside the previous window, second edit + flush.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      result.current.updateNote('n', { body: 'v2' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

    expect(store.putCalls).toHaveLength(2);
    expect(store.putCalls[1].body).toBe('v2');
    // And the first put was NOT overwritten by the second one's contents in
    // the recorded history: two distinct puts, two distinct bodies.
    expect(store.putCalls[0].body).not.toBe(store.putCalls[1].body);
  });
});
