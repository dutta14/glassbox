import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBooks } from './useBooks';
import type { Book } from '../types';
import type { BookStore } from '../storage/types';

const mkBook = (id: string, chapterIds: string[], updatedAt = '2026-01-01T00:00:00.000Z'): Book => ({
  id,
  title: `Book ${id}`,
  chapterIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
});

interface FakeStore extends BookStore {
  puts: Book[];
  removed: string[];
}

const fakeStore = (initial: Book[] = []): FakeStore => ({
  kind: 'local',
  puts: [],
  removed: [],
  list: async () => ({ books: initial, skipped: 0 }),
  async put(book) {
    this.puts.push(book);
  },
  async remove(id) {
    this.removed.push(id);
  },
});

/**
 * StrictMode on purpose. main.tsx renders the app inside it, so React invokes
 * every state updater twice in development. A mutation that writes a file
 * inside an updater looks correct in a plain render and produces two writes in
 * the real app. Without this wrapper such a bug passes either way.
 */
const setup = (store: BookStore | null = fakeStore()) =>
  renderHook(() => useBooks(store), { wrapper: StrictMode });

describe('useBooks — loading', () => {
  it('starts unloaded with no books', () => {
    const { result } = setup(null);
    expect(result.current.loaded).toBe(false);
    expect(result.current.books).toEqual([]);
  });

  it('loads books from the store on mount, newest first', async () => {
    const store = fakeStore([
      mkBook('old', [], '2026-01-01T00:00:00.000Z'),
      mkBook('new', [], '2026-03-01T00:00:00.000Z'),
      mkBook('mid', [], '2026-02-01T00:00:00.000Z'),
    ]);
    const { result } = setup(store);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.books.map((b) => b.id)).toEqual(['new', 'mid', 'old']);
  });

  it('marks loaded true even when the store throws', async () => {
    const store: BookStore = {
      kind: 'local',
      list: async () => {
        throw new Error('unreadable');
      },
      put: async () => {},
      remove: async () => {},
    };
    const { result } = setup(store);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.books).toEqual([]);
  });
});

describe('useBooks — createBook', () => {
  it('creates an empty book, persists it, and returns it', async () => {
    const store = fakeStore();
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: Book | undefined;
    await act(async () => {
      created = await result.current.createBook('New book');
    });

    expect(created?.title).toBe('New book');
    expect(created?.chapterIds).toEqual([]);
    expect(result.current.books.map((b) => b.id)).toContain(created?.id);
    expect(store.puts.some((b) => b.id === created?.id)).toBe(true);
  });
});

describe('useBooks — addChapter', () => {
  it('appends a note to the end of the book and persists it', async () => {
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n2', 'A Chapter');
    });

    expect(result.current.books[0].chapterIds).toEqual(['n1', 'n2']);
    expect(store.puts.at(-1)?.chapterIds).toEqual(['n1', 'n2']);
  });

  it('is idempotent: adding a note already in the book does not duplicate it', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n2', 'A Chapter');
    });

    expect(result.current.books[0].chapterIds).toEqual(['n1', 'n2']);
    expect(result.current.books[0].chapterIds.filter((id) => id === 'n2')).toHaveLength(1);
  });

  it('bumps updatedAt when a chapter is added', async () => {
    const store = fakeStore([mkBook('b1', ['n1'], '2020-01-01T00:00:00.000Z')]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n2', 'A Chapter');
    });

    expect(result.current.books[0].updatedAt > '2020-01-01T00:00:00.000Z').toBe(true);
    expect(store.puts.at(-1)?.updatedAt).toBe(result.current.books[0].updatedAt);
  });
});

describe('useBooks — removeChapter', () => {
  it('removes a note from the book and persists it', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2', 'n3'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeChapter('b1', 'n2');
    });

    expect(result.current.books[0].chapterIds).toEqual(['n1', 'n3']);
    expect(store.puts.at(-1)?.chapterIds).toEqual(['n1', 'n3']);
  });
});

describe('useBooks — reorderChapters', () => {
  it('replaces the order wholesale and persists the new order', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2', 'n3'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.reorderChapters('b1', ['n3', 'n1', 'n2']);
    });

    expect(result.current.books[0].chapterIds).toEqual(['n3', 'n1', 'n2']);
    expect(store.puts.at(-1)?.chapterIds).toEqual(['n3', 'n1', 'n2']);
  });
});

describe('useBooks — renameBook', () => {
  it('changes the title and persists it', async () => {
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.renameBook('b1', 'Renamed');
    });

    expect(result.current.books[0].title).toBe('Renamed');
    expect(store.puts.at(-1)?.title).toBe('Renamed');
  });
});

describe('useBooks — deleteBook', () => {
  it('removes the book record and never removes any notes', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.deleteBook('b1');
    });

    expect(result.current.books.map((b) => b.id)).not.toContain('b1');
    expect(store.removed).toEqual(['b1']);
    // The chapter notes are not the store's to delete. removeChapter/put were
    // never used to strip them, and remove only ever received the book id.
    expect(store.removed).not.toContain('n1');
    expect(store.removed).not.toContain('n2');
  });
});

describe('useBooks — removeNoteFromAllBooks', () => {
  it('removes a note from every book that held it', async () => {
    const store = fakeStore([
      mkBook('b1', ['n1', 'n2']),
      mkBook('b2', ['n2', 'n3']),
      mkBook('b3', ['n4']),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeNoteFromAllBooks('n2');
    });

    const byId = new Map(result.current.books.map((b) => [b.id, b]));
    expect(byId.get('b1')?.chapterIds).toEqual(['n1']);
    expect(byId.get('b2')?.chapterIds).toEqual(['n3']);
    expect(byId.get('b3')?.chapterIds).toEqual(['n4']);
    // Only the two holders were rewritten. b3 never held n2 so it is untouched.
    const putIds = store.puts.map((b) => b.id).sort();
    expect(putIds).toEqual(['b1', 'b2']);
  });

  it('does nothing when no book holds the note', async () => {
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeNoteFromAllBooks('absent');
    });

    expect(store.puts).toEqual([]);
    expect(result.current.books[0].chapterIds).toEqual(['n1']);
  });
});

describe('useBooks — bookByNoteId', () => {
  it('maps each note id to the book that holds it', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2']), mkBook('b2', ['n3'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const index = result.current.bookByNoteId;
    expect(index.get('n1')?.id).toBe('b1');
    expect(index.get('n3')?.id).toBe('b2');
  });

  it('excludes a note that no book holds', async () => {
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.bookByNoteId.has('n2')).toBe(false);
  });
});

describe('useBooks — chapter numbering', () => {
  it('suggests unnumbered for a chapter whose title reads as front matter', async () => {
    const store = fakeStore([mkBook('b1', [])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n1', 'Prologue');
    });

    expect(result.current.books[0].unnumberedIds).toEqual(['n1']);
  });

  it('numbers an ordinary chapter', async () => {
    const store = fakeStore([mkBook('b1', [])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n1', '#1 - The Fallen Nest');
    });

    expect(result.current.books[0].unnumberedIds).toEqual([]);
  });

  it('writes the suggestion to the book rather than leaving it to be re-guessed', async () => {
    const store = fakeStore([mkBook('b1', [])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n1', 'Prologue');
    });

    // On disk, so the reader can change it and have the change stick.
    expect(store.puts.at(-1)?.unnumberedIds).toEqual(['n1']);
  });

  it('takes a chapter out of the numbering', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setChapterNumbered('b1', 'n2', false);
    });

    expect(result.current.books[0].unnumberedIds).toEqual(['n2']);
    expect(store.puts.at(-1)?.unnumberedIds).toEqual(['n2']);
  });

  it('puts a chapter back into the numbering', async () => {
    const store = fakeStore([{ ...mkBook('b1', ['n1']), unnumberedIds: ['n1'] }]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setChapterNumbered('b1', 'n1', true);
    });

    expect(result.current.books[0].unnumberedIds).toEqual([]);
  });

  it('does not list the same chapter as unnumbered twice', async () => {
    const store = fakeStore([{ ...mkBook('b1', ['n1']), unnumberedIds: ['n1'] }]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setChapterNumbered('b1', 'n1', false);
    });

    expect(result.current.books[0].unnumberedIds).toEqual(['n1']);
  });

  it('works on a book saved before numbering existed', async () => {
    // No unnumberedIds field at all, which is every book already on disk.
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.books[0].unnumberedIds).toBeUndefined();

    await act(async () => {
      await result.current.setChapterNumbered('b1', 'n1', false);
    });

    expect(result.current.books[0].unnumberedIds).toEqual(['n1']);
  });

  it('forgets the numbering decision when the chapter leaves the book', async () => {
    const store = fakeStore([
      { ...mkBook('b1', ['n1', 'n2']), unnumberedIds: ['n2'] },
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeChapter('b1', 'n2');
    });

    // Otherwise the book keeps an opinion about a chapter it no longer has,
    // and that opinion reappears if the note is added again later.
    expect(result.current.books[0].unnumberedIds).toEqual([]);
  });

  it('leaves the numbering alone when chapters are reordered', async () => {
    const store = fakeStore([
      { ...mkBook('b1', ['n1', 'n2']), unnumberedIds: ['n1'] },
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.reorderChapters('b1', ['n2', 'n1']);
    });

    expect(result.current.books[0].unnumberedIds).toEqual(['n1']);
  });
});

describe('useBooks — a note belongs to one book', () => {
  it('takes the note out of its old book when it is added to another', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2']), mkBook('b2', ['n3'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b2', 'n2', 'A Chapter');
    });

    const byId = (id: string) => result.current.books.find((b) => b.id === id)!;
    expect(byId('b1').chapterIds).toEqual(['n1']);
    expect(byId('b2').chapterIds).toEqual(['n3', 'n2']);
  });

  it('persists the book the note left, not only the one it joined', async () => {
    const store = fakeStore([mkBook('b1', ['n1']), mkBook('b2', [])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b2', 'n1', 'A Chapter');
    });

    const written = store.puts.filter((b) => b.id === 'b1');
    expect(written.at(-1)?.chapterIds).toEqual([]);
  });

  /**
   * The old book's opinion about whether the chapter was numbered has to go
   * with it. Left behind it would be waiting to reappear if the note ever came
   * back, carrying a decision made about a different arrangement of the book.
   */
  it('leaves no numbering decision behind in the old book', async () => {
    const store = fakeStore([
      { ...mkBook('b1', ['n1']), unnumberedIds: ['n1'] },
      mkBook('b2', []),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b2', 'n1', 'A Chapter');
    });

    expect(result.current.books.find((b) => b.id === 'b1')!.unnumberedIds).toEqual([]);
  });

  it('does not disturb the book when the note is added back to where it already is', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n2', 'A Chapter');
    });

    expect(result.current.books[0].chapterIds).toEqual(['n1', 'n2']);
  });

  /**
   * Without the guard the book is briefly written without the chapter and then
   * written back with it. The end state is the same either way, which is why
   * this checks what was written rather than what is left.
   */
  it('never writes the book without a chapter it is keeping', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b1', 'n2', 'A Chapter');
    });

    const missing = store.puts.filter(
      (b) => b.id === 'b1' && !b.chapterIds.includes('n2')
    );
    expect(missing).toEqual([]);
  });

  it('names the book a note belongs to', async () => {
    const store = fakeStore([mkBook('b1', ['n1']), mkBook('b2', ['n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.bookByNoteId.get('n2')?.id).toBe('b2');
  });

  it('reports no book for a note that is in none', async () => {
    const store = fakeStore([mkBook('b1', ['n1'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.bookByNoteId.get('n9') ?? null).toBeNull();
  });

  it('reports the new book immediately after a move', async () => {
    const store = fakeStore([mkBook('b1', ['n1']), mkBook('b2', [])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b2', 'n1', 'A Chapter');
    });

    expect(result.current.bookByNoteId.get('n1')?.id).toBe('b2');
  });
});

describe('useBooks — stories', () => {
  const withStories = (id: string, chapterIds: string[], stories: Book['stories']): Book => ({
    ...mkBook(id, chapterIds),
    stories,
  });

  it('starts a story at a chapter', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setStoryStart('b1', 'n2', 'Echoes');
    });

    expect(result.current.books[0].stories).toEqual([{ startsAt: 'n2', title: 'Echoes' }]);
  });

  it('renames the story already starting at that chapter instead of adding a second', async () => {
    const store = fakeStore([withStories('b1', ['n1'], [{ startsAt: 'n1', title: 'Echoes' }])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setStoryStart('b1', 'n1', 'Fracture');
    });

    expect(result.current.books[0].stories).toEqual([{ startsAt: 'n1', title: 'Fracture' }]);
  });

  it('takes the division away when the title is null', async () => {
    const store = fakeStore([withStories('b1', ['n1', 'n2'], [{ startsAt: 'n2', title: 'Echoes' }])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setStoryStart('b1', 'n2', null);
    });

    expect(result.current.books[0].stories).toEqual([]);
  });

  /* Anything walking the marks should meet them in the order the reader will. */
  it('keeps the marks in reading order however they were added', async () => {
    const store = fakeStore([mkBook('b1', ['n1', 'n2', 'n3'])]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setStoryStart('b1', 'n3', 'Third');
    });
    await act(async () => {
      await result.current.setStoryStart('b1', 'n1', 'First');
    });

    expect(result.current.books[0].stories?.map((m) => m.startsAt)).toEqual(['n1', 'n3']);
  });

  /**
   * The story survives losing the chapter that opened it. Deleting the mark
   * would silently merge it into whatever came before, which is a bigger
   * change than the one the reader asked for.
   */
  it('moves a story to the next chapter when the one opening it is removed', async () => {
    const store = fakeStore([
      withStories('b1', ['n1', 'n2', 'n3'], [{ startsAt: 'n2', title: 'Echoes' }]),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeChapter('b1', 'n2');
    });

    expect(result.current.books[0].stories).toEqual([{ startsAt: 'n3', title: 'Echoes' }]);
  });

  it('drops a story whose last chapter is removed', async () => {
    const store = fakeStore([
      withStories('b1', ['n1', 'n2'], [{ startsAt: 'n2', title: 'Echoes' }]),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeChapter('b1', 'n2');
    });

    expect(result.current.books[0].stories).toEqual([]);
  });

  /**
   * Two marks on one chapter would be two stories starting in the same place,
   * which is not a thing a book can do.
   */
  it('does not stack a story onto a chapter that already opens one', async () => {
    const store = fakeStore([
      withStories(
        'b1',
        ['n1', 'n2'],
        [
          { startsAt: 'n1', title: 'Echoes' },
          { startsAt: 'n2', title: 'Fracture' },
        ]
      ),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.removeChapter('b1', 'n1');
    });

    expect(result.current.books[0].stories).toEqual([{ startsAt: 'n2', title: 'Fracture' }]);
  });

  it('takes a story with it when the note moves to another book', async () => {
    const store = fakeStore([
      withStories('b1', ['n1', 'n2'], [{ startsAt: 'n1', title: 'Echoes' }]),
      mkBook('b2', []),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.addChapter('b2', 'n1', 'A Chapter');
    });

    const b1 = result.current.books.find((b) => b.id === 'b1')!;
    expect(b1.stories).toEqual([{ startsAt: 'n2', title: 'Echoes' }]);
  });
});
