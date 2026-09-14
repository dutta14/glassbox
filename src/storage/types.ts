import type { Note } from '../types';

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
