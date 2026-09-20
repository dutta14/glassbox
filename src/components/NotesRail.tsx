import { Fragment, useCallback, useRef, useState } from "react";
import type { Book, Conversation, Note, NoteFormat } from "../types";
import { NoteListItem } from "./NoteListItem";
import { BookListItem } from "./BookListItem";
import { BookChapterList } from "./BookChapterList";
import { NewNoteMenu } from "./NewNoteMenu";
import { OrganizeMenu } from "./OrganizeMenu";
import { ConversationItem } from "./ConversationItem";
import { NoteSearchModal } from "./NoteSearchModal";
import { RailFlyout } from "./RailFlyout";
import { RailTip } from "./RailTip";
import { useScrollFades } from "../hooks/useScrollFades";
import { ConfirmDialog } from "./ConfirmDialog";
import { StorageControl } from "./StorageControl";
import { ThemeToggle } from "./ThemeToggle";
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

type SectionName = "chats" | "books" | "notes";
type SectionState = Record<SectionName, boolean>;

/** All open is the state the rail has always had, so a first-time reader
    sees no change. */
const DEFAULT_SECTIONS: SectionState = {
  chats: true,
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
      chats:
        typeof record.chats === "boolean"
          ? record.chats
          : DEFAULT_SECTIONS.chats,
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
  conversations: Conversation[];
  books: Book[];
  /** Null while a draft chat is open, which is its own kind of current. */
  activeConversationId: string | null;
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
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSelectBook: (id: string) => void;
  /** Opens the Books page, the only way into a book while the rail keeps
      notes in one list. */
  onOpenBooks: () => void;
  /** Opens a book at one of its chapters, from a chapter row. */
  onOpenChapter: (bookId: string, noteId: string) => void;
  onDeleteBook: (id: string) => void;
  onAddNoteToBook: (id: string) => void;
  chatActive: boolean;
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
  conversations,
  books,
  activeConversationId,
  selectedNoteId,
  selectedBookId,
  hasSampleNotes,
  bookNameByNoteId,
  folderState,
  folderName,
  connectError,
  onSelect,
  onCreate,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSelectBook,
  onOpenBooks,
  onOpenChapter,
  onDeleteBook,
  onAddNoteToBook,
  chatActive,
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
  const [sections, setSections] = useState<SectionState>(readSections);
  /** Only one flyout at a time: two panels open beside a one-icon-wide rail
      would overlap each other. */
  const [openFlyout, setOpenFlyout] = useState<SectionName | null>(null);
  const chatsOpen = sections.chats;
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
  const [pendingChatDelete, setPendingChatDelete] =
    useState<Conversation | null>(null);
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
  /* Nothing reads as open while the chat is showing. Otherwise the rail marks
     two rows current at once, the chat entry and whichever note was last
     opened, and aria-current stops meaning anything. */
  const currentNoteId = chatActive ? null : selectedNoteId;

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
  /* A draft is current only when the chat is showing and no saved thread is
     open. Without this the Ask row and a conversation row would both
     claim aria-current. */
  const draftActive = chatActive && activeConversationId === null;

  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useScrollFades(listRef, [notes.length, conversations.length, collapsed]);

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
  const cancelChatDelete = useCallback(() => {
    const id = pendingChatDelete?.id ?? null;
    setPendingChatDelete(null);
    if (id === null) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-menu-for="${id}"]`)?.focus();
    });
  }, [pendingChatDelete]);

  const confirmChatDelete = useCallback(() => {
    if (pendingChatDelete === null) return;
    const id = pendingChatDelete.id;
    setPendingChatDelete(null);
    onDeleteConversation(id);
  }, [pendingChatDelete, onDeleteConversation]);

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
      <div className="notes-rail__top-row">
        {!collapsed && <div className="notes-rail__brand">Glassbox</div>}
        {!collapsed && (
          <div className="notes-rail__actions">
            <button
              ref={searchToggleRef}
              type="button"
              className="notes-rail__action"
              onClick={() => setSearchOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-label="Search notes"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="7.2"
                  cy="7.2"
                  r="4.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M10.4 10.4 13.5 13.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Last in the row and last in the tab order. It acts on the rail as a
            whole, so it sits apart from the search glyph that acts on the
            notes. Rendered outside the collapsed guard, because it is the only
            way back once the rail is shut. */}
        <button
          type="button"
          className="notes-rail__toggle rail-tip-host"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="20"
            height="20"
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
          <RailTip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* The rail is the only way into the chat now that the Chat/Editor
              tablist is gone, so this reads as the current view rather than as
              an action. aria-current matches how the note rows mark theirs. */}
          <button
            type="button"
            className={`notes-rail__entry${draftActive ? " notes-rail__entry--active" : ""}`}
            onClick={onNewChat}
            aria-current={draftActive ? "true" : undefined}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 2.75h8A1.25 1.25 0 0 1 13.25 4v5A1.25 1.25 0 0 1 12 10.25H6.6L3.75 12.6V10.2A1.25 1.25 0 0 1 2.75 9V4A1.25 1.25 0 0 1 4 2.75Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            {COPY.askRow}
          </button>

          <NewNoteMenu onCreate={onCreate} />

          {/* In one list the shelf is a place to go, not a section of the
              sidebar, so it sits with Ask and New note rather than
              heading a list of its own. No count: the number of books is
              what the page is for. */}
          {!byBook && (
            <button
              type="button"
              className="notes-rail__entry"
              onClick={onOpenBooks}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                {/* A closed book seen head on: the cover, the page block
                    banded across the foot, and a title rule near the top.
                    Same 16px grid and 1.4 stroke as the chat bubble beside
                    it. */}
                <path
                  d="M4.75 2.25h7.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-7.5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M4.75 11.25h8.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M6.5 5.25h4.25"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              {COPY.booksRow}
            </button>
          )}

          {/* One scroll area for both lists, so the rail scrolls as a single
              column instead of two boxes that run out of room independently.
              Two navs inside it rather than one, because a single landmark
              covering chats and notes could not be named honestly. */}
          <div ref={listRef} className="notes-rail__list scroll-fades">
            {/* Heading wrapping a button is the accordion pattern that keeps
                both roles: the outline still has a heading to land on, and the
                control is still a button. Swapping the h2 for a button would
                have cost the outline entry. */}
            <div className="notes-rail__section notes-rail__section--sticky">
              <h2 className="notes-rail__title" id="rail-chats-heading">
                <button
                  type="button"
                  className="notes-rail__title-toggle"
                  onClick={() => toggleSection("chats")}
                  aria-expanded={chatsOpen}
                  aria-controls="rail-chats-list"
                >
                  {COPY.questionsHeading}
                  <Chevron open={chatsOpen} />
                </button>
              </h2>
            </div>

            <nav
              id="rail-chats-list"
              aria-labelledby="rail-chats-heading"
              hidden={!chatsOpen}
            >
              {conversations.length === 0 ? (
                <div className="notes-rail__empty">
                  <p className="notes-rail__empty-body">
                    {COPY.emptyChatsSidebar}
                  </p>
                </div>
              ) : (
                <ul>
                  {conversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isSelected={
                        chatActive && conversation.id === activeConversationId
                      }
                      menuOpen={openMenuId === conversation.id}
                      onSelect={() => onSelectConversation(conversation.id)}
                      onMenuOpenChange={(open) =>
                        setOpenMenuId(open ? conversation.id : null)
                      }
                      onRequestDelete={() => setPendingChatDelete(conversation)}
                    />
                  ))}
                </ul>
              )}
            </nav>

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
                    Books
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
            <StorageControl
              folderState={folderState}
              folderName={folderName}
              connectError={connectError}
              onConnect={onConnectFolder}
              onReconnect={onReconnectFolder}
              onDisconnect={onDisconnectFolder}
              variant="settings"
            />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </footer>
        </>
      )}

      {/* Collapsed, the rail keeps every action it had, as icons. The two
          lists cannot shrink to an icon without losing their contents, so
          each hands its rows to a flyout that opens beside it. */}
      {collapsed && (
        <div className="notes-rail__icons">
          <button
            type="button"
            className="rail-flyout__trigger rail-tip-host"
            onClick={onNewChat}
            aria-label={COPY.askRow}
            aria-current={draftActive ? "true" : undefined}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 2.75h8A1.25 1.25 0 0 1 13.25 4v5A1.25 1.25 0 0 1 12 10.25H6.6L3.75 12.6V10.2A1.25 1.25 0 0 1 2.75 9V4A1.25 1.25 0 0 1 4 2.75Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <RailTip label={COPY.askRow} />
          </button>

          <button
            type="button"
            className="rail-flyout__trigger rail-tip-host"
            /* The collapsed strip stays a single plus. A caret at 56px wide
               would be a corner target barely bigger than the glyph, and
               verse is still one step away through a row's own menu. */
            onClick={() => onCreate("prose")}
            aria-label="New note"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <RailTip label="New note" />
          </button>

          <button
            ref={searchToggleRef}
            type="button"
            className="rail-flyout__trigger rail-tip-host"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="Search notes"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="7.2"
                cy="7.2"
                r="4.2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M10.4 10.4 13.5 13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <RailTip label="Search notes" />
          </button>

          <div className="notes-rail__icons-divider" />

          <RailFlyout
            label={COPY.questionsHeading}
            heading={COPY.questionsHeading}
            open={openFlyout === "chats"}
            onOpenChange={(next) => setOpenFlyout(next ? "chats" : null)}
            isEmpty={conversations.length === 0}
            emptyText={COPY.emptyChatsSidebar}
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 2.75h8A1.25 1.25 0 0 1 13.25 4v5A1.25 1.25 0 0 1 12 10.25H6.6L3.75 12.6V10.2A1.25 1.25 0 0 1 2.75 9V4A1.25 1.25 0 0 1 4 2.75Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            }
          >
            <ul>
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === activeConversationId}
                  menuOpen={openMenuId === conversation.id}
                  onSelect={() => {
                    onSelectConversation(conversation.id);
                    setOpenFlyout(null);
                  }}
                  onMenuOpenChange={(open) =>
                    setOpenMenuId(open ? conversation.id : null)
                  }
                  onRequestDelete={() => setPendingChatDelete(conversation)}
                />
              ))}
            </ul>
          </RailFlyout>

          <RailFlyout
            label="Books"
            heading="Books"
            open={openFlyout === "books"}
            onOpenChange={(next) => setOpenFlyout(next ? "books" : null)}
            isEmpty={books.length === 0}
            emptyText={COPY.emptyBooksSidebar}
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                {/* A spine that folds back on itself, so it reads as a book at
                    18px rather than as the page the notes icon already uses. */}
                <path
                  d="M4.5 2.75h7.75v10.5H4.5a1.25 1.25 0 0 1 0-2.5h7.75"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            }
          >
            <ul>
              {books.map((book) => (
                <BookListItem
                  key={book.id}
                  book={book}
                  isSelected={book.id === selectedBookId}
                  menuOpen={openMenuId === book.id}
                  onSelect={() => {
                    onSelectBook(book.id);
                    setOpenFlyout(null);
                  }}
                  onMenuOpenChange={(open) =>
                    setOpenMenuId(open ? book.id : null)
                  }
                  onRequestDelete={() => setPendingBookDelete(book)}
                />
              ))}
            </ul>
          </RailFlyout>

          <RailFlyout
            label="Notes"
            heading="Notes"
            open={openFlyout === "notes"}
            onOpenChange={(next) => setOpenFlyout(next ? "notes" : null)}
            /* The collapsed rail is the same rail. If it listed notes the
               expanded one hides, widening the sidebar would make notes
               disappear. */
            isEmpty={listedNotes.length === 0}
            emptyText={
              byBook && notes.length > 0
                ? COPY.emptyNotesAllBooked
                : COPY.emptyNotesSidebar
            }
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.75 2.75h4.5l2 2v8.5h-6.5z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.25 8.5h3.5M6.25 10.5h3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            }
          >
            <ul>
              {listedNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  isSelected={note.id === currentNoteId}
                  menuOpen={openMenuId === note.id}
                  onSelect={() => {
                    onSelect(note.id);
                    setOpenFlyout(null);
                  }}
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
          </RailFlyout>
        </div>
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
        open={pendingChatDelete !== null}
        title={`Delete "${pendingChatDelete?.title.trim() || COPY.untitledChat}"?`}
        description="This deletes this conversation. Your notes stay unchanged."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmChatDelete}
        onCancel={cancelChatDelete}
      />

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
