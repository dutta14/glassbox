import { Fragment, useCallback, useRef, useState } from "react";
import type { Book, Note, NoteFormat } from "../types";
import { NoteListItem } from "./NoteListItem";
import { BookListItem } from "./BookListItem";
import { BookChapterList } from "./BookChapterList";
import { NewNoteMenu } from "./NewNoteMenu";
import { OrganizeMenu } from "./OrganizeMenu";
import { NoteSearchModal } from "./NoteSearchModal";
import { useScrollFades } from "../hooks/useScrollFades";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsModal } from "./SettingsModal";
import type { Theme } from "../hooks/useTheme";
import type { OrganizeMode } from "../hooks/useNoteOrganize";
import type { FolderState } from "../hooks/useStorageBackend";
import { COPY } from "../engine/copy";
import "../styles/NotesRail.css";

const COLLAPSE_KEY = "glassbox.rail.v1";
const SECTIONS_KEY = "glassbox.railSections.v1";

/* Shares openMenuId with the row menus so that opening this one closes any row
   menu and the other way round. No note or book can collide with it: ids are
   generated and this is not. */
const ORGANIZE_MENU_ID = "organize-notes";

type SectionName = "books" | "notes";
type SectionState = Record<SectionName, boolean>;

/** All open is the state the rail has always had, so a first-time reader
    sees no change. */
const DEFAULT_SECTIONS: SectionState = {
  books: true,
  notes: true,
};

const readSections = (): SectionState => {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return DEFAULT_SECTIONS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SECTIONS;
    const record = parsed as Partial<Record<SectionName, unknown>>;
    // Read field by field rather than trusting the blob, so a hand-edited or
    // half-written value cannot collapse a section with no way back.
    return {
      // A reader who saved their sections before books existed has no `books`
      // key. Falling back to the default opens it, which is what someone
      // meeting a new section should get.
      books:
        typeof record.books === "boolean"
          ? record.books
          : DEFAULT_SECTIONS.books,
      notes:
        typeof record.notes === "boolean"
          ? record.notes
          : DEFAULT_SECTIONS.notes,
    };
  } catch {
    return DEFAULT_SECTIONS;
  }
};

const writeSections = (sections: SectionState): void => {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
  } catch {
    // Non-fatal. The sections still toggle for this session.
  }
};

/** Points down when the section is open and right when it is shut, the way a
    disclosure triangle has always read. */
const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className={`notes-rail__chevron${open ? " notes-rail__chevron--open" : ""}`}
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="m4 2.5 3.5 3.5L4 9.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** One glyph for the one entry that holds everything the rail used to keep
    loose in its foot. */
const GearIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/** Wrapped because localStorage throws in some privacy modes. */
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
};

const writeCollapsed = (collapsed: boolean): void => {
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Non-fatal. The rail still collapses for this session.
  }
};

interface NotesRailProps {
  notes: Note[];
  books: Book[];
  selectedNoteId: string | null;
  /** Null unless a book is the thing currently open. */
  selectedBookId: string | null;
  hasSampleNotes: boolean;
  /** Note ids that belong to at least one book, so a row can show it. */
  /* Note id to the name of the first book holding it. Absent means no book. */
  bookNameByNoteId: ReadonlyMap<string, string>;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  onSelect: (id: string) => void;
  onCreate: (format: NoteFormat) => void;
  onSelectBook: (id: string) => void;
  /** Opens the Books page, the only way into a book while the rail keeps
      notes in one list. */
  onOpenBooks: () => void;
  /** Opens a book at one of its chapters, from a chapter row. */
  onOpenChapter: (bookId: string, noteId: string) => void;
  onDeleteBook: (id: string) => void;
  onAddNoteToBook: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onToggleNoteFormat: (id: string) => void;
  onDeleteSamples: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  organizeMode: OrganizeMode;
  onOrganizeChange: (mode: OrganizeMode) => void;
}

export const NotesRail = ({
  notes,
  books,
  selectedNoteId,
  selectedBookId,
  hasSampleNotes,
  bookNameByNoteId,
  folderState,
  folderName,
  connectError,
  onSelect,
  onCreate,
  onSelectBook,
  onOpenBooks,
  onOpenChapter,
  onDeleteBook,
  onAddNoteToBook,
  onDeleteNote,
  onToggleNoteFormat,
  onDeleteSamples,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  theme,
  onToggleTheme,
  organizeMode,
  onOrganizeChange,
}: NotesRailProps) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sections, setSections] = useState<SectionState>(readSections);
  const booksOpen = sections.books;
  const notesOpen = sections.notes;

  const toggleSection = useCallback((name: SectionName) => {
    setSections((current) => {
      const next = { ...current, [name]: !current[name] };
      writeSections(next);
      return next;
    });
  }, []);
  /** Held here rather than per row, so opening one menu closes any other. */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [pendingBookDelete, setPendingBookDelete] = useState<Book | null>(null);
  /* A set rather than a single id: every book costs a fixed five rows when
     open, so there is no reason to shut one to look at another. Per session,
     because which books you had open is not worth remembering. */
  const [expandedBooks, setExpandedBooks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleBook = useCallback((id: string) => {
    setExpandedBooks((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  /* Ask is a pane beside the note now rather than a place the rail can send
     you, so nothing competes with the open note for aria-current and this is
     simply whichever note is open. */
  const currentNoteId = selectedNoteId;

  const byBook = organizeMode === "book";

  /* Derived from the same map the rows use to name a note's book, so the list
     and the badge can never disagree about what is shelved. */
  const listedNotes = byBook
    ? notes.filter((note) => !bookNameByNoteId.has(note.id))
    : notes;

  /* Resolved from the full set, not the filtered one: in book mode every
     chapter has been taken out of listedNotes by definition.

     The rows are the notes themselves rather than labels made from them. A
     chapter row is the same note the Notes list shows, cosmetically moved
     under its book, so it is rendered by the same component and answers to
     the same name. Chapters whose note has been deleted are dropped rather
     than shown as a dead row. */
  const noteById = new Map(notes.map((note) => [note.id, note]));

  const chaptersOf = (book: Book): Note[] =>
    book.chapterIds
      .map((id) => noteById.get(id))
      .filter((note): note is Note => note !== undefined);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useScrollFades(listRef, [notes.length, collapsed]);

  /** Focus goes back to the glyph that opened the modal, never to the body. */
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchToggleRef.current?.focus();
  }, []);

  const cancelDelete = useCallback(() => {
    const id = pendingDelete?.id ?? null;
    setPendingDelete(null);
    if (id === null) return;
    // The dialog took focus on open, so it has to be handed back. Deferred
    // past the dialog's own teardown, which clears inert from the app root.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-menu-for="${id}"]`)?.focus();
    });
  }, [pendingDelete]);

  const confirmDelete = useCallback(() => {
    if (pendingDelete === null) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    onDeleteNote(id);
  }, [pendingDelete, onDeleteNote]);

  /* Mirrors the note dialog. Focus goes back to the row menu trigger that
     opened it, because the row is still there when you cancel. */
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsed(next);
      return next;
    });
  }, []);

  return (
    <aside
      className={`notes-rail${collapsed ? " notes-rail--collapsed" : ""}`}
      aria-label="Notes"
    >
      {/* Collapsed, there is no rail: only this button, which brings it back. */}
      {collapsed && (
        <button
          type="button"
          className="notes-rail__open"
          onClick={toggleCollapsed}
          aria-label="Open sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 5.5h14M3 10h14M3 14.5h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {!collapsed && (
        <>
          <div className="notes-rail__mast">
            <div className="notes-rail__brand">Glassbox</div>
            <button
              type="button"
              className="notes-rail__toggle"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2.75"
                  y="3.75"
                  width="14.5"
                  height="12.5"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M7.75 4v12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          <p className="notes-rail__tagline">{COPY.railTagline}</p>

          <div className="notes-rail__links">
            <NewNoteMenu onCreate={onCreate} />

            <button
              ref={searchToggleRef}
              type="button"
              className="notes-rail__entry"
              onClick={() => setSearchOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-label="Search notes"
            >
              Search
            </button>

            {/* In one list the shelf is a place to go, not a section of the
                sidebar, so it sits with New and Search rather than heading a
                list of its own. No count: the number of books is what the
                page is for. */}
            {!byBook && (
              <button
                type="button"
                className="notes-rail__entry"
                onClick={onOpenBooks}
              >
                {COPY.booksRow}
              </button>
            )}
          </div>
          {/* One scroll area for the lists, so the rail scrolls as a single
              column instead of boxes that run out of room independently. */}
          <div ref={listRef} className="notes-rail__list scroll-fades">
            {byBook && (
              <div className="notes-rail__section notes-rail__section--sticky">
                <h2 className="notes-rail__title" id="rail-books-heading">
                  <button
                    type="button"
                    className="notes-rail__title-toggle"
                    onClick={() => toggleSection("books")}
                    aria-expanded={booksOpen}
                    aria-controls="rail-books-list"
                  >
                    {COPY.booksRow}
                    <span
                      className="notes-rail__title-mark"
                      aria-hidden="true"
                    />
                    <span
                      className="notes-rail__title-rule"
                      aria-hidden="true"
                    />
                    <Chevron open={booksOpen} />
                  </button>
                </h2>
              </div>
            )}

            <nav
              id="rail-books-list"
              aria-labelledby="rail-books-heading"
              hidden={!byBook || !booksOpen}
            >
              {books.length === 0 ? (
                <div className="notes-rail__empty">
                  <p className="notes-rail__empty-body">
                    {COPY.emptyBooksSidebar}
                  </p>
                </div>
              ) : (
                <ul>
                  {books.map((book) => (
                    /* The chapters are a sibling row, not a child of the book
                       row. Nesting one .note-row inside another made the two
                       hover as one: the rail's rules reach descendants, so
                       pointing at a chapter lit its book up and held every
                       chapter's menu open at once. */
                    <Fragment key={book.id}>
                      <BookListItem
                        book={book}
                        expansion={
                          byBook
                            ? {
                                open: expandedBooks.has(book.id),
                                onToggle: () => toggleBook(book.id),
                              }
                            : undefined
                        }
                        isSelected={book.id === selectedBookId}
                        menuOpen={openMenuId === book.id}
                        onSelect={() => onSelectBook(book.id)}
                        onMenuOpenChange={(open) =>
                          setOpenMenuId(open ? book.id : null)
                        }
                        onRequestDelete={() => setPendingBookDelete(book)}
                      />
                      {byBook && expandedBooks.has(book.id) && (
                        <li className="book-chapters-row">
                          <BookChapterList
                            listId={`book-chapters-${book.id}`}
                            bookTitle={book.title.trim() || COPY.untitledBook}
                            chapters={chaptersOf(book)}
                            currentNoteId={currentNoteId}
                            openMenuId={openMenuId}
                            onOpenChapter={(noteId) =>
                              onOpenChapter(book.id, noteId)
                            }
                            onMenuOpenChange={(noteId, open) =>
                              setOpenMenuId(open ? noteId : null)
                            }
                            onRequestDelete={setPendingDelete}
                            onToggleFormat={onToggleNoteFormat}
                            onAddToBook={onAddNoteToBook}
                          />
                        </li>
                      )}
                    </Fragment>
                  ))}
                </ul>
              )}
            </nav>

            <div className="notes-rail__section notes-rail__section--sticky">
              <h2 className="notes-rail__title" id="rail-notes-heading">
                <button
                  type="button"
                  className="notes-rail__title-toggle"
                  onClick={() => toggleSection("notes")}
                  aria-expanded={notesOpen}
                  aria-controls="rail-notes-list"
                >
                  Notes
                  <span className="notes-rail__title-mark" aria-hidden="true" />
                  <span className="notes-rail__title-rule" aria-hidden="true" />
                  <Chevron open={notesOpen} />
                </button>
              </h2>
              <OrganizeMenu
                mode={organizeMode}
                open={openMenuId === ORGANIZE_MENU_ID}
                onOpenChange={(open) =>
                  setOpenMenuId(open ? ORGANIZE_MENU_ID : null)
                }
                onChoose={onOrganizeChange}
              />
            </div>

            {hasSampleNotes && notesOpen && (
              <div className="notes-rail__banner" role="note">
                <p className="notes-rail__banner-text">{COPY.sampleBanner}</p>
                <button
                  type="button"
                  className="notes-rail__banner-action"
                  onClick={onDeleteSamples}
                >
                  Delete all samples
                </button>
              </div>
            )}

            <nav
              id="rail-notes-list"
              aria-label="Note list"
              hidden={!notesOpen}
            >
              {listedNotes.length === 0 ? (
                <div className="notes-rail__empty">
                  <p className="notes-rail__empty-body">
                    {/* Telling someone with 566 notes to write their first
                        one would be a lie. In book mode an empty list means
                        everything is shelved, which is its own good news. */}
                    {byBook && notes.length > 0
                      ? COPY.emptyNotesAllBooked
                      : COPY.emptyNotesSidebar}
                  </p>
                </div>
              ) : (
                <ul>
                  {listedNotes.map((note) => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      isSelected={note.id === currentNoteId}
                      menuOpen={openMenuId === note.id}
                      onSelect={() => onSelect(note.id)}
                      onMenuOpenChange={(open) =>
                        setOpenMenuId(open ? note.id : null)
                      }
                      onRequestDelete={() => setPendingDelete(note)}
                      onToggleFormat={() => onToggleNoteFormat(note.id)}
                      bookName={bookNameByNoteId.get(note.id)}
                      onAddToBook={() => onAddNoteToBook(note.id)}
                    />
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <footer className="notes-rail__footer">
            <button
              type="button"
              className="notes-rail__settings"
              onClick={() => setSettingsOpen(true)}
            >
              <GearIcon />
              <span>Settings</span>
            </button>
          </footer>
        </>
      )}

      {/* A book is a running order, not a container. Deleting it must leave
          every chapter in the library, and the description has to say so
          outright: the word "book" implies the pages go with it, and a reader
          who believes that will not press the button. */}
      <ConfirmDialog
        open={pendingBookDelete !== null}
        title={`Delete "${pendingBookDelete?.title.trim() || COPY.untitledBook}"?`}
        description="This deletes the book and its running order. Every note in it stays in your library."
        confirmLabel="Delete book"
        onConfirm={() => {
          if (pendingBookDelete) onDeleteBook(pendingBookDelete.id);
          setPendingBookDelete(null);
        }}
        onCancel={() => setPendingBookDelete(null)}
      />

      {/* Names the conversation so the two dialogs in this rail are never
          confusable, and says plainly that notes are unaffected. Deleting a
          transcript that quoted a note must not read as deleting the note. */}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.title.trim() || COPY.untitled}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      <SettingsModal
        open={settingsOpen}
        folderState={folderState}
        folderName={folderName}
        connectError={connectError}
        theme={theme}
        onConnectFolder={onConnectFolder}
        onReconnectFolder={onReconnectFolder}
        onDisconnectFolder={onDisconnectFolder}
        onToggleTheme={onToggleTheme}
        onClose={() => setSettingsOpen(false)}
      />

      <NoteSearchModal
        open={searchOpen}
        notes={notes}
        selectedNoteId={currentNoteId}
        onSelect={onSelect}
        onClose={closeSearch}
      />
    </aside>
  );
};
