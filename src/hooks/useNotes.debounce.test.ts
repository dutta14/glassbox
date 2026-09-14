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
 * These tests exercise the debounce boundary via `createNote`, which calls
 * `scheduleWrite` directly with a locally-constructed Note. The debounce
 * boundary itself lives in `scheduleWrite` (500ms coalescing timer), so it
 * can be validated on this path.
 *
 * IMPORTANT — updateNote is NOT tested for the debounce path here. There is
 * a source bug in useNotes.updateNote (see report to Anindya) where
 *   `let updated: Note | null = null; setNotes(prev => { ...; updated = X; }); if (updated !== null) scheduleWrite(updated);`
 * reads `updated` BEFORE React's reducer executes, so scheduleWrite is never
 * reached from edits. That bug is the reason a "coalescing" test on
 * updateNote cannot be written honestly right now: it would fail for the
 * wrong reason (edits never persisted at all, let alone coalesced) and pass
 * for the wrong reason if the fix is reverted. When the source bug is fixed
 * we should add the two-edit coalescing test at that time.
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

  // ---- Blocked-on-source-bug placeholder ----
  // See: useNotes.updateNote reads `updated` before the setState reducer runs.
  // Un-skip once the source bug is fixed. The intended assertion is:
  //   two updateNote calls to the same id, spaced 200ms apart, produce exactly
  //   ONE put after the debounce window whose body is the SECOND edit; and
  //   five rapid edits within one window produce exactly ONE put.
  it.skip('coalesces two updateNote calls inside the 500ms window into one put with the second body (BLOCKED by updateNote source bug)', async () => {
    // Intentionally empty until the source bug is fixed.
  });
});
