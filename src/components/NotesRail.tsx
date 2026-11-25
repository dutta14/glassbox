import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Book, Note, NoteFormat } from "../types";
import { NoteListItem } from "./NoteListItem";
import { BookListItem } from "./BookListItem";
import { NewNoteMenu } from "./NewNoteMenu";
import { useScrollFades } from "../hooks/useScrollFades";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsModal } from "./SettingsModal";
import type { Theme } from "../hooks/useTheme";
import type { FolderState } from "../hooks/useStorageBackend";
import { COPY } from "../engine/copy";
import { groupByYear, monthDayOf } from "../utils/groupByYear";
import {
  bodySnippet,
  fullDateOf,
  normalizeQuery,
  searchNotes,
  titleHasHit,
} from "../utils/searchNotes";
import "../styles/NotesRail.css";

const COLLAPSE_KEY = "glassbox.rail.v1";
const TAB_KEY = "glassbox.railTab.v1";

type RailTab = "posts" | "collections";

const TABS: readonly { id: RailTab; label: string }[] = [
  { id: "posts", label: COPY.railTabPosts },
  { id: "collections", label: COPY.railTabCollections },
];

/** Wrapped because localStorage throws in some privacy modes. Anything but a
    known tab falls back to Posts, the tab the rail has always opened on. */
const readTab = (): RailTab => {
  try {
    return localStorage.getItem(TAB_KEY) === "collections"
      ? "collections"
      : "posts";
  } catch {
    return "posts";
  }
};

const writeTab = (tab: RailTab): void => {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Non-fatal. The tab still holds for this session.
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
}: NotesRailProps) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<RailTab>(readTab);
  /* Years the reader has folded. Per session: which years were shut last week
     is not worth remembering. */
  const [foldedYears, setFoldedYears] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const chooseTab = useCallback((next: RailTab) => {
    setTab(next);
    writeTab(next);
  }, []);

  const toggleYear = useCallback((key: string) => {
    setFoldedYears((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  /* Left and Right move between the two tabs, wrapping, and the tab that takes
     focus opens, so what is focused and what is shown never disagree. */
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    chooseTab(next.id);
    document.getElementById(`rail-tab-${next.id}`)?.focus();
  };
  /** Held here rather than per row, so opening one menu closes any other. */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [pendingBookDelete, setPendingBookDelete] = useState<Book | null>(null);
  /* Ask is a pane beside the note now rather than a place the rail can send
     you, so nothing competes with the open note for aria-current and this is
     simply whichever note is open. */
  const currentNoteId = selectedNoteId;

  /* Derived from the same map the rows use to name a note's collection, so
     Posts can never show a note that a collection holds. */
  const postNotes = notes.filter((note) => !bookNameByNoteId.has(note.id));
  const yearGroups = groupByYear(postNotes);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /* Search leaves the tab and the folded years alone, so closing it restores
     them by simply showing them again. */
  const searchQuery = normalizeQuery(query);
  const results = searchOpen ? searchNotes(notes, query) : [];
  useScrollFades(listRef, [notes.length, collapsed, tab, searchOpen]);

  const openSearch = useCallback(() => {
    setQuery("");
    setSearchOpen(true);
  }, []);

  /** Set on close so the Search link, which comes back, takes focus rather
      than letting it drop to the body. */
  const refocusSearchToggle = useRef(false);
  const closeSearch = useCallback(() => {
    refocusSearchToggle.current = true;
    setSearchOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    } else if (refocusSearchToggle.current) {
      refocusSearchToggle.current = false;
      searchToggleRef.current?.focus();
    }
  }, [searchOpen]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeSearch();
  };

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
            {searchOpen ? (
              <div className="notes-rail__search">
                <input
                  ref={searchInputRef}
                  type="search"
                  role="searchbox"
                  className="notes-rail__search-input"
                  placeholder={COPY.searchLabel}
                  aria-label={COPY.searchLabel}
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
                <button
                  type="button"
                  className="notes-rail__search-close"
                  aria-label={COPY.searchCloseLabel}
                  onClick={closeSearch}
                >
                  {COPY.searchClose}
                </button>
              </div>
            ) : (
              <>
                <NewNoteMenu onCreate={onCreate} />

                <button
                  ref={searchToggleRef}
                  type="button"
                  className="notes-rail__entry"
                  onClick={openSearch}
                  aria-label={COPY.searchLabel}
                >
                  Search
                </button>
              </>
            )}
          </div>

          {!searchOpen && (
            <div
              className="notes-rail__tabs"
              role="tablist"
              aria-label={COPY.railTabsLabel}
            >
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`rail-tab-${id}`}
                  className="notes-rail__tab"
                  aria-selected={tab === id}
                  aria-controls="rail-panel"
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => chooseTab(id)}
                  onKeyDown={onTabKeyDown}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* One scroll area for the list, so the rail scrolls as a single
              column. It is the tab panel, so the headings inside are its
              direct children and stick to its top. */}
          <div
            ref={listRef}
            id="rail-panel"
            {...(searchOpen
              ? { role: "region", "aria-label": COPY.searchResultsLabel }
              : { role: "tabpanel", "aria-labelledby": `rail-tab-${tab}` })}
            className="notes-rail__list scroll-fades"
          >
            {searchOpen ? (
              <>
                <div className="notes-rail__status" aria-live="polite">
                  {searchQuery === "" ? (
                    <p className="notes-rail__empty-body">
                      {COPY.searchPrompt}
                    </p>
                  ) : results.length === 0 ? (
                    <p className="notes-rail__empty-body">
                      {COPY.searchNone(query.trim())}
                    </p>
                  ) : (
                    <p className="notes-rail__count">
                      {COPY.searchCount(results.length)}
                    </p>
                  )}
                </div>
                {results.length > 0 && (
                  <ul>
                    {results.map((note) => (
                      <NoteListItem
                        key={note.id}
                        note={note}
                        isSelected={note.id === currentNoteId}
                        menuOpen={openMenuId === note.id}
                        bookName={bookNameByNoteId.get(note.id) ?? null}
                        dateLabel={fullDateOf(note)}
                        query={query}
                        snippet={
                          titleHasHit(note, query)
                            ? null
                            : bodySnippet(note, query)
                        }
                        onSelect={() => onSelect(note.id)}
                        onMenuOpenChange={(menuOpen) =>
                          setOpenMenuId(menuOpen ? note.id : null)
                        }
                        onRequestDelete={() => setPendingDelete(note)}
                        onToggleFormat={() => onToggleNoteFormat(note.id)}
                        onAddToBook={() => onAddNoteToBook(note.id)}
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : tab === "posts" ? (
              <>
                {hasSampleNotes && yearGroups.length > 0 && (
                  <div className="notes-rail__banner" role="note">
                    <p className="notes-rail__banner-text">
                      {COPY.sampleBanner}
                    </p>
                    <button
                      type="button"
                      className="notes-rail__banner-action"
                      onClick={onDeleteSamples}
                    >
                      Delete all samples
                    </button>
                  </div>
                )}

                {yearGroups.length === 0 ? (
                  <div className="notes-rail__empty">
                    <p className="notes-rail__empty-body">
                      {/* Telling someone with 566 notes to write their first
                          one would be a lie. When everything is in a
                          collection, that is the news. */}
                      {notes.length > 0
                        ? COPY.emptyNotesAllBooked
                        : COPY.emptyNotesSidebar}
                    </p>
                  </div>
                ) : (
                  yearGroups.map(({ key, notes: items }) => {
                    const open =
                      !foldedYears.has(key) ||
                      items.some((note) => note.id === currentNoteId);
                    return (
                      <Fragment key={key}>
                        <div className="notes-rail__section notes-rail__section--sticky">
                          <h3
                            className="notes-rail__title"
                            id={`rail-year-${key}`}
                          >
                            <button
                              type="button"
                              className="notes-rail__title-toggle"
                              onClick={() => toggleYear(key)}
                              aria-expanded={open}
                              aria-controls={`rail-year-list-${key}`}
                            >
                              <span className="notes-rail__title-label">
                                {key}
                              </span>
                              <span
                                className="notes-rail__title-mark"
                                aria-hidden="true"
                              />
                              <span
                                className="notes-rail__title-rule"
                                aria-hidden="true"
                              />
                              <span className="notes-rail__title-count">
                                {items.length}
                              </span>
                              <Chevron open={open} />
                            </button>
                          </h3>
                        </div>
                        <ul
                          id={`rail-year-list-${key}`}
                          aria-labelledby={`rail-year-${key}`}
                          hidden={!open}
                        >
                          {items.map((note) => (
                            <NoteListItem
                              key={note.id}
                              note={note}
                              isSelected={note.id === currentNoteId}
                              menuOpen={openMenuId === note.id}
                              dateLabel={monthDayOf(note)}
                              onSelect={() => onSelect(note.id)}
                              onMenuOpenChange={(menuOpen) =>
                                setOpenMenuId(menuOpen ? note.id : null)
                              }
                              onRequestDelete={() => setPendingDelete(note)}
                              onToggleFormat={() => onToggleNoteFormat(note.id)}
                              onAddToBook={() => onAddNoteToBook(note.id)}
                            />
                          ))}
                        </ul>
                      </Fragment>
                    );
                  })
                )}
              </>
            ) : books.length === 0 ? (
              <div className="notes-rail__empty">
                <p className="notes-rail__empty-body">
                  {COPY.emptyBooksSidebar}
                </p>
              </div>
            ) : (
              <ul>
                {books.map((book) => (
                  <BookListItem
                    key={book.id}
                    book={book}
                    isSelected={book.id === selectedBookId}
                    menuOpen={openMenuId === book.id}
                    onSelect={() => onSelectBook(book.id)}
                    onMenuOpenChange={(open) =>
                      setOpenMenuId(open ? book.id : null)
                    }
                    onRequestDelete={() => setPendingBookDelete(book)}
                  />
                ))}
              </ul>
            )}
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
    </aside>
  );
};
