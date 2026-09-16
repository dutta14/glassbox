import type { Conversation, Note } from '../types';

/**
 * NotesStore abstracts how notes are persisted. The engine and UI never see a
 * concrete backend: they see this shape and nothing else. Every method is
 * async because the folder adapter that comes next reads and writes files on
 * disk, and the localStorage adapter is trivially async-wrapped so the caller
 * has one code path either way.
 *
 * put and remove are per-note on purpose. See glassbox-storage-architecture.md:
 * a whole-library save would rewrite every file on every keystroke, thrash
 * Drive sync, and defeat the per-file conflict handling that motivates this
 * whole design.
 */
export interface NotesStore {
  /** Which concrete backend this instance is. */
  readonly kind: 'local' | 'folder';
  /** Human label shown in the UI, e.g. the folder name or "This browser". */
  readonly label: string;

  /** Whether this backend can be used at all in the current environment. */
  isAvailable(): boolean;

  /** Load every note. Called once on mount and again on window focus. */
  list(): Promise<Note[]>;

  /** Create or update a single note. Exactly one file / one record touched. */
  put(note: Note): Promise<void>;

  /** Remove a single note by id. Safe to call for an unknown id. */
  remove(id: string): Promise<void>;
}


/**
 * ConversationStore is the same shape as NotesStore, for the same reasons, over
 * a different record. Conversations are whole-record writes rather than
 * per-field: a transcript is appended to as a unit, and a conversation is small
 * enough that rewriting one file per submitted prompt costs nothing.
 *
 * Conversations live in `chats/`, notes in `notes/`. They must never share a
 * directory. The folder note store reads every `.md` file it scans as a note,
 * so a transcript sitting beside notes would be indexed and quoted back as
 * though the user had written it.
 */
/**
 * What a load found. `skipped` counts records that were present but could not
 * be read as a conversation, so the app can say some chats are missing instead
 * of quietly showing a shorter list than the folder contains.
 */
export interface ConversationListResult {
  conversations: Conversation[];
  skipped: number;
}

export interface ConversationStore {
  readonly kind: 'local' | 'folder';

  /** Load every conversation. Malformed records are skipped, never thrown. */
  list(): Promise<ConversationListResult>;

  /** Create or update a single conversation. One file / one record touched. */
  put(conversation: Conversation): Promise<void>;

  /** Remove a single conversation by id. Safe to call for an unknown id. */
  remove(id: string): Promise<void>;
}
