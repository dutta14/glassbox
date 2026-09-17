/**
 * How a note is set. Prose wraps into paragraphs and can carry a drop cap;
 * verse keeps the line breaks it was typed with.
 */
export type NoteFormat = 'prose' | 'verse';

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /**
   * Absent means prose. Optional rather than required so that the notes
   * already on disk, and every fixture that builds a Note, stay valid without
   * a migration.
   */
  format?: NoteFormat;
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

/**
 * One chat thread. `title` is the user's first prompt, stored verbatim rather
 * than derived at render: there is no model here to name a thread, and
 * inventing text would break the one promise the product makes. Storing it
 * also keeps the name stable if the messages are ever trimmed.
 *
 * A conversation only exists once it has a message. Clicking "New chat" puts
 * the user in a draft that has no record, so the rail never fills with empty
 * threads.
 */
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
