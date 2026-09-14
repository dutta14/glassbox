import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChat } from './useChat';
import type { Answer, ChatMessage, ScoredChunk, Trace } from '../types';

const STORAGE_KEY = 'glassbox.chat.v1';

const chunk = (): ScoredChunk => ({
  noteId: 'n1',
  noteTitle: 'Sourdough',
  position: 0,
  text: 'bread flat when starter is underproofed',
  score: 0.42,
  matchedTerms: ['bread', 'flat'],
  coverage: 1,
});

const trace = (intent: Trace['intent'] = 'search'): Trace => ({
  intent,
  confidence: 0.42,
  queryTerms: ['bread', 'flat'],
  candidatesConsidered: 3,
  results: [chunk()],
  reason: 'ok',
});

const answer = (text = 'bread flat when starter is underproofed'): Answer => ({
  text,
  sources: [chunk()],
  trace: trace(),
});

const readTranscript = (): unknown => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

describe('useChat.append — AC 8 (submitting appends a user message then an assistant message)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('appends a user message followed by an assistant message, in that order, with matching text and roles', () => {
    const { result } = renderHook(() => useChat());
    let ids!: { userId: string; assistantId: string };

    act(() => {
      ids = result.current.append('why is my bread flat', answer('bread flat when starter is underproofed'));
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      id: ids.userId,
      role: 'user',
      text: 'why is my bread flat',
    });
    expect(result.current.messages[1]).toMatchObject({
      id: ids.assistantId,
      role: 'assistant',
      text: 'bread flat when starter is underproofed',
    });
    // The assistant message carries the Answer object frozen at cite time.
    expect(result.current.messages[1].answer).toEqual(answer('bread flat when starter is underproofed'));
  });

  it('appends two conversation turns as four messages in strict user, assistant, user, assistant order', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.append('first question', answer('first answer'));
    });
    act(() => {
      result.current.append('second question', answer('second answer'));
    });

    expect(result.current.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(result.current.messages.map((m) => m.text)).toEqual([
      'first question',
      'first answer',
      'second question',
      'second answer',
    ]);
  });

  it('gives every appended message a distinct id', () => {
    const { result } = renderHook(() => useChat());
    let a!: { userId: string; assistantId: string };
    let b!: { userId: string; assistantId: string };
    act(() => {
      a = result.current.append('q1', answer('a1'));
    });
    act(() => {
      b = result.current.append('q2', answer('a2'));
    });
    expect(new Set([a.userId, a.assistantId, b.userId, b.assistantId]).size).toBe(4);
  });
});

describe('useChat — AC 13 (isFirstAssistantMessage identifies the first assistant message of the session)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true only for the id of the first assistant message and false for every subsequent assistant id', () => {
    const { result } = renderHook(() => useChat());
    let first!: { userId: string; assistantId: string };
    let second!: { userId: string; assistantId: string };

    act(() => {
      first = result.current.append('q1', answer('first answer'));
    });
    act(() => {
      second = result.current.append('q2', answer('second answer'));
    });

    expect(result.current.isFirstAssistantMessage(first.assistantId)).toBe(true);
    expect(result.current.isFirstAssistantMessage(second.assistantId)).toBe(false);
  });

  it('returns false for a user message id, even the first one', () => {
    const { result } = renderHook(() => useChat());
    let ids!: { userId: string; assistantId: string };
    act(() => {
      ids = result.current.append('q1', answer());
    });
    expect(result.current.isFirstAssistantMessage(ids.userId)).toBe(false);
  });

  it('returns false for any id when the transcript has no assistant messages', () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.isFirstAssistantMessage('anything')).toBe(false);
  });
});

describe('useChat.clear — AC 24 (clearing empties the transcript)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('empties the in-memory transcript when clear is called after messages were appended', () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.append('q1', answer());
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clear();
    });
    expect(result.current.messages).toEqual([]);
  });

  it('empties the persisted transcript in localStorage after clear so a reload starts empty', () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.append('q1', answer());
    });
    // Precondition: two messages persisted.
    expect(readTranscript()).toEqual(result.current.messages);

    act(() => {
      result.current.clear();
    });

    // Explicit assertion on both the in-memory state and the persisted value.
    expect(result.current.messages).toEqual([]);
    expect(readTranscript()).toEqual([]);
  });
});

describe('useChat persistence — AC 23 (chat transcript persists to localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes the transcript to glassbox.chat.v1 after each append so a reload can rehydrate it', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.append('why is my bread flat', answer('bread flat when starter is underproofed'));
    });

    const stored = readTranscript();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored as ChatMessage[]).toHaveLength(2);
    // The stored blob mirrors the in-memory transcript exactly.
    expect(stored).toEqual(result.current.messages);
  });

  it('rehydrates a previously persisted transcript into a fresh hook instance so refreshing does not lose history', () => {
    // Simulate a prior session by writing a valid transcript.
    const prior: ChatMessage[] = [
      { id: 'u-prev', role: 'user', text: 'earlier', createdAt: '2026-01-01T00:00:00.000Z' },
      {
        id: 'a-prev',
        role: 'assistant',
        text: 'earlier reply',
        createdAt: '2026-01-01T00:00:01.000Z',
        answer: answer('earlier reply'),
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prior));

    const { result } = renderHook(() => useChat());
    expect(result.current.messages.map((m) => m.id)).toEqual(['u-prev', 'a-prev']);
  });
});

describe('useChat.append — AC 10 (frozen source at cite time: mutating the caller-side Answer does not change the persisted message)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not resurrect a stale answer.text if the caller mutates the same Answer object after appending', () => {
    // This is not a deep-clone guarantee; it's the "the message record IS a
    // snapshot" guarantee. append copies fields into the ChatMessage; mutating
    // the passed-in Answer.text after the fact must not change the message.text.
    const ans = answer('original text');
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.append('q', ans);
    });
    const originalText = result.current.messages[1].text;

    ans.text = 'mutated after append';

    expect(result.current.messages[1].text).toBe(originalText);
    expect(result.current.messages[1].text).toBe('original text');
  });
});
