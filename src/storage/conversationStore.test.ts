import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, ScoredChunk } from '../types';
import {
  CHATS_DIR,
  CONVERSATIONS_KEY,
  conversationFilename,
  createFolderConversationStore,
  createLocalConversationStore,
} from './conversationStore';

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

const source: ScoredChunk = {
  noteId: 'note-1',
  noteTitle: 'Project notes',
  position: 0,
  text: 'The exact quote from a note.',
  score: 0.98,
  matchedTerms: ['exact', 'quote'],
  coverage: 1,
};

const mk = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: overrides.id ?? 'conversation-1',
  title: overrides.title ?? 'How should search work?',
  messages: overrides.messages ?? [
    {
      id: 'message-user-1',
      role: 'user',
      text: 'How should search work?',
      createdAt: '2026-09-15T10:00:00.000Z',
    },
  ],
  createdAt: overrides.createdAt ?? '2026-09-15T10:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-09-15T10:05:00.000Z',
});

const withAnswer = (): Conversation =>
  mk({
    id: 'answered-conversation',
    title: 'What did my note say?',
    messages: [
      {
        id: 'message-user-1',
        role: 'user',
        text: 'What did my note say?',
        createdAt: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'message-assistant-1',
        role: 'assistant',
        text: 'The exact quote from a note.',
        answer: {
          text: 'The exact quote from a note.',
          sources: [source],
          trace: {
            intent: 'search',
            confidence: 0.91,
            queryTerms: ['exact', 'quote'],
            candidatesConsidered: 3,
            results: [source],
            reason: 'Matched exact query terms.',
          },
        },
        createdAt: '2026-09-15T10:00:02.000Z',
      },
    ],
  });

const store = (root: FakeDir) => createFolderConversationStore(root as unknown as FileSystemDirectoryHandle);
const chatsDir = (root: FakeDir): FakeDir => {
  const dir = root.dirs.get(CHATS_DIR);
  if (!dir) throw new Error('Expected chats directory to exist');
  return dir;
};
const seedJson = (dir: FakeDir, name: string, value: unknown): void => {
  dir.files.set(name, new FakeFile(name, JSON.stringify(value)));
};

describe('createFolderConversationStore', () => {
  it('creates the chats subfolder and writes one json file per conversation inside it', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'first', title: 'First chat' }));
    await s.put(mk({ id: 'second', title: 'Second chat' }));

    const dir = chatsDir(root);
    const names = [...dir.files.keys()].sort();
    expect(names).toHaveLength(2);
    expect(names.every((name) => name.endsWith('.json'))).toBe(true);
    expect(names).toEqual(['first-chat-first.json', 'second-chat-second.json']);
  });

  it('does not write anything to the root of the picked folder', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk());

    expect(root.files.size).toBe(0);
    expect(chatsDir(root).files.size).toBe(1);
  });

  it('reads conversations back with messages and nested answer intact', async () => {
    const root = new FakeDir();
    const s = store(root);
    const conversation = withAnswer();

    await s.put(conversation);

    await expect(s.list()).resolves.toEqual([conversation]);
  });

  it('names the file with a slug of the title plus the id', async () => {
    const root = new FakeDir();
    const s = store(root);
    const conversation = mk({ id: 'id-123', title: 'Postgres Index Tuning' });

    await s.put(conversation);

    expect([...chatsDir(root).files.keys()]).toEqual([conversationFilename(conversation)]);
    expect(conversationFilename(conversation)).toBe('postgres-index-tuning-id-123.json');
  });

  it('keeps unsafe filename characters safe on disk and round-trips the title verbatim', async () => {
    const root = new FakeDir();
    const s = store(root);
    const title = 'a/b: "c" <d> \\| e? 😄\nnext line';
    const conversation = mk({ id: 'unsafe-title', title });

    await s.put(conversation);

    const [name] = [...chatsDir(root).files.keys()];
    expect(name).toBe('a-b-c-d-e-next-line-unsafe-title.json');
    expect(name).not.toMatch(/[/:"<>\\|?\n😄]/u);
    expect((await s.list())[0].title).toBe(title);
  });

  it('gives a conversation whose title reduces to nothing the untitled slug and round-trips the title', async () => {
    const root = new FakeDir();
    const s = store(root);
    const title = '???!!! 😄😄';
    const conversation = mk({ id: 'punctuation-only', title });

    await s.put(conversation);

    expect([...chatsDir(root).files.keys()]).toEqual(['untitled-punctuation-only.json']);
    expect((await s.list())[0].title).toBe(title);
  });

  it('updates in place rather than creating a second file when the same conversation is put twice', async () => {
    const root = new FakeDir();
    const s = store(root);
    const first = mk({ id: 'same', title: 'Stable title', updatedAt: '2026-09-15T10:00:00.000Z' });
    const second = mk({ id: 'same', title: 'Stable title', updatedAt: '2026-09-15T11:00:00.000Z' });

    await s.put(first);
    await s.put(second);

    expect(chatsDir(root).files.size).toBe(1);
    await expect(s.list()).resolves.toEqual([second]);
  });

  it('removes the file when a conversation is deleted', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'gone', title: 'Gone' }));
    await s.remove('gone');

    expect(chatsDir(root).files.size).toBe(0);
    await expect(s.list()).resolves.toEqual([]);
  });

  it('removes a conversation when the filename cache is cold by scanning', async () => {
    const root = new FakeDir();
    const conversation = mk({ id: 'cold-cache', title: 'Cold cache' });
    const dir = await root.getDirectoryHandle(CHATS_DIR, { create: true });
    seedJson(dir, 'renamed-by-hand.json', conversation);
    const s = store(root);

    await s.remove('cold-cache');

    expect(chatsDir(root).files.size).toBe(0);
  });

  it('treats removing an unknown id as a no-op that does not throw', async () => {
    const root = new FakeDir();
    const s = store(root);
    const conversation = mk({ id: 'known', title: 'Known' });

    await s.put(conversation);

    await expect(s.remove('unknown')).resolves.toBeUndefined();
    await expect(s.list()).resolves.toEqual([conversation]);
  });

  it('skips a file containing invalid JSON and still returns the valid conversations', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid', title: 'Valid' });

    await s.put(valid);
    chatsDir(root).files.set('broken.json', new FakeFile('broken.json', '{not json'));

    await expect(s.list()).resolves.toEqual([valid]);
  });

  it('skips files whose JSON shape is wrong and still returns the valid conversations', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid', title: 'Valid' });
    const dir = await root.getDirectoryHandle(CHATS_DIR, { create: true });

    await s.put(valid);
    seedJson(dir, 'messages-not-array.json', { ...valid, id: 'bad-1', messages: 'nope' });
    seedJson(dir, 'message-missing-role.json', {
      ...valid,
      id: 'bad-2',
      messages: [{ id: 'm1', text: 'missing role', createdAt: '2026-09-15T10:00:00.000Z' }],
    });
    seedJson(dir, 'malformed-trace.json', {
      ...withAnswer(),
      id: 'bad-3',
      messages: [
        {
          id: 'm2',
          role: 'assistant',
          text: 'bad trace',
          answer: { text: 'bad trace', sources: [source], trace: { intent: 'search', results: ['bad chunk'] } },
          createdAt: '2026-09-15T10:00:00.000Z',
        },
      ],
    });

    await expect(s.list()).resolves.toEqual([valid]);
  });

  it('ignores files in chats that do not end in json', async () => {
    const root = new FakeDir();
    const s = store(root);
    const valid = mk({ id: 'valid', title: 'Valid' });

    await s.put(valid);
    chatsDir(root).files.set('not-a-chat.txt', new FakeFile('not-a-chat.txt', JSON.stringify(withAnswer())));
    chatsDir(root).files.set('also-not-json.md', new FakeFile('also-not-json.md', JSON.stringify(withAnswer())));

    await expect(s.list()).resolves.toEqual([valid]);
  });

  it('returns conversations sorted by updatedAt descending', async () => {
    const root = new FakeDir();
    const s = store(root);

    await s.put(mk({ id: 'old', title: 'Old', updatedAt: '2026-09-15T10:00:00.000Z' }));
    await s.put(mk({ id: 'new', title: 'New', updatedAt: '2026-09-15T12:00:00.000Z' }));
    await s.put(mk({ id: 'middle', title: 'Middle', updatedAt: '2026-09-15T11:00:00.000Z' }));

    expect((await s.list()).map((conversation) => conversation.id)).toEqual(['new', 'middle', 'old']);
  });
});

describe('createLocalConversationStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a conversation through put and list', async () => {
    const s = createLocalConversationStore();
    const conversation = withAnswer();

    await s.put(conversation);

    await expect(s.list()).resolves.toEqual([conversation]);
  });

  it('upserts by id rather than appending a duplicate', async () => {
    const s = createLocalConversationStore();
    const first = mk({ id: 'same', title: 'Stable title', updatedAt: '2026-09-15T10:00:00.000Z' });
    const second = mk({ id: 'same', title: 'Stable title', updatedAt: '2026-09-15T11:00:00.000Z' });

    await s.put(first);
    await s.put(second);

    const listed = await s.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(second);
    expect(listed.some((conversation) => conversation.updatedAt === first.updatedAt)).toBe(false);
  });

  it('removes by id', async () => {
    const s = createLocalConversationStore();
    await s.put(mk({ id: 'keep', title: 'Keep' }));
    await s.put(mk({ id: 'remove', title: 'Remove' }));

    await s.remove('remove');

    expect((await s.list()).map((conversation) => conversation.id)).toEqual(['keep']);
  });

  it('returns an empty array when the key is absent', async () => {
    const s = createLocalConversationStore();

    await expect(s.list()).resolves.toEqual([]);
  });

  it('returns an empty array when the stored value is invalid JSON', async () => {
    localStorage.setItem(CONVERSATIONS_KEY, '{not valid json');
    const s = createLocalConversationStore();

    await expect(s.list()).resolves.toEqual([]);
  });

  it('drops a malformed conversation and keeps the valid ones', async () => {
    const valid = mk({ id: 'valid', title: 'Valid' });
    const malformed = { ...withAnswer(), id: 'bad', messages: [{ id: 'm1', role: 'assistant', text: 'bad', createdAt: 'x', answer: { trace: null } }] };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([valid, malformed]));
    const s = createLocalConversationStore();

    await expect(s.list()).resolves.toEqual([valid]);
  });

  it('sorts by updatedAt descending', async () => {
    localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify([
        mk({ id: 'old', title: 'Old', updatedAt: '2026-09-15T10:00:00.000Z' }),
        mk({ id: 'new', title: 'New', updatedAt: '2026-09-15T12:00:00.000Z' }),
        mk({ id: 'middle', title: 'Middle', updatedAt: '2026-09-15T11:00:00.000Z' }),
      ])
    );
    const s = createLocalConversationStore();

    expect((await s.list()).map((conversation) => conversation.id)).toEqual(['new', 'middle', 'old']);
  });

  it('does not throw when localStorage setItem throws', async () => {
    const s = createLocalConversationStore();
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });

    await expect(s.put(mk())).resolves.toBeUndefined();

    setItem.mockRestore();
  });
});
