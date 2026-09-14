import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answer, ChatMessage, ScoredChunk, Trace } from '../types';
import { createId } from '../storage/notes';

const STORAGE_KEY = 'glassbox.chat.v1';

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

const isScoredChunk = (v: unknown): v is ScoredChunk => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.noteId === 'string' &&
    typeof s.noteTitle === 'string' &&
    typeof s.position === 'number' &&
    typeof s.text === 'string' &&
    typeof s.score === 'number' &&
    isStringArray(s.matchedTerms) &&
    typeof s.coverage === 'number'
  );
};

const isTrace = (v: unknown): v is Trace => {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.intent === 'string' &&
    typeof t.confidence === 'number' &&
    isStringArray(t.queryTerms) &&
    typeof t.candidatesConsidered === 'number' &&
    Array.isArray(t.results) &&
    t.results.every(isScoredChunk) &&
    typeof t.reason === 'string'
  );
};

const isAnswer = (v: unknown): v is Answer => {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.text === 'string' &&
    Array.isArray(a.sources) &&
    a.sources.every(isScoredChunk) &&
    isTrace(a.trace)
  );
};

/**
 * Full ChatMessage validation. This is deliberately strict about the
 * assistant-message `answer` shape: ChatMessage.tsx and ReasoningDisclosure.tsx read
 * `answer.sources[0]` and `answer.trace.intent` directly, and a corrupted
 * transcript in `glassbox.chat.v1` used to take out the entire chat panel.
 * Drop malformed entries the way `loadNotes` drops malformed notes.
 */
const isMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string') return false;
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  if (typeof m.text !== 'string') return false;
  if (typeof m.createdAt !== 'string') return false;
  if ('answer' in m && m.answer !== undefined && !isAnswer(m.answer)) return false;
  return true;
};

const loadTranscript = (): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage);
  } catch {
    return [];
  }
};

const saveTranscript = (messages: ChatMessage[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Non-fatal. Chat continues in memory.
  }
};

export interface UseChatResult {
  messages: ChatMessage[];
  append: (text: string, answer: Answer) => { userId: string; assistantId: string };
  clear: () => void;
  isFirstAssistantMessage: (id: string) => boolean;
}

export const useChat = (): UseChatResult => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadTranscript());

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
    saveTranscript(messages);
  }, [messages]);

  const append = useCallback((text: string, answer: Answer) => {
    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: createId(),
      role: 'user',
      text,
      createdAt: now,
    };
    const assistantMsg: ChatMessage = {
      id: createId(),
      role: 'assistant',
      text: answer.text,
      answer,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    return { userId: userMsg.id, assistantId: assistantMsg.id };
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  const isFirstAssistantMessage = useCallback(
    (id: string): boolean => {
      const first = messages.find((m) => m.role === 'assistant');
      return first?.id === id;
    },
    [messages]
  );

  return { messages, append, clear, isFirstAssistantMessage };
};
