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

/**
 * A note as the library knows it before anyone opens it: everything needed to
 * list, sort, filter and search by title, and deliberately no body.
 *
 * The missing body is the point. A library of several hundred notes is read
 * one note at a time, so bodies are fetched on demand. Making this a type that
 * structurally lacks `body` means a half-loaded note cannot be handed to
 * `put`, which would otherwise write an empty file over something the user
 * spent years writing. The compiler refuses it rather than a reviewer catching
 * it.
 */
export type NoteMeta = Omit<Note, 'body'> & { filename: string };

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

/**
 * An ordered sequence of existing notes, read as chapters.
 *
 * The book holds note ids and the notes hold nothing about the book. Order is
 * a relationship between chapters, not a property of any one chapter. Storing a
 * position in each note's front matter would make reordering fifteen chapters a
 * fifteen file write that can fail halfway and leave the library in a state
 * nobody can reason about. One book is one file and one atomic write, so adding
 * or reordering a book never rewrites any of the archive notes.
 *
 * The accepted cost is that a chapterId can point at a note deleted by hand
 * outside the app. A dangling id is rendered as a missing chapter, never a
 * crash.
 */
/** Where a story begins within a book's single flat run of chapters. */
export interface StoryMark {
  /** The chapter that opens the story. */
  startsAt: string;
  title: string;
}

export interface Book {
  id: string;
  title: string;
  /** Note ids, in reading order. The order IS the book. */
  chapterIds: string[];
  /**
   * Chapters that take no number: a prologue, an interlude, an epilogue.
   * Numbering counts only the chapters outside this set, so front matter
   * cannot consume chapter one and an epilogue costs nothing at the end.
   *
   * Held on the book rather than the note, for the same reason the order is:
   * the same note can be a prologue in one book and chapter three in another.
   * Optional, because books written before numbering existed do not have it.
   */
  unnumberedIds?: string[];
  /**
   * Where each story begins, for a book that collects several of them.
   * Numbering restarts at one with every story, so an anthology has as many
   * chapter ones as it has stories.
   *
   * A story is marked by the chapter that opens it rather than by listing
   * what it holds. That makes a story contiguous by construction: there is no
   * arrangement of this data that interleaves two of them, which is a thing a
   * book cannot be.
   */
  stories?: StoryMark[];
  createdAt: string;
  updatedAt: string;
}
