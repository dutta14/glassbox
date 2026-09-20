import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../types';
import { isFrontMatterTitle } from '../utils/chapterNumbering';
import type { BookStore } from '../storage/types';
import { createId } from '../storage/notes';

/**
 * Books are ordered sequences of existing notes. This hook owns the list and
 * every mutation, and persists each change as a single book write.
 *
 * A book holds note ids and the notes hold nothing about the book, so deleting
 * a book removes a running order and never touches a chapter. A chapterId can
 * point at a note deleted by hand outside the app; that dangling id is left in
 * place here and handled where chapters are rendered, so a missing note is a
 * missing chapter rather than a crash.
 */

const byNewestFirst = (a: Book, b: Book): number =>
  b.updatedAt.localeCompare(a.updatedAt);

export interface UseBooksResult {
  books: Book[];
  /**
   * False until the initial load settles, true afterwards even when the store
   * held nothing. An empty folder and a folder still being read both look like
   * `books: []`, so a route or icon that depends on "this note is in a book"
   * must wait for this before deciding a book does not exist.
   */
  loaded: boolean;
  createBook: (title: string) => Promise<Book>;
  /** The note's title is used to suggest whether the chapter takes a number. */
  addChapter: (bookId: string, noteId: string, noteTitle: string) => Promise<void>;
  setChapterNumbered: (
    bookId: string,
    noteId: string,
    numbered: boolean
  ) => Promise<void>;
  removeChapter: (bookId: string, noteId: string) => Promise<void>;
  reorderChapters: (bookId: string, chapterIds: string[]) => Promise<void>;
  renameBook: (bookId: string, title: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  /**
   * Reverse index from note id to the books that hold it, so a note row can
   * show a "part of a book" marker without scanning every book on every render.
   * Books are few, so this is cheap to rebuild whenever the list changes.
   */
  /**
   * The book each note belongs to. A note belongs to at most one, which is
   * why this is a book and not a list of them.
   */
  bookByNoteId: Map<string, Book>;
  removeNoteFromAllBooks: (noteId: string) => Promise<void>;
}

/**
 * A book with one chapter taken out of it, and with every decision that was
 * about that chapter taken out too. Left behind, they would come back to life
 * if the note were ever added again.
 */
const withoutChapter = (book: Book, noteId: string): Book => ({
  ...book,
  chapterIds: book.chapterIds.filter((id) => id !== noteId),
  unnumberedIds: (book.unnumberedIds ?? []).filter((id) => id !== noteId),
});

export const useBooks = (store: BookStore | null): UseBooksResult => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);

  /* Read through the ref rather than closing over the store, so callback
     identity is stable for the whole session. Closing over `store` would give
     every mutation a new identity on each render, and anything downstream that
     depends on one (an effect, a memo) would re-run for nothing. */
  const storeRef = useRef(store);
  storeRef.current = store;
  const booksRef = useRef<Book[]>(books);
  booksRef.current = books;

  useEffect(() => {
    if (store === null) return;
    let cancelled = false;
    void store
      .list()
      .then(({ books: loadedBooks }) => {
        if (cancelled) return;
        // Sorted here rather than trusted from the backend. Order is what the
        // UI shows, so it stays this hook's responsibility no matter which
        // store is behind it or what someone hand-edited on disk.
        setBooks([...loadedBooks].sort(byNewestFirst));
      })
      .catch(() => {
        // A backend that cannot be read leaves an empty list rather than a
        // broken panel. Individual malformed records are already dropped
        // inside the store.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  /* Every mutation reads the current book, produces the next one with a bumped
     updatedAt, and writes it. Persisting inside the setState updater would
     write twice under StrictMode, so the write is done against the ref before
     state is set. */
  const persist = useCallback((next: Book): void => {
    setBooks((prev) =>
      [next, ...prev.filter((b) => b.id !== next.id)].sort(byNewestFirst)
    );
    void storeRef.current?.put(next);
  }, []);

  const mutate = useCallback(
    async (bookId: string, change: (book: Book) => Book): Promise<void> => {
      const current = booksRef.current.find((b) => b.id === bookId);
      if (!current) return;
      const next: Book = {
        ...change(current),
        updatedAt: new Date().toISOString(),
      };
      persist(next);
    },
    [persist]
  );

  const createBook = useCallback(
    async (title: string): Promise<Book> => {
      const now = new Date().toISOString();
      const book: Book = {
        id: createId(),
        title,
        chapterIds: [],
        createdAt: now,
        updatedAt: now,
      };
      persist(book);
      return book;
    },
    [persist]
  );

  const addChapter = useCallback(
    async (bookId: string, noteId: string, noteTitle: string): Promise<void> => {
      /* A note belongs to one book at a time, so adding it somewhere is also
         taking it out of wherever it was. Done before the add rather than
         after, so that a failure part way through leaves the note in no book
         rather than in two, which is the state the rule exists to forbid. */
      const previous = booksRef.current.find(
        (b) => b.id !== bookId && b.chapterIds.includes(noteId)
      );
      if (previous) persist({ ...withoutChapter(previous, noteId), updatedAt: new Date().toISOString() });

      await mutate(bookId, (book) => {
        // Idempotent by contract. A note already in the book is not appended a
        // second time, so adding the same note twice leaves one entry rather
        // than a duplicate chapter that renders the same note back to back.
        if (book.chapterIds.includes(noteId)) return book;
        const unnumbered = book.unnumberedIds ?? [];
        return {
          ...book,
          chapterIds: [...book.chapterIds, noteId],
          /* Guessed from the title, then written down. Storing the answer
             rather than re-deriving it means the reader sees a decision they
             can change in the contents, instead of a rule that silently
             reasserts itself every time the book is opened. */
          unnumberedIds: isFrontMatterTitle(noteTitle)
            ? [...unnumbered, noteId]
            : unnumbered,
        };
      });
    },
    [mutate]
  );

  const setChapterNumbered = useCallback(
    async (bookId: string, noteId: string, numbered: boolean): Promise<void> => {
      await mutate(bookId, (book) => {
        const unnumbered = book.unnumberedIds ?? [];
        if (numbered) {
          return { ...book, unnumberedIds: unnumbered.filter((id) => id !== noteId) };
        }
        return unnumbered.includes(noteId)
          ? book
          : { ...book, unnumberedIds: [...unnumbered, noteId] };
      });
    },
    [mutate]
  );

  const removeChapter = useCallback(
    async (bookId: string, noteId: string): Promise<void> => {
      await mutate(bookId, (book) => withoutChapter(book, noteId));
    },
    [mutate]
  );


  const reorderChapters = useCallback(
    async (bookId: string, chapterIds: string[]): Promise<void> => {
      await mutate(bookId, (book) => ({ ...book, chapterIds: [...chapterIds] }));
    },
    [mutate]
  );

  const renameBook = useCallback(
    async (bookId: string, title: string): Promise<void> => {
      await mutate(bookId, (book) => ({ ...book, title }));
    },
    [mutate]
  );

  const deleteBook = useCallback(
    async (bookId: string): Promise<void> => {
      // Deletes the book record only. A book is a running order, not a
      // container, so removing it must leave every chapter exactly where it was
      // in the library. Nothing here touches a note.
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      await storeRef.current?.remove(bookId);
    },
    []
  );

  const removeNoteFromAllBooks = useCallback(
    async (noteId: string): Promise<void> => {
      // Called when a note is deleted in-app so books do not accumulate
      // dangling ids. Only the books that held the note are rewritten.
      const holders = booksRef.current.filter((b) =>
        b.chapterIds.includes(noteId)
      );
      const now = new Date().toISOString();
      const updates = holders.map((book) => ({
        ...book,
        chapterIds: book.chapterIds.filter((id) => id !== noteId),
        updatedAt: now,
      }));
      if (updates.length === 0) return;
      const updatedById = new Map(updates.map((b) => [b.id, b]));
      setBooks((prev) =>
        [...prev.map((b) => updatedById.get(b.id) ?? b)].sort(byNewestFirst)
      );
      await Promise.all(updates.map((book) => storeRef.current?.put(book)));
    },
    []
  );

  const bookByNoteId = useMemo(() => {
    const index = new Map<string, Book>();
    for (const book of books) {
      for (const noteId of book.chapterIds) index.set(noteId, book);
    }
    return index;
  }, [books]);

  return {
    books,
    loaded,
    createBook,
    addChapter,
    setChapterNumbered,
    removeChapter,
    reorderChapters,
    renameBook,
    deleteBook,
    bookByNoteId,
    removeNoteFromAllBooks,
  };
};
