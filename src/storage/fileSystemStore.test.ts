import { createFileSystemStore } from './fileSystemStore';
import { serialiseNote } from './markdown';
import type { Note } from '../types';

// Minimal in-memory stand-in for FileSystemDirectoryHandle.
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
  name = 'fake-folder';
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' });
      this.files.set(name, new FakeFile(name));
    }
    const f = this.files.get(name)!;
    return {
      kind: 'file' as const, name,
      getFile: async () => ({
        name: f.name, lastModified: f.lastModified,
        text: async () => f.contents,
      }),
      createWritable: async () => {
        let buf = '';
        return {
          write: async (c: string) => { buf += c; },
          close: async () => { f.contents = buf; f.lastModified = Date.now(); },
        };
      },
    };
  }
  async removeEntry(name: string) { this.files.delete(name); }
  async *values() {
    for (const f of this.files.values()) yield await this.getFileHandle(f.name);
  }
  [Symbol.asyncIterator]() { return this.values(); }
}

const mk = (id: string, title: string, body: string, updatedAt: string): Note => ({
  id, title, body, tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
});

const store = (d: FakeDir) => createFileSystemStore(d as unknown as FileSystemDirectoryHandle);

it('writes one .md file per note and reads them back', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Postgres index tuning', 'body one', '2026-01-02T00:00:00.000Z'));
  await s.put(mk('a2', 'Sourdough', 'body two', '2026-01-03T00:00:00.000Z'));
  const names = [...d.files.keys()];
  expect(names).toHaveLength(2);
  expect(names.every(n => n.endsWith('.md'))).toBe(true);
  expect(names.some(n => n.includes('postgres-index-tuning'))).toBe(true);
  const listed = await s.list();
  expect(listed.map(n => n.id).sort()).toEqual(['a1', 'a2']);
  expect(listed.find(n => n.id === 'a1')!.body).toBe('body one');
});

it('updates in place rather than creating a second file for the same note', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Title', 'v1', '2026-01-02T00:00:00.000Z'));
  await s.put(mk('a1', 'Title', 'v2', '2026-01-04T00:00:00.000Z'));
  expect(d.files.size).toBe(1);
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].body).toBe('v2');
});

it('does not leave a duplicate note behind when the title changes', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Old title', 'body', '2026-01-02T00:00:00.000Z'));
  await s.put(mk('a1', 'Brand new title', 'body', '2026-01-05T00:00:00.000Z'));
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].title).toBe('Brand new title');
  expect(d.files.size).toBe(1);
});

it('removes the file when a note is deleted', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Gone', 'body', '2026-01-02T00:00:00.000Z'));
  await s.remove('a1');
  expect(d.files.size).toBe(0);
  expect(await s.list()).toEqual([]);
});

it('identifies notes by frontmatter id, so renaming a file in Finder does not duplicate it', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Original', 'body', '2026-01-02T00:00:00.000Z'));
  const [oldName] = [...d.files.keys()];
  const f = d.files.get(oldName)!;
  d.files.delete(oldName);
  d.files.set('renamed-by-hand.md', new FakeFile('renamed-by-hand.md', f.contents, f.lastModified));
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe('a1');
  await s.put({ ...mk('a1', 'Original', 'edited', '2026-01-06T00:00:00.000Z') });
  expect(await s.list()).toHaveLength(1);
});

it('skips a corrupt file instead of losing the whole library', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Good', 'fine', '2026-01-02T00:00:00.000Z'));
  d.files.set('garbage.md', new FakeFile('garbage.md', 'not frontmatter at all'));
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe('a1');
});

it('ignores non-markdown files in the folder', async () => {
  const d = new FakeDir(); const s = store(d);
  await s.put(mk('a1', 'Good', 'fine', '2026-01-02T00:00:00.000Z'));
  d.files.set('notes.txt', new FakeFile('notes.txt', 'hello'));
  d.files.set('.DS_Store', new FakeFile('.DS_Store', 'junk'));
  expect(await s.list()).toHaveLength(1);
});

// ---------- Extended coverage ----------

const seedFile = (d: FakeDir, filename: string, note: Note, lastModified = Date.now()) => {
  d.files.set(filename, new FakeFile(filename, serialiseNote(note), lastModified));
};

it('adopts .md files already in the folder (written by another tool) instead of overwriting them', async () => {
  // Simulate a folder pre-populated by Obsidian or a git checkout, with no
  // prior contact with this app. First list() must surface those notes.
  const d = new FakeDir();
  const preexisting1 = mk('pre-1', 'From another editor', 'external body one', '2026-02-01T00:00:00.000Z');
  const preexisting2 = mk('pre-2', 'Also external', 'external body two', '2026-02-02T00:00:00.000Z');
  seedFile(d, 'from-another-editor-pre-1.md', preexisting1);
  seedFile(d, 'also-external-pre-2.md', preexisting2);

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(2);
  const byId = new Map(listed.map((n) => [n.id, n]));
  expect(byId.get('pre-1')?.body).toBe('external body one');
  expect(byId.get('pre-2')?.body).toBe('external body two');
  // Prove no file was overwritten or created: same two files, same contents.
  expect([...d.files.keys()].sort()).toEqual(['also-external-pre-2.md', 'from-another-editor-pre-1.md']);
});

it('adopts existing files AND unions them with subsequently put notes', async () => {
  const d = new FakeDir();
  seedFile(d, 'existing-ext-1.md', mk('ext-1', 'Existing', 'external', '2026-02-01T00:00:00.000Z'));

  const s = store(d);
  await s.put(mk('own-1', 'Ours', 'own body', '2026-03-01T00:00:00.000Z'));

  const listed = await s.list();
  const ids = listed.map((n) => n.id).sort();
  expect(ids).toEqual(['ext-1', 'own-1']);
  expect(listed.find((n) => n.id === 'ext-1')!.body).toBe('external');
  expect(listed.find((n) => n.id === 'own-1')!.body).toBe('own body');
});

it('collapses two files with the same frontmatter id to the newer updatedAt (last-write-wins)', async () => {
  // Drive can legitimately leave two files carrying the same id (e.g. a
  // conflicted copy, or a rename that raced with a write). list() must
  // deduplicate on id and prefer the newer updatedAt.
  const d = new FakeDir();
  const older = mk('dup', 'Older title', 'OLDER CONTENT', '2026-01-01T00:00:00.000Z');
  const newer = mk('dup', 'Newer title', 'NEWER CONTENT', '2026-06-01T00:00:00.000Z');
  seedFile(d, 'older-copy-dup.md', older);
  seedFile(d, 'newer-copy-dup.md', newer);

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe('dup');
  // Both halves of the assertion matter: the newer wins AND the older is gone.
  expect(listed[0].body).toBe('NEWER CONTENT');
  expect(listed[0].title).toBe('Newer title');
  expect(listed.some((n) => n.body === 'OLDER CONTENT')).toBe(false);
  expect(listed.some((n) => n.title === 'Older title')).toBe(false);
});

it('adopts a note whose frontmatter dates are unparseable, falling back to file lastModified', async () => {
  // Losing a note because an editor reformatted its date is unacceptable.
  // The store must fall back to the file's mtime rather than dropping it.
  const d = new FakeDir();
  const badDateContent =
    '---\nid: bad-date\ntitle: "Has bad dates"\ntags: []\ncreatedAt: not-a-date-at-all\nupdatedAt: also-junk\n---\n\nreal body content';
  const fixedMtime = Date.parse('2026-04-15T12:34:56.000Z');
  d.files.set('has-bad-dates-bad-date.md', new FakeFile('has-bad-dates-bad-date.md', badDateContent, fixedMtime));

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(1);
  const [note] = listed;
  expect(note.id).toBe('bad-date');
  expect(note.body).toBe('real body content');
  // Fallback = file lastModified as canonical ISO. Assert exact value.
  const expected = new Date(fixedMtime).toISOString();
  expect(note.createdAt).toBe(expected);
  expect(note.updatedAt).toBe(expected);
  // Prove the junk strings did not leak through as the dates.
  expect(note.createdAt).not.toBe('not-a-date-at-all');
  expect(note.updatedAt).not.toBe('also-junk');
  expect(note.createdAt).not.toBe('');
  expect(note.updatedAt).not.toBe('');
});

it('round-trips a note whose title is empty through put and list', async () => {
  const d = new FakeDir();
  const s = store(d);
  const note = mk('empty-title', '', 'body of a titleless note', '2026-05-01T00:00:00.000Z');
  await s.put(note);

  // Filename must be usable: "untitled-<id>.md", never bare ".md" or hidden.
  const names = [...d.files.keys()];
  expect(names).toHaveLength(1);
  expect(names[0]).toBe('untitled-empty-title.md');
  expect(names[0]).not.toBe('.md');
  expect(names[0].startsWith('.')).toBe(false);

  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe('empty-title');
  expect(listed[0].title).toBe('');
  expect(listed[0].body).toBe('body of a titleless note');
});

it('round-trips a note whose title is punctuation-only through put and list', async () => {
  const d = new FakeDir();
  const s = store(d);
  const note = mk('punct-title', '???!!!', 'punct body', '2026-05-02T00:00:00.000Z');
  await s.put(note);

  const names = [...d.files.keys()];
  expect(names[0]).toBe('untitled-punct-title.md');

  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe('punct-title');
  expect(listed[0].title).toBe('???!!!');
  expect(listed[0].body).toBe('punct body');
});
