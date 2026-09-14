import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChat } from './useChat';
import type { Answer, ChatMessage, ScoredChunk, Trace } from '../types';

const STORAGE_KEY = 'glassbox.chat.v1';

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

const goodAnswer = (): Answer => ({
  text: 'Here.',
  sources: [goodChunk()],
  trace: goodTrace(),
});

const goodUserMessage = (): ChatMessage => ({
  id: 'u1',
  role: 'user',
  text: 'hi',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const goodAssistantMessage = (): ChatMessage => ({
  id: 'a1',
  role: 'assistant',
  text: 'Here.',
  createdAt: '2026-01-01T00:00:01.000Z',
  answer: goodAnswer(),
});

const write = (payload: unknown): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

describe('useChat transcript validation (bug 4 regression)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('drops an assistant message whose answer is present but missing sources, and does not throw when rendering the surviving transcript', () => {
    const bad = goodAssistantMessage();
    // Cast through unknown to remove sources without TS complaining about the shape.
    const badAnswer = { ...goodAnswer() } as unknown as Record<string, unknown>;
    delete badAnswer.sources;
    (bad as unknown as Record<string, unknown>).answer = badAnswer;

    write([goodUserMessage(), bad]);

    const { result } = renderHook(() => useChat());

    expect(result.current.messages.map((m) => m.id)).toEqual(['u1']);
    // Absence of the bad one is the point — assert it explicitly.
    expect(result.current.messages.find((m) => m.id === 'a1')).toBeUndefined();
  });

  it('drops an assistant message whose answer.results contains a chunk missing score', () => {
    const bad = goodAssistantMessage();
    const badChunk = { ...goodChunk() } as unknown as Record<string, unknown>;
    delete badChunk.score;
    bad.answer!.trace.results = [badChunk as unknown as ScoredChunk];

    write([bad, goodUserMessage()]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages.map((m) => m.id)).toEqual(['u1']);
  });

  it('drops an assistant message whose answer.results contains a chunk whose matchedTerms is not a string array', () => {
    const bad = goodAssistantMessage();
    const badChunk = { ...goodChunk() } as unknown as Record<string, unknown>;
    badChunk.matchedTerms = 'not-an-array';
    bad.answer!.trace.results = [badChunk as unknown as ScoredChunk];

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('drops an assistant message whose answer.trace is missing the intent field', () => {
    const bad = goodAssistantMessage();
    const badTrace = { ...goodTrace() } as unknown as Record<string, unknown>;
    delete badTrace.intent;
    bad.answer!.trace = badTrace as unknown as Trace;

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('drops an assistant message whose answer.trace is missing queryTerms', () => {
    const bad = goodAssistantMessage();
    const badTrace = { ...goodTrace() } as unknown as Record<string, unknown>;
    delete badTrace.queryTerms;
    bad.answer!.trace = badTrace as unknown as Trace;

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('drops an assistant message whose answer is a string', () => {
    const bad = goodAssistantMessage();
    (bad as unknown as Record<string, unknown>).answer = 'oops';

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('drops an assistant message whose answer is null', () => {
    const bad = goodAssistantMessage();
    (bad as unknown as Record<string, unknown>).answer = null;

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('drops an assistant message whose answer is an array', () => {
    const bad = goodAssistantMessage();
    (bad as unknown as Record<string, unknown>).answer = [];

    write([bad]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
  });

  it('accepts a message that has no answer field at all so the plain-text path keeps working', () => {
    const plain: ChatMessage = {
      id: 'plain-1',
      role: 'assistant',
      text: 'hello',
      createdAt: '2026-01-01T00:00:02.000Z',
    };
    write([goodUserMessage(), plain]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages.map((m) => m.id)).toEqual(['u1', 'plain-1']);
    // And its answer is genuinely absent, not silently invented.
    expect(result.current.messages[1].answer).toBeUndefined();
  });

  it('accepts a well-formed assistant message with a complete answer, sources, and trace', () => {
    // Confidence guard: the validator must not be over-strict.
    write([goodUserMessage(), goodAssistantMessage()]);

    const { result } = renderHook(() => useChat());
    expect(result.current.messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(result.current.messages[1].answer?.sources).toHaveLength(1);
    expect(result.current.messages[1].answer?.trace.intent).toBe('search');
  });
});
