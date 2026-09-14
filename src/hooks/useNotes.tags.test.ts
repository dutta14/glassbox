import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useNotes } from './useNotes';
import { markSeeded } from '../storage/notes';
import type { Note } from '../types';
import type { NotesStore } from '../storage/types';

/**
 * AC 5 coverage: "Tags entered as #word tokens inside the body; extracted into tags[] on save."
 *
 * Tag extraction lives in the module-private `extractTagsFromBody` and
 * `mergeProvenance` helpers inside `useNotes.ts`, so we exercise it through
 * the public `updateNote` API and observe the resulting `notes[i].tags`.
 */

class InMemoryStore implements NotesStore {
  readonly kind = 'local' as const;
  readonly label = 'inmem';
  disk = new Map<string, Note>();
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(note: Note): Promise<void> {
    this.disk.set(note.id, note);
  }
  async remove(id: string): Promise<void> {
    this.disk.delete(id);
  }
}

const seed = (store: InMemoryStore, note: Note): void => {
  store.disk.set(note.id, note);
};

const mkNote = (id: string, body: string, tags: string[] = []): Note => ({
  id,
  title: 'T',
  body,
  tags,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const setup = async (existing: Note): Promise<ReturnType<typeof renderHookNotes>> => {
  const store = new InMemoryStore();
  seed(store, existing);
  const rendered = renderHookNotes(store);
  await waitFor(() =>
    expect(rendered.result.current.notes.map((n) => n.id)).toContain(existing.id)
  );
  return rendered;
};

const renderHookNotes = (store: NotesStore) => {
  const rendered = renderHook(() => useNotes(store));
  return { ...rendered, store };
};

const editBody = async (
  rendered: Awaited<ReturnType<typeof setup>>,
  id: string,
  body: string
): Promise<string[]> => {
  await act(async () => {
    rendered.result.current.updateNote(id, { body });
  });
  const updated = rendered.result.current.notes.find((n) => n.id === id);
  expect(updated).toBeDefined();
  return updated!.tags;
};

describe('AC 5 — tag extraction from #word tokens in note body', () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
  });

  it('extracts a single lowercase #word from the body into tags', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'writing about #postgres today');
    expect(tags).toEqual(['postgres']);
  });

  it('extracts multiple distinct #word tokens preserving first-occurrence order', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', '#work followed by #travel and #kyoto');
    expect(tags).toEqual(['work', 'travel', 'kyoto']);
  });

  it('does not create a tag for a bare # with no following word character', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'a bare # goes nowhere and neither does ##');
    expect(tags).toEqual([]);
  });

  it('extracts a purely numeric #123 as a tag', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'issue #123 came up today');
    expect(tags).toEqual(['123']);
  });

  it('extracts a #tag that is punctuation-adjacent, e.g. after a period', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'end of sentence.#followup was noted');
    expect(tags).toEqual(['followup']);
  });

  it('extracts a #tag containing internal hyphens as one tag, not multiple', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'category #product-launch mentioned');
    expect(tags).toEqual(['product-launch']);
  });

  it('deduplicates repeated occurrences of the same tag', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', '#work again #work and then #WORK once more');
    expect(tags).toEqual(['work']);
  });

  it('lowercases mixed-case #Tag tokens', async () => {
    const rendered = await setup(mkNote('n', 'plain body'));
    const tags = await editBody(rendered, 'n', 'mixed case #TravelPlans should lowercase');
    expect(tags).toEqual(['travelplans']);
  });

  it('removes a previously extracted tag when the user deletes the #hash from the body', async () => {
    const rendered = await setup(mkNote('n', 'starter body with no hashes'));
    // First edit: introduces the #work hash so the extractor adds "work".
    const before = await editBody(rendered, 'n', 'about #work');
    expect(before).toEqual(['work']);
    // Second edit: removes the hash. Extractor must reflect that.
    const after = await editBody(rendered, 'n', 'about work with no hash now');
    expect(after).toEqual([]);
  });

  it('preserves the sample provenance tag when a sample note is edited and its body no longer contains #sample', async () => {
    const sampleNote: Note = {
      id: 'sample-1',
      title: 'Sample',
      body: 'body without any hash',
      tags: ['sample'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const rendered = await setup(sampleNote);
    const tags = await editBody(rendered, 'sample-1', 'user typed here with #new and #ideas');
    // Explicitly assert BOTH presence of provenance and presence of new tags.
    expect(tags).toContain('sample');
    expect(tags).toContain('new');
    expect(tags).toContain('ideas');
    // And no drift: exactly those three, deduped.
    expect(new Set(tags)).toEqual(new Set(['sample', 'new', 'ideas']));
  });

  it('does not preserve a non-provenance previous tag that is absent from the new body (only the sample tag is preserved by design)', async () => {
    // Note starts with tags=['work','sample']. User edits body to have no
    // #work reference. Only 'sample' should carry forward; 'work' must drop.
    const existing: Note = {
      id: 'mixed',
      title: 'Mixed',
      body: 'about #work',
      tags: ['work', 'sample'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const rendered = await setup(existing);
    const tags = await editBody(rendered, 'mixed', 'no hashes in this rewrite');
    expect(tags).toContain('sample');
    expect(tags).not.toContain('work');
  });

  it('preserves the sample provenance tag when the new body has no tags at all', async () => {
    const sampleNote: Note = {
      id: 'sample-empty',
      title: 'Sample',
      body: 'first body',
      tags: ['sample'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const rendered = await setup(sampleNote);
    const tags = await editBody(rendered, 'sample-empty', 'edited body with no hashes');
    expect(tags).toEqual(['sample']);
  });

  it('does not duplicate the sample tag when the new body itself contains #sample', async () => {
    const sampleNote: Note = {
      id: 'sample-explicit',
      title: 'Sample',
      body: 'first body',
      tags: ['sample'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const rendered = await setup(sampleNote);
    const tags = await editBody(rendered, 'sample-explicit', 'this note has #sample in body');
    // Presence, and no duplication.
    expect(tags.filter((t) => t === 'sample')).toHaveLength(1);
  });
});
