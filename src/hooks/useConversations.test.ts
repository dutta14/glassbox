import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';
import type {
  Answer,
  Conversation,
  ScoredChunk,
  Trace,
} from '../types';
import type { ConversationStore } from '../storage/types';

const goodChunk = (): ScoredChunk => ({
  noteId: 'n1',
  noteTitle: 'Note',
  position: 0,
  text: 'body',
  score: 0.5,
  matchedTerms: ['body'],
  coverage: 1,
});

const goodTrace = (): Trace => ({
  intent: 'search',
  confidence: 0.9,
  queryTerms: ['body'],
  candidatesConsidered: 1,
  results: [goodChunk()],
  reason: 'ok',
});

const goodAnswer = (text = 'Here.'): Answer => ({
  text,
  sources: [goodChunk()],
  trace: goodTrace(),
});

const mkConversation = (
  id: string,
  title: string,
  updatedAt: string
): Conversation => ({
  id,
  title,
  messages: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
});

interface FakeStore extends ConversationStore {
  puts: Conversation[];
  removed: string[];
}

const fakeStore = (initial: Conversation[] = []): FakeStore => ({
  kind: 'local',
  puts: [],
  removed: [],
  list: async () => ({ conversations: initial, skipped: 0 }),
  async put(conversation) {
    this.puts.push(conversation);
  },
  async remove(id) {
    this.removed.push(id);
  },
});

/**
 * StrictMode on purpose. main.tsx renders the app inside it, so React invokes
 * every state updater twice in development. A hook that mints an id or writes
 * a file inside an updater looks correct in a plain render and produces two
 * records in the real app. Without this wrapper these tests pass either way.
 */
const setup = (store: ConversationStore | null = fakeStore()) =>
  renderHook(() => useConversations(store), { wrapper: StrictMode });

describe('useConversations — drafts', () => {
  it('starts in a draft with no active conversation and no messages', () => {
    const { result } = setup();

    expect(result.current.activeId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversations).toEqual([]);
  });

  /**
   * AC 27 and AC 38. A conversation that existed before its first message
   * would file an empty thread in the rail every time the user clicked
   * "New chat", which is the whole reason the draft state exists.
   */
  it('creates no conversation record when a draft is opened', () => {
    const store = fakeStore();
    const { result } = setup(store);

    act(() => result.current.startDraft());

    expect(result.current.conversations).toEqual([]);
    expect(store.puts).toEqual([]);
  });

  it('creates exactly one conversation when the first prompt is submitted', async () => {
    const store = fakeStore();
    const { result } = setup(store);

    act(() => result.current.append('how much shared_buffers?', goodAnswer()));

    expect(result.current.conversations).toHaveLength(1);
    expect(store.puts).toHaveLength(1);
  });

  /** AC 32. There is no model to name a thread, so the prompt is the name. */
  it('titles the conversation with the first prompt, verbatim', () => {
    const { result } = setup();

    act(() => result.current.append('  Why is the fog grading?  ', goodAnswer()));

    expect(result.current.conversations[0].title).toBe(
      '  Why is the fog grading?  '
    );
  });

  it('makes the newly created conversation active', () => {
    const { result } = setup();

    act(() => result.current.append('first', goodAnswer()));

    expect(result.current.activeId).toBe(result.current.conversations[0].id);
  });

  it('appends both the user and the assistant message to the new conversation', () => {
    const { result } = setup();

    act(() => result.current.append('first', goodAnswer('quoted passage')));

    expect(result.current.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(result.current.messages[0].text).toBe('first');
    expect(result.current.messages[1].text).toBe('quoted passage');
  });

  /** AC 31. A second prompt extends the thread rather than starting one. */
  it('appends later prompts to the active conversation instead of creating another', () => {
    const { result } = setup();

    act(() => result.current.append('first', goodAnswer()));
    act(() => result.current.append('second', goodAnswer()));

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.messages).toHaveLength(4);
  });

  /**
   * AC 31. The weaker claim is that no second thread appears. The claim that
   * matters is that no other thread changes, which is what "only that active
   * conversation" means and what a mis-scoped append would break.
   */
  it('leaves every other conversation untouched when a prompt is submitted', () => {
    const { result } = setup();
    act(() => result.current.append('first thread', goodAnswer()));
    const firstId = result.current.activeId;
    act(() => result.current.startDraft());
    act(() => result.current.append('second thread', goodAnswer()));

    act(() => result.current.append('more in second', goodAnswer()));

    const first = result.current.conversations.find((c) => c.id === firstId);
    expect(first?.messages).toHaveLength(2);
    expect(first?.messages.map((m) => m.text)).toEqual(['first thread', 'Here.']);
  });

  it('does not reopen an older thread when a new one is started', () => {
    const { result } = setup();
    act(() => result.current.append('older', goodAnswer()));
    const olderId = result.current.activeId;

    act(() => result.current.startDraft());
    act(() => result.current.append('newer', goodAnswer()));

    expect(result.current.activeId).not.toBe(olderId);
    expect(result.current.messages.map((m) => m.text)).toEqual(['newer', 'Here.']);
  });

  /** AC 26 and AC 30. Going back to a draft starts a genuinely new thread. */
  it('starts a second conversation when a prompt is submitted after returning to a draft', () => {
    const { result } = setup();

    act(() => result.current.append('first', goodAnswer()));
    act(() => result.current.startDraft());
    act(() => result.current.append('second', goodAnswer()));

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.messages).toHaveLength(2);
  });
});

describe('useConversations — ordering and loading', () => {
  /** AC 34. */
  it('orders conversations most recently updated first', async () => {
    const store = fakeStore([
      mkConversation('old', 'Older', '2026-01-01T00:00:00.000Z'),
      mkConversation('new', 'Newer', '2026-03-01T00:00:00.000Z'),
    ]);
    const { result } = setup(store);

    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    expect(result.current.conversations.map((c) => c.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('moves a conversation to the top when a new prompt is submitted to it', async () => {
    const store = fakeStore([
      mkConversation('a', 'A', '2026-01-01T00:00:00.000Z'),
      mkConversation('b', 'B', '2026-03-01T00:00:00.000Z'),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    act(() => result.current.select('a'));
    act(() => result.current.append('bump', goodAnswer()));

    expect(result.current.conversations[0].id).toBe('a');
  });

  it('loads conversations from the store on mount', async () => {
    const store = fakeStore([
      mkConversation('a', 'A', '2026-01-01T00:00:00.000Z'),
    ]);
    const { result } = setup(store);

    await waitFor(() =>
      expect(result.current.conversations.map((c) => c.id)).toEqual(['a'])
    );
  });

  it('leaves the user in an empty draft when the store fails to load', async () => {
    const store: ConversationStore = {
      kind: 'local',
      list: () => Promise.reject(new Error('unreadable')),
      put: async () => {},
      remove: async () => {},
    };
    const { result } = setup(store);

    await waitFor(() => expect(result.current.conversations).toEqual([]));
    expect(result.current.activeId).toBeNull();
  });

  it('does nothing at all when there is no store yet', () => {
    const { result } = setup(null);

    expect(result.current.conversations).toEqual([]);
    expect(() =>
      act(() => result.current.append('no store', goodAnswer()))
    ).not.toThrow();
  });
});

describe('useConversations — deleting', () => {
  const twoLoaded = async () => {
    const store = fakeStore([
      mkConversation('a', 'A', '2026-03-01T00:00:00.000Z'),
      mkConversation('b', 'B', '2026-02-01T00:00:00.000Z'),
      mkConversation('c', 'C', '2026-01-01T00:00:00.000Z'),
    ]);
    const rendered = setup(store);
    await waitFor(() =>
      expect(rendered.result.current.conversations).toHaveLength(3)
    );
    return { store, ...rendered };
  };

  it('removes the conversation from the list and from the store', async () => {
    const { result, store } = await twoLoaded();

    act(() => result.current.remove('b'));

    expect(result.current.conversations.map((c) => c.id)).toEqual(['a', 'c']);
    expect(store.removed).toEqual(['b']);
  });

  /** AC 48. Focus needs somewhere to land, so something must become active. */
  it('activates the next conversation down when the active one is deleted', async () => {
    const { result } = await twoLoaded();
    act(() => result.current.select('b'));

    act(() => result.current.remove('b'));

    expect(result.current.activeId).toBe('c');
  });

  it('activates the previous conversation when the last one is deleted', async () => {
    const { result } = await twoLoaded();
    act(() => result.current.select('c'));

    act(() => result.current.remove('c'));

    expect(result.current.activeId).toBe('b');
  });

  it('falls back to a draft when the only conversation is deleted', () => {
    const { result } = setup();
    act(() => result.current.append('only one', goodAnswer()));
    const id = result.current.conversations[0].id;

    act(() => result.current.remove(id));

    expect(result.current.activeId).toBeNull();
    expect(result.current.conversations).toEqual([]);
  });

  /** AC 50. Deleting something you are not looking at must not move you. */
  it('leaves the active conversation alone when a different one is deleted', async () => {
    const { result } = await twoLoaded();
    act(() => result.current.select('a'));

    act(() => result.current.remove('c'));

    expect(result.current.activeId).toBe('a');
  });
});

describe('useConversations — reasoning disclosure', () => {
  it('treats only the first assistant message in the active conversation as first', () => {
    const { result } = setup();
    act(() => result.current.append('one', goodAnswer()));
    act(() => result.current.append('two', goodAnswer()));

    const assistants = result.current.messages.filter(
      (m) => m.role === 'assistant'
    );

    expect(result.current.isFirstAssistantMessage(assistants[0].id)).toBe(true);
    expect(result.current.isFirstAssistantMessage(assistants[1].id)).toBe(false);
  });

  /**
   * Scoped per conversation. Reading across the whole list would collapse the
   * reasoning on the first message of every thread after the first.
   */
  it('treats the first assistant message of a second conversation as first too', () => {
    const { result } = setup();
    act(() => result.current.append('one', goodAnswer()));
    act(() => result.current.startDraft());
    act(() => result.current.append('two', goodAnswer()));

    const assistant = result.current.messages.find(
      (m) => m.role === 'assistant'
    );

    expect(result.current.isFirstAssistantMessage(assistant!.id)).toBe(true);
  });
});

/**
 * AC 10, carried over from useChat when it was deleted. A message is a
 * snapshot taken at the moment of citing, not a live view onto the Answer the
 * engine handed back. If the caller reuses or mutates that object, what was
 * already quoted must not change underneath the user.
 */
describe('useConversations — a cited answer is frozen at cite time', () => {
  it('keeps the message text when the caller mutates the Answer afterwards', () => {
    const ans = goodAnswer('original text');
    const { result } = setup();
    act(() => result.current.append('q', ans));

    ans.text = 'mutated after append';

    expect(result.current.messages[1].text).toBe('original text');
  });

  it('keeps the message text when the same Answer object is reused for a second prompt', () => {
    const ans = goodAnswer('first');
    const { result } = setup();
    act(() => result.current.append('q1', ans));
    ans.text = 'second';
    act(() => result.current.append('q2', ans));

    const assistantTexts = result.current.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);

    expect(assistantTexts).toEqual(['first', 'second']);
  });
});

describe('useConversations — persistence calls', () => {
  it('writes only the touched conversation rather than the whole list', async () => {
    const store = fakeStore([
      mkConversation('a', 'A', '2026-03-01T00:00:00.000Z'),
      mkConversation('b', 'B', '2026-02-01T00:00:00.000Z'),
    ]);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    act(() => result.current.select('a'));
    act(() => result.current.append('bump', goodAnswer()));

    expect(store.puts).toHaveLength(1);
    expect(store.puts[0].id).toBe('a');
  });

  /**
   * A single prompt must leave a single record. React invokes state updaters
   * twice under StrictMode, so minting the id inside one would write two files
   * with different ids for one submission.
   */
  it('mints one id and writes one record per submitted prompt', () => {
    const store = fakeStore();
    const { result } = setup(store);

    act(() => result.current.append('once', goodAnswer()));

    expect(store.puts).toHaveLength(1);
    expect(result.current.conversations).toHaveLength(1);
    expect(store.puts[0].id).toBe(result.current.conversations[0].id);
  });

  it('survives a store whose put rejects', () => {
    const store: ConversationStore = {
      kind: 'local',
      list: async () => ({ conversations: [], skipped: 0 }),
      put: () => Promise.reject(new Error('disk full')),
      remove: async () => {},
    };
    const { result } = setup(store);

    expect(() =>
      act(() => result.current.append('still works', goodAnswer()))
    ).not.toThrow();
    expect(result.current.conversations).toHaveLength(1);
  });
});
