export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Chunk {
  noteId: string;
  noteTitle: string;
  position: number;
  text: string;
}

export interface ScoredChunk extends Chunk {
  score: number;
  matchedTerms: string[];
  /** Fraction of distinct query terms this chunk matched, 0 to 1. */
  coverage: number;
}

export type IntentName = 'search' | 'count' | 'recent' | 'tag' | 'help' | 'greeting' | 'unknown';

export interface Trace {
  intent: IntentName;
  confidence: number;
  queryTerms: string[];
  candidatesConsidered: number;
  results: ScoredChunk[];
  reason: string;
}

export interface Answer {
  text: string;
  sources: ScoredChunk[];
  trace: Trace;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: Answer;
  createdAt: string;
}
