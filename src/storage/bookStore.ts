import type { Book } from '../types';
import type { BookStore, BookListResult } from './types';

export const BOOKS_DIR = 'books';
export const BOOKS_KEY = 'glassbox.books.v1';

/* Named by id alone. The title is whatever the user typed and can contain
   path separators, quotes, anything, so deriving a filename from it means
   sanitising text that is allowed to be arbitrary. The id is already filename
   safe. */
export const bookFilename = (book: Book): string => `${book.id}.json`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isBook = (value: unknown): value is Book => {
  if (typeof value !== 'object' || value === null) return false;
  const book = value as Record<string, unknown>;
  return (
    typeof book.id === 'string' &&
    typeof book.title === 'string' &&
    // chapterIds must be an array of strings. A book whose order is corrupt is
    // a book that would render nothing, so it is rejected here and counted as
    // skipped rather than returned half-valid.
    isStringArray(book.chapterIds) &&
    typeof book.createdAt === 'string' &&
    typeof book.updatedAt === 'string'
  );
};

const sortByUpdatedAtDesc = (books: Book[]): Book[] =>
  [...books].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const isStoryMarkArray = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as Record<string, unknown>).startsAt === 'string' &&
      typeof (m as Record<string, unknown>).title === 'string'
  );

/**
 * Drops numbering and story data that is the wrong shape, keeping the book.
 *
 * A corrupt chapterIds is fatal above, because a book whose order is broken
 * renders nothing. These two cost only the numbering and the story divisions,
 * and throwing away someone's book over either would be the greater loss.
 */
const normalizeBook = (book: Book): Book => {
  const fields = book as unknown as Record<string, unknown>;
  let next = book;

  const unnumbered: unknown = fields.unnumberedIds;
  if (unnumbered !== undefined && !isStringArray(unnumbered)) {
    const { unnumberedIds: _corrupt, ...rest } = next;
    next = rest;
  }

  const stories: unknown = fields.stories;
  if (stories !== undefined && !isStoryMarkArray(stories)) {
    const { stories: _corrupt, ...rest } = next;
    next = rest;
  }

  return next;
};

export const createFolderBookStore = (root: FileSystemDirectoryHandle): BookStore => {
  const filenamesById = new Map<string, string>();

  /* Resolved once and kept. Concurrent callers may each ask for it before the
     first resolves, which is harmless: getDirectoryHandle with create is
     idempotent. Caching the handle rather than the promise means a failure
     (permission revoked mid-session) is retried on the next call instead of
     being memoised forever. */
  let booksDir: FileSystemDirectoryHandle | null = null;
  const dir = async (): Promise<FileSystemDirectoryHandle> => {
    if (booksDir) return booksDir;
    booksDir = await root.getDirectoryHandle(BOOKS_DIR, { create: true });
    return booksDir;
  };

  const readFile = async (
    fileHandle: FileSystemFileHandle
  ): Promise<{ book: Book; filename: string } | null> => {
    let file: File;
    try {
      file = await fileHandle.getFile();
    } catch {
      return null;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return null;
    }

    if (!isBook(parsed)) return null;
    return { book: normalizeBook(parsed), filename: fileHandle.name };
  };

  const list = async (): Promise<BookListResult> => {
    const books: Book[] = [];
    let skipped = 0;
    const handle = await dir();

    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!entry.name.toLowerCase().endsWith('.json')) continue;

      const parsed = await readFile(entry);
      if (!parsed) {
        skipped++;
        continue;
      }

      // The name on disk, not the name we would generate. A file renamed by
      // hand still deletes correctly because this is what remove looks up.
      filenamesById.set(parsed.book.id, parsed.filename);
      books.push(parsed.book);
    }

    return { books: sortByUpdatedAtDesc(books), skipped };
  };

  const writeFile = async (name: string, contents: string): Promise<void> => {
    const fileHandle = await (await dir()).getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }
  };

  const put = async (book: Book): Promise<void> => {
    const name = bookFilename(book);
    await writeFile(name, JSON.stringify(book, null, 2));
    filenamesById.set(book.id, name);
  };

  const remove = async (id: string): Promise<void> => {
    /* list() records the real filename for everything it read, so a file
       renamed by hand is still found. Anything else is at the name we would
       have written it under. */
    const name = filenamesById.get(id) ?? `${id}.json`;

    try {
      await (await dir()).removeEntry(name);
    } catch {
      // Unknown id or already deleted. Silent by contract.
    }
    filenamesById.delete(id);
  };

  return {
    kind: 'folder',
    list,
    put,
    remove,
  };
};

export const createLocalBookStore = (): BookStore => {
  const readAll = (): BookListResult => {
    try {
      const raw = localStorage.getItem(BOOKS_KEY);
      if (raw === null) return { books: [], skipped: 0 };
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { books: [], skipped: 0 };
      const books = parsed.filter(isBook).map(normalizeBook);
      return {
        books: sortByUpdatedAtDesc(books),
        skipped: parsed.length - books.length,
      };
    } catch {
      return { books: [], skipped: 0 };
    }
  };

  const writeAll = (books: Book[]): void => {
    try {
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    } catch {
      // Non-fatal. The book list continues in memory.
    }
  };

  return {
    kind: 'local',
    list: async (): Promise<BookListResult> => readAll(),
    put: async (book: Book): Promise<void> => {
      const { books } = readAll();
      const idx = books.findIndex((item) => item.id === book.id);
      if (idx >= 0) books[idx] = book;
      else books.push(book);
      writeAll(books);
    },
    remove: async (id: string): Promise<void> => {
      const { books } = readAll();
      writeAll(books.filter((book) => book.id !== id));
    },
  };
};
