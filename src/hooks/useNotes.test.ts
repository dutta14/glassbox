import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

const AUTOSAVE_MS = 500;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

const defer = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * A NotesStore test double whose `put` and `remove` return promises the test
 * resolves manually, so the delete-during-in-flight-write race can be driven
 * deterministically instead of "hoped for" with sleeps.
 *
 * `disk` models what the on-disk folder actually contains. A `put` commits to
 * `disk` only when its promise resolves (mirroring the real folder store,
 * where a file appears only after the writable's close() reports success).
 * A `remove` deletes from `disk` only when its promise resolves.
 */
class ControlledStore implements NotesStore {
  readonly kind = 'folder' as const;
  readonly label = 'test-folder';
  isAvailable(): boolean {
    return true;
  }

  disk = new Map<string, Note>();
  putCalls: Note[] = [];
  removeCalls: string[] = [];
  listCalls = 0;
  pendingPuts: Deferred<void>[] = [];
  pendingRemoves: Deferred<void>[] = [];

  async list(): Promise<Note[]> {
    this.listCalls += 1;
    return [...this.disk.values()];
  }

  put(note: Note): Promise<void> {
    this.putCalls.push(note);
    const d = defer<void>();
    this.pendingPuts.push(d);
    return d.promise.then(() => {
      this.disk.set(note.id, note);
    });
  }

  remove(id: string): Promise<void> {
    this.removeCalls.push(id);
    const d = defer<void>();
    this.pendingRemoves.push(d);
    return d.promise.then(() => {
      this.disk.delete(id);
    });
  }

  resolveNextPut(): void {
    const d = this.pendingPuts.shift();
    if (!d) throw new Error('no pending put to resolve');
    d.resolve();
  }

  resolveNextRemove(): void {
    const d = this.pendingRemoves.shift();
    if (!d) throw new Error('no pending remove to resolve');
    d.resolve();
  }
}

const mk = (id: string, title = 'T', body = 'B', updatedAt = '2026-01-01T00:00:00.000Z'): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: updatedAt,
  updatedAt,
});

// Ensure microtasks drain before assertions that follow a resolved promise.
const flushMicrotasks = (): Promise<void> => Promise.resolve().then(() => Promise.resolve());

describe('useNotes.deleteNote — bug 1 regression (data loss via delete-during-in-flight put)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Skip the sample-seed branch so tests observe only the deletion mechanics.
    markSeeded();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves the note absent from the store when it is deleted while a put for it is still in flight', async () => {
    const store = new ControlledStore();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe('ready'));

    // Create a note. This schedules a debounced put.
    let created!: Note;
    await act(async () => {
      created = result.current.createNote();
    });
    expect(result.current.notes.map((n) => n.id)).toContain(created.id);

    // Fire the debounce timer so put() starts. The put promise is now pending
    // and awaiting our manual resolution.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(store.putCalls.map((n) => n.id)).toContain(created.id);
    expect(store.pendingPuts).toHaveLength(1);

    // Delete while the put is still in flight. Local state must remove it
    // optimistically; the store-side remove is queued behind the put.
    await act(async () => {
      result.current.deleteNote(created.id);
    });
    expect(result.current.notes.find((n) => n.id === created.id)).toBeUndefined();
    // remove has NOT been called yet — retireWriteState is awaiting the put.
    expect(store.removeCalls).toEqual([]);

    // Resolve the put. `disk` now contains the note (mirrors a folder-store
    // close() that just committed the file). Only after this should remove run.
    await act(async () => {
      store.resolveNextPut();
      await flushMicrotasks();
    });
    expect(store.removeCalls).toEqual([created.id]);
    // The note is on disk right now because put committed. The fix's guarantee
    // is that remove was queued AFTER the put, so remove will clean it up.
    expect(store.disk.has(created.id)).toBe(true);

    // Resolve the remove and let deleteNote's finally clear pendingDeletions.
    await act(async () => {
      store.resolveNextRemove();
      await flushMicrotasks();
    });

    expect(store.disk.has(created.id)).toBe(false);
    expect(result.current.notes.find((n) => n.id === created.id)).toBeUndefined();
  });

  it('does not resurrect a note via focus reconciliation while the deletion is still in flight', async () => {
    const store = new ControlledStore();
    // Seed the "disk" as if a previous session already committed this note.
    const existing = mk('n-alive', 'Existing', 'body', '2026-06-01T00:00:00.000Z');
    store.disk.set(existing.id, existing);

    const { result } = renderHook(() => useNotes(store));
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toContain(existing.id));

    // Delete. No write is in flight, so retireWriteState returns immediately.
    // The pending step is store.remove, which we hold open.
    await act(async () => {
      result.current.deleteNote(existing.id);
    });
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();
    await waitFor(() => expect(store.removeCalls).toEqual([existing.id]));
    // remove is queued but not yet resolved — disk still contains the note.
    expect(store.disk.has(existing.id)).toBe(true);

    // Fire a focus event while the deletion is mid-flight. reconcile will
    // call list() and see the note still on disk. The pendingDeletions guard
    // is what prevents resurrection.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();

    // Now resolve the remove. Disk is empty; deletion has settled.
    await act(async () => {
      store.resolveNextRemove();
      await flushMicrotasks();
    });
    expect(store.disk.has(existing.id)).toBe(false);

    // A subsequent reconcile must confirm the note stays gone.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flushMicrotasks();
    });
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();
  });

  it('does not resurrect a deleted note on the next focus after the deletion has settled', async () => {
    const store = new ControlledStore();
    const existing = mk('n-final', 'Final', 'body', '2026-06-02T00:00:00.000Z');
    store.disk.set(existing.id, existing);

    const { result } = renderHook(() => useNotes(store));
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toContain(existing.id));

    await act(async () => {
      result.current.deleteNote(existing.id);
    });
    await waitFor(() => expect(store.removeCalls).toEqual([existing.id]));

    // Resolve remove to complete the deletion.
    await act(async () => {
      store.resolveNextRemove();
      await flushMicrotasks();
    });
    expect(store.disk.has(existing.id)).toBe(false);
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();

    // Focus reconcile after the fact must keep it gone.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flushMicrotasks();
    });
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();
    // And list was actually consulted, so this is a real reconcile pass.
    expect(store.listCalls).toBeGreaterThanOrEqual(2);
  });

  it('deletes a note cleanly when no write is in flight (easy-path regression guard)', async () => {
    const store = new ControlledStore();
    const existing = mk('n-easy', 'Easy', 'body', '2026-06-03T00:00:00.000Z');
    store.disk.set(existing.id, existing);

    const { result } = renderHook(() => useNotes(store));
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toContain(existing.id));

    await act(async () => {
      result.current.deleteNote(existing.id);
    });
    expect(result.current.notes.find((n) => n.id === existing.id)).toBeUndefined();

    await waitFor(() => expect(store.removeCalls).toEqual([existing.id]));
    // No put was ever scheduled for this note.
    expect(store.putCalls).toEqual([]);

    await act(async () => {
      store.resolveNextRemove();
      await flushMicrotasks();
    });
    expect(store.disk.has(existing.id)).toBe(false);
  });
});
