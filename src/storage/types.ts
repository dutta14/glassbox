import type { Book, Conversation, Note } from '../types';

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

  /**
   * Load every note. Called once on mount and again on window focus.
   *
   * `onBatch` reports notes as they are read rather than making the caller
   * wait for the last one. The nav needs only titles and dates, and the first
   * two dozen notes are in memory within a few milliseconds, so withholding
   * them until a library of several hundred has finished parsing is a pause
   * with nothing behind it.
   *
   * Batches are progress, never the answer. They arrive in directory order,
   * may contain two notes claiming one id, and say nothing about deletions.
   * The resolved array is the authoritative one, and callers must let it
   * replace whatever the batches showed. A caller that needs a complete and
   * reconciled picture, such as focus reconciliation deciding what was
   * deleted on disk, must ignore batches and await the result.
   */
  list(onBatch?: (notes: Note[]) => void): Promise<Note[]>;

  /** Create or update a single note. Exactly one file / one record touched. */
  put(note: Note): Promise<void>;

  /** Remove a single note by id. Safe to call for an unknown id. */
  remove(id: string): Promise<void>;

  /**
   * Read a file a note refers to, such as an image, resolved relative to the
   * notes folder. Returns null when it cannot be read, which callers must
   * treat as ordinary: the file may be missing, renamed, or on a backend that
   * has no folder to look in.
   *
   * Optional because only a real folder has anything to resolve. A browser
   * storage library holds Markdown and nothing else, so it does not implement
   * this rather than pretending to and always failing.
   */
  readAsset?(path: string): Promise<Blob | null>;
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

/**
 * What a load found. `skipped` counts records that were present but could not
 * be read as a book, so the app can say some books are unreadable instead of
 * quietly showing a shorter list than the folder contains. A book whose
 * chapterIds is corrupt would render nothing, so it is skipped here rather than
 * returned half-valid.
 */
export interface BookListResult {
  books: Book[];
  skipped: number;
}

/**
 * BookStore is the same shape as ConversationStore, over the book record. A
 * book is a whole-record write: reordering, renaming, or changing its chapters
 * rewrites the one book file and nothing else, which is the point of storing
 * order in the book rather than across the notes.
 *
 * Books live in `books/`. They must never share a directory with notes or
 * chats, for the same reason those two are kept apart: the folder note store
 * reads every `.md` file it scans as a note, and the app must not index a book
 * record as prose.
 */
export interface BookStore {
  readonly kind: 'local' | 'folder';

  /** Load every book. Malformed records are skipped, never thrown. */
  list(): Promise<BookListResult>;

  /** Create or update a single book. One file / one record touched. */
  put(book: Book): Promise<void>;

  /** Remove a single book by id. Safe to call for an unknown id. */
  remove(id: string): Promise<void>;
}
