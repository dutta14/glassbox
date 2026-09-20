import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '../types';
import type { BookStore } from './types';
import {
  BOOKS_DIR,
  BOOKS_KEY,
  bookFilename,
  createFolderBookStore,
  createLocalBookStore,
} from './bookStore';

class FakeFile {
  name: string;
  contents: string;
  lastModified: number;

  constructor(name: string, contents = '', lastModified = Date.now()) {
    this.name = name;
    this.contents = contents;
    this.lastModified = lastModified;
  }
}

class FakeDir {
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  name = 'fake-folder';

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      this.files.set(name, new FakeFile(name));
    }
    const file = this.files.get(name)!;
    return {
      kind: 'file' as const,
      name,
      getFile: async () => ({
        name: file.name,
        lastModified: file.lastModified,
        text: async () => file.contents,
      }),
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (contents: string) => {
            buffer += contents;
          },
          close: async () => {
            file.contents = buffer;
            file.lastModified = Date.now();
          },
        };
      },
    };
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      const child = new FakeDir();
      child.name = name;
      this.dirs.set(name, child);
    }
    return this.dirs.get(name)!;
  }

  async removeEntry(name: string) {
    this.files.delete(name);
  }

  async *values() {
    for (const file of this.files.values()) yield await this.getFileHandle(file.name);
    for (const dir of this.dirs.values()) yield { kind: 'directory' as const, name: dir.name };
  }

  [Symbol.asyncIterator]() {
    return this.values();
  }
}

const mk = (overrides: Partial<Book> = {}): Book => ({
  id: overrides.id ?? 'book-1',
  title: overrides.title ?? 'Collected verse',
  chapterIds: overrides.chapterIds ?? ['note-1', 'note-2', 'note-3'],
  createdAt: overrides.createdAt ?? '2026-09-15T10:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-09-15T10:05:00.000Z',
});

const store = (root: FakeDir) => createFolderBookStore(root as unknown as FileSystemDirectoryHandle);
const booksDir = (root: FakeDir): FakeDir => {
  const dir = root.dirs.get(BOOKS_DIR);
  if (!dir) throw new Error('Expected books directory to exist');
  return dir;
};
const seedJson = (dir: FakeDir, name: string, value: unknown): void => {
  dir.files.set(name, new FakeFile(name, JSON.stringify(value)));
};

const booksIn = async (s: BookStore): Promise<Book[]> => (await s.list()).books;

describe('createFolderBookStore', () => {
  it('creates the books subfolder and writes one json file per book inside it', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'first', title: 'First book' }));
    await s.put(mk({ id: 'second', title: 'Second book' }));

    const dir = booksDir(root);
    const names = [...dir.files.keys()].sort();
    expect(names).toEqual(['first.json', 'second.json']);
    expect(names.every((name) => name.endsWith('.json'))).toBe(true);
  });

  it('does not write anything to the root of the picked folder', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk());

    expect(root.files.size).toBe(0);
    expect(booksDir(root).files.size).toBe(1);
  });

  it('round-trips a book with its chapter order intact', async () => {
    const root = new FakeDir();
    const s = store(root);
    const book = mk({ chapterIds: ['c-3', 'c-1', 'c-2'] });

    await s.put(book);

    await expect(booksIn(s)).resolves.toEqual([book]);
  });

  it('names the file with the id alone', async () => {
    const root = new FakeDir();
    const s = store(root);
    const book = mk({ id: 'id-123', title: 'Postgres Poems' });

    await s.put(book);

    expect([...booksDir(root).files.keys()]).toEqual([bookFilename(book)]);
    expect(bookFilename(book)).toBe('id-123.json');
  });

  it('keeps unsafe title characters out of the filename and round-trips the title verbatim', async () => {
    const root = new FakeDir();
    const s = store(root);
    const title = 'a/b: "c" <d> \\| e? 😄\nnext line';
    const book = mk({ id: 'unsafe-title', title });

    await s.put(book);

    const [name] = [...booksDir(root).files.keys()];
    expect(name).toBe('unsafe-title.json');
    expect(name).not.toMatch(/[/:"<>\\|?\n😄]/u);
    expect((await booksIn(s))[0].title).toBe(title);
  });

  it('updates in place rather than creating a second file when the same book is put twice', async () => {
    const root = new FakeDir();
    const s = store(root);
    const first = mk({ id: 'same', updatedAt: '2026-09-15T10:00:00.000Z' });
    const second = mk({ id: 'same', updatedAt: '2026-09-15T11:00:00.000Z' });

    await s.put(first);
    await s.put(second);

    expect(booksDir(root).files.size).toBe(1);
    await expect(booksIn(s)).resolves.toEqual([second]);
  });

  it('removes the file when a book is deleted', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'gone' }));
    await s.remove('gone');

    expect(booksDir(root).files.size).toBe(0);
    await expect(booksIn(s)).resolves.toEqual([]);
  });

  /* A file renamed by hand no longer sits at the name we would generate.
     list() records the real name, and the app lists on mount, so deleting it
     still finds it via filenamesById. */
  it('removes a file that was renamed by hand once the list has been read', async () => {
    const root = new FakeDir();
    const book = mk({ id: 'renamed' });
    const dir = await root.getDirectoryHandle(BOOKS_DIR, { create: true });
    seedJson(dir, 'renamed-by-hand.json', book);
    const s = store(root);

    await s.list();
    await s.remove('renamed');

    expect(booksDir(root).files.size).toBe(0);
  });

  it('treats removing an unknown id as a no-op that does not throw', async () => {
    const root = new FakeDir();
    const s = store(root);
    const book = mk({ id: 'known' });

    await s.put(book);

    await expect(s.remove('unknown')).resolves.toBeUndefined();
    await expect(booksIn(s)).resolves.toEqual([book]);
  });

  it('reports how many records it could not read', async () => {
    const root = new FakeDir();
    const s = store(root);
    await s.put(mk({ id: 'valid' }));
    booksDir(root).files.set('broken.json', new FakeFile('broken.json', '{not json'));
    booksDir(root).files.set('wrong.json', new FakeFile('wrong.json', '{"id":"x"}'));

    const result = await s.list();

    expect(result.books.map((b) => b.id)).toEqual(['valid']);
    expect(result.skipped).toBe(2);
  });

  it('reports nothing skipped when every record reads cleanly', async () => {
    const root = new FakeDir();
    const s = store(root);
    await s.put(mk({ id: 'a' }));

    await expect(s.list()).resolves.toMatchObject({ skipped: 0 });
  });

  it('does not count a non-json file as a skipped record', async () => {
    const root = new FakeDir();
    const s = store(root);
    await s.put(mk({ id: 'a' }));
    booksDir(root).files.set('notes.txt', new FakeFile('notes.txt', 'hello'));

    await expect(s.list()).resolves.toMatchObject({ skipped: 0 });
  });

  it('skips a book whose chapterIds is not an array and counts it', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid' });
    const dir = await root.getDirectoryHandle(BOOKS_DIR, { create: true });

    await s.put(valid);
    seedJson(dir, 'not-array.json', { ...valid, id: 'bad-1', chapterIds: 'nope' });

    const result = await s.list();
    expect(result.books).toEqual([valid]);
    expect(result.skipped).toBe(1);
  });

  it('skips a book whose chapterIds holds a non-string entry and counts it', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid' });
    const dir = await root.getDirectoryHandle(BOOKS_DIR, { create: true });

    await s.put(valid);
    seedJson(dir, 'non-string.json', { ...valid, id: 'bad-2', chapterIds: ['ok', 42, 'ok2'] });

    const result = await s.list();
    expect(result.books).toEqual([valid]);
    expect(result.skipped).toBe(1);
  });

  it('skips a file containing invalid JSON and still returns the valid books', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid' });

    await s.put(valid);
    booksDir(root).files.set('broken.json', new FakeFile('broken.json', '{not json'));

    await expect(booksIn(s)).resolves.toEqual([valid]);
  });

  it('ignores files in books that do not end in json', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid' });

    await s.put(valid);
    booksDir(root).files.set('not-a-book.txt', new FakeFile('not-a-book.txt', JSON.stringify(mk())));

    await expect(booksIn(s)).resolves.toEqual([valid]);
  });

  it('returns books sorted by updatedAt descending', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'old', updatedAt: '2026-09-15T10:00:00.000Z' }));
    await s.put(mk({ id: 'new', updatedAt: '2026-09-15T12:00:00.000Z' }));
    await s.put(mk({ id: 'middle', updatedAt: '2026-09-15T11:00:00.000Z' }));

    expect((await booksIn(s)).map((b) => b.id)).toEqual(['new', 'middle', 'old']);
  });
});

describe('createLocalBookStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a book through put and list', async () => {
    const s = createLocalBookStore();
    const book = mk();

    await s.put(book);

    await expect(booksIn(s)).resolves.toEqual([book]);
  });

  it('upserts by id rather than appending a duplicate', async () => {
    const s = createLocalBookStore();
    const first = mk({ id: 'same', updatedAt: '2026-09-15T10:00:00.000Z' });
    const second = mk({ id: 'same', updatedAt: '2026-09-15T11:00:00.000Z' });

    await s.put(first);
    await s.put(second);

    const listed = (await s.list()).books;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(second);
  });

  it('removes by id', async () => {
    const s = createLocalBookStore();
    await s.put(mk({ id: 'keep' }));
    await s.put(mk({ id: 'remove' }));

    await s.remove('remove');

    expect((await booksIn(s)).map((b) => b.id)).toEqual(['keep']);
  });

  it('returns an empty array when the key is absent', async () => {
    const s = createLocalBookStore();

    await expect(booksIn(s)).resolves.toEqual([]);
  });

  it('returns an empty array when the stored value is invalid JSON', async () => {
    localStorage.setItem(BOOKS_KEY, '{not valid json');
    const s = createLocalBookStore();

    await expect(booksIn(s)).resolves.toEqual([]);
  });

  it('keeps a book whose numbering data is corrupt, minus that data', async () => {
    const good = mk({ id: 'good' });
    const bent = { ...mk({ id: 'bent' }), unnumberedIds: 'nope' };
    localStorage.setItem(BOOKS_KEY, JSON.stringify([good, bent]));
    const s = createLocalBookStore();

    const result = await s.list();
    // Not skipped. A broken chapterIds means the book renders nothing, but a
    // broken unnumberedIds costs only the numbering, and throwing the book
    // away over it would be the greater loss.
    expect(result.skipped).toBe(0);
    const recovered = result.books.find((b) => b.id === 'bent');
    expect(recovered).toBeDefined();
    expect(recovered).not.toHaveProperty('unnumberedIds');
  });

  it('keeps numbering data that is a list of ids', async () => {
    const book = { ...mk({ id: 'b1' }), unnumberedIds: ['n1'] };
    localStorage.setItem(BOOKS_KEY, JSON.stringify([book]));
    const s = createLocalBookStore();

    const result = await s.list();
    expect(result.books[0].unnumberedIds).toEqual(['n1']);
  });

  it('drops a book with corrupt chapterIds and keeps the valid ones', async () => {
    const valid = mk({ id: 'valid' });
    const malformed = { ...mk(), id: 'bad', chapterIds: 'nope' };
    localStorage.setItem(BOOKS_KEY, JSON.stringify([valid, malformed]));
    const s = createLocalBookStore();

    const result = await s.list();
    expect(result.books).toEqual([valid]);
    expect(result.skipped).toBe(1);
  });

  it('sorts by updatedAt descending', async () => {
    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify([
        mk({ id: 'old', updatedAt: '2026-09-15T10:00:00.000Z' }),
        mk({ id: 'new', updatedAt: '2026-09-15T12:00:00.000Z' }),
        mk({ id: 'middle', updatedAt: '2026-09-15T11:00:00.000Z' }),
      ])
    );
    const s = createLocalBookStore();

    expect((await booksIn(s)).map((b) => b.id)).toEqual(['new', 'middle', 'old']);
  });

  it('does not throw when localStorage setItem throws', async () => {
    const s = createLocalBookStore();
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });

    await expect(s.put(mk())).resolves.toBeUndefined();

    setItem.mockRestore();
  });
});
