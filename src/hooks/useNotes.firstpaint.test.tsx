import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { NotesStore } from '../storage/types';
import type { Note } from '../types';

/**
 * The nav needs three fields per row: id, title and format. Those arrive with
 * the first handful of files, long before the last one is parsed. These tests
 * pin that the hook shows them rather than waiting, and that a partial view is
 * never mistaken for the whole library.
 */

const note = (id: string, title: string, createdAt = '2020-01-01T12:00:00.000Z'): Note => ({
  id,
  title,
  body: 'body',
  tags: [],
  createdAt,
  updatedAt: '2020-01-01T12:00:00.000Z',
});

/**
 * A store whose read is held open until the test releases it, so "before the
 * load finished" is a fact rather than a race.
 */
const pausedStore = (batches: Note[][], gapMs = 0) => {
  let release!: () => void;
  const finished = new Promise<void>((r) => {
    release = r;
  });

  const store: NotesStore = {
    kind: 'local',
    label: 'Test',
    isAvailable: () => true,
    list: async (onBatch?: (notes: Note[]) => void) => {
      for (const batch of batches) {
        // The hook paints the first batch at once and then throttles, so a
        // test that wants to observe a second batch has to let the window
        // pass. A real folder read of several hundred files spans far longer
        // than this; the batches only land together here because a fake
        // directory resolves instantly.
        if (gapMs > 0 && batches.indexOf(batch) > 0) {
          await new Promise((r) => setTimeout(r, gapMs));
        }
        onBatch?.(batch);
      }
      await finished;
      return batches.flat();
    },
    put: async () => {},
    remove: async () => {},
  };
  return { store, release };
};

beforeEach(() => {
  localStorage.clear();
  markSeeded();
});

describe('the nav draws from the first notes read, not the last', () => {
  it('shows an early batch while the rest of the library is still being read', async () => {
    const { store, release } = pausedStore([[note('a', 'Alpha')], [note('b', 'Beta')]]);
    const { result } = renderHook(() => useNotes(store));

    /* The read has not finished and cannot finish until release() is called,
       yet the first note is already on screen. */
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toContain('a'));
    expect(result.current.status).toBe('ready');

    release();
    await waitFor(() => expect(result.current.notes).toHaveLength(2));
  });

  it('keeps notes from earlier batches rather than replacing them', async () => {
    const { store } = pausedStore([[note('a', 'Alpha')], [note('b', 'Beta')]], 120);
    const { result } = renderHook(() => useNotes(store));

    /* Deliberately never released. The resolved list would contain both notes
       and would prove nothing about the batches, so this asserts while the
       read is still open and only the batch path has run. */
    await waitFor(() => expect(result.current.notes.map((n) => n.id).sort()).toEqual(['a', 'b']));
  });

  it('orders what it shows, so early rows are not in directory order', async () => {
    /* Delivered oldest first, as a directory would. */
    const { store } = pausedStore(
      [
        [note('old', 'Older', '2019-01-01T12:00:00.000Z')],
        [note('new', 'Newer', '2024-01-01T12:00:00.000Z')],
      ],
      120,
    );
    const { result } = renderHook(() => useNotes(store));

    /* Again never released: the resolved list is sorted by existing code, so
       releasing here would pass whether or not batches are sorted at all. */
    await waitFor(() => expect(result.current.notes).toHaveLength(2));
    expect(result.current.notes.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('lets the resolved list remove a note no batch mentioned', async () => {
    /* Batches say what exists, never what is gone. A note deleted on disk
       appears in no batch, so only the resolved array can drop it. */
    const store: NotesStore = {
      kind: 'local',
      label: 'Test',
      isAvailable: () => true,
      list: async (onBatch?: (notes: Note[]) => void) => {
        onBatch?.([note('a', 'Alpha'), note('gone', 'Deleted elsewhere')]);
        return [note('a', 'Alpha')];
      },
      put: async () => {},
      remove: async () => {},
    };

    const { result } = renderHook(() => useNotes(store));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toEqual(['a']));
  });
});
