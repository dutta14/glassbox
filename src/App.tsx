import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useMatch,
  useNavigate,
  useParams,
} from "react-router-dom";
import type { Answer, Book, Note, NoteFormat, StoryMark } from "./types";
import { useNotes } from "./hooks/useNotes";
import { useConversations } from "./hooks/useConversations";
import { useBooks } from "./hooks/useBooks";
import { useReadingPosition } from "./hooks/useReadingPosition";
import { useStorageBackend } from "./hooks/useStorageBackend";
import { useTheme } from "./hooks/useTheme";
import { useNoteOrganize } from "./hooks/useNoteOrganize";
import { createIndex, route } from "./engine/router";
import type { TfIdfIndex } from "./engine/tfidf";
import { notePath, bookPath } from "./engine/routes";
import { COPY } from "./engine/copy";
import { NotesRail } from "./components/NotesRail";
import { AddToBookModal } from "./components/AddToBookModal";
import { BookStage } from "./components/BookStage";
import { AskFab } from "./components/AskFab";
import { AskPane } from "./components/AskPane";
import { AskResizer } from "./components/AskResizer";
import { useAskPane } from "./hooks/useAskPane";
import { Library } from "./components/Library";
import { useNoteNeighbours } from "./hooks/useNoteNeighbours";
import { NoteEditor } from "./components/NoteEditor";
import { ChatPanel } from "./components/ChatPanel";
import { NotFound } from "./components/NotFound";
import "./styles/App.css";

type PendingFocus = "note-list" | null;

/* The router itself lives in main.tsx as a HashRouter, matching the finance app.
   A HashRouter keeps the whole route after the '#', so GitHub Pages never sees
   it and serves index.html for every deep link with no 404.html trick and no
   basename to thread through the build. The tradeoff the finance app already
   accepts is the visible hash: /chat/<id> is really /#/chat/<id> in the address
   bar, and likewise /#/note/<id>. */

const App = () => {
  const {
    store,
    conversationStore,
    bookStore,
    folderState,
    folderName,
    connectError,
    folderNotice,
    dismissFolderNotice,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
  } = useStorageBackend();

  if (!store) {
    return (
      <main className="app app--booting" aria-label="Glassbox">
        <h1 className="sr-only">Glassbox</h1>
        <div className="app__loading" role="status" aria-live="polite">
          Loading your notes…
        </div>
      </main>
    );
  }

  return (
    <>
      <AppReady
        store={store}
        conversationStore={conversationStore}
        bookStore={bookStore}
        folderState={folderState}
        folderName={folderName}
        connectError={connectError}
        onConnect={connectFolder}
        onReconnect={reconnectFolder}
        onDisconnect={disconnectFolder}
      />
      {folderNotice && (
        <div className="app__notice" role="status">
          <p>{folderNotice}</p>
          <button type="button" onClick={dismissFolderNotice}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};

/* Which note to open when someone lands on '/'.
   Ask used to live here, so the app opened into a question. It is an accessory
   to the notes now, which leaves the front door to the notes themselves, and
   the most useful note to show is the one they were last reading. */
/* One id, shared by the pane, the resizer and the button, so each can say what
   it controls without three of them inventing their own. */
const ASK_PANE_ID = "ask-pane";

const LAST_NOTE_KEY = "glassbox.lastNote.v1";

export const rememberLastNote = (id: string): void => {
  try {
    localStorage.setItem(LAST_NOTE_KEY, id);
  } catch {
    /* A full or blocked store costs the resume, nothing more. */
  }
};

const readLastNote = (): string | null => {
  try {
    return localStorage.getItem(LAST_NOTE_KEY);
  } catch {
    return null;
  }
};

interface HomeRouteProps {
  notes: Note[];
}

/* Resolved at render rather than in an effect, so there is no frame where the
   reader sees an empty stage before being sent on. The remembered id is
   checked against the library because a note deleted on another machine would
   otherwise send every load to a "not found". */
const HomeRoute = ({ notes }: HomeRouteProps) => {
  if (notes.length === 0) {
    return (
      <div className="stage__empty">
        <p className="stage__empty-title">{COPY.emptyLibraryTitle}</p>
        <p className="stage__empty-body">{COPY.emptyLibraryBody}</p>
      </div>
    );
  }
  const remembered = readLastNote();
  const target =
    remembered !== null && notes.some((n) => n.id === remembered)
      ? remembered
      : notes[0].id;
  return <Navigate to={notePath(target)} replace />;
};

interface NoteStageProps {
  notes: Note[];
  scrollToOffset: number | null;
  onUpdateNote: (id: string, patch: { title?: string; body?: string }) => void;
  onScrollHandled: () => void;
  onSelectNote: (id: string) => void;
  readAsset: (path: string) => Promise<Blob | null>;
  /* The whole index rather than this note's books, because the stage reads the
     id from the URL and so cannot be handed its own slice from outside. */
  bookByNoteId: Map<string, Book>;
}

/* The stage for /note/:id. This route only mounts once notes have loaded, since
   the shell gates the whole workspace on status === 'ready'. A missing note
   here is therefore a genuine dead link, deleted or hand-typed, not one still
   on its way in, which is what makes showing "not found" safe without bouncing
   a note deep link on refresh. */
const NoteStage = ({
  notes,
  scrollToOffset,
  onUpdateNote,
  onScrollHandled,
  onSelectNote,
  readAsset,
  bookByNoteId,
}: NoteStageProps) => {
  const { id } = useParams();
  const note = notes.find((n) => n.id === id) ?? null;
  const { previous: previousNote, next: nextNote } = useNoteNeighbours(
    notes,
    id ?? null,
  );

  if (!note) {
    return <NotFound what="note" />;
  }

  return (
    <NoteEditor
      note={note}
      scrollToOffset={scrollToOffset}
      onChangeTitle={(title) => onUpdateNote(note.id, { title })}
      onChangeBody={(body) => onUpdateNote(note.id, { body })}
      onScrollHandled={onScrollHandled}
      previousNote={previousNote}
      nextNote={nextNote}
      onSelectNote={onSelectNote}
      readAsset={readAsset}
      book={bookByNoteId.get(note.id) ?? null}
    />
  );
};

interface BookStageRouteProps {
  books: Book[];
  notes: Note[];
  booksLoaded: boolean;
  onReorder: (bookId: string, chapterIds: string[]) => void;
  onRemoveChapter: (bookId: string, noteId: string) => void;
  onSetNumbered: (bookId: string, noteId: string, numbered: boolean) => void;
  onSetStory: (bookId: string, noteId: string, title: string | null) => void;
  onApplyStories: (bookId: string, stories: StoryMark[]) => void;
  onRename: (bookId: string, title: string) => void;
  /** Where reading stopped in each book, so a book reopens where it was left. */
  positionFor: (bookId: string) => string | null;
  onReadChapter: (bookId: string, chapterId: string) => void;
  /** The book and chapter picked from the rail, if the pick is still unspent. */
  openAt: { bookId: string; chapterId: string } | null;
  onOpenedAtChapter: () => void;
}

const BookStageRoute = ({
  books,
  notes,
  booksLoaded,
  onReorder,
  onRemoveChapter,
  onSetNumbered,
  onSetStory,
  onApplyStories,
  onRename,
  positionFor,
  onReadChapter,
  openAt,
  onOpenedAtChapter,
}: BookStageRouteProps) => {
  const { id } = useParams();
  const book = books.find((b) => b.id === id) ?? null;

  /* Bound to the book id rather than rebuilt on every render, because
     BookStage watches this callback in the effect that installs its chapter
     observer. A fresh function each render would tear that observer down and
     rebuild it on every scroll-driven state change. */
  const handleReadChapter = useCallback(
    (chapterId: string) => {
      if (book) onReadChapter(book.id, chapterId);
    },
    [book, onReadChapter],
  );

  /* Books arrive from storage a moment after the first render. Deciding "not
     found" before that load settles would flash a dead-link message at anyone
     who opened a book's URL directly or reloaded on one. */
  if (!book) {
    return booksLoaded ? <NotFound what="book" /> : null;
  }

  /* Positional, not filtered: BookStage pairs chapters[i] with
     book.chapterIds[i], so a note deleted outside the app has to stay in the
     array as a null and be reported in its place. Compacting it here would
     shift every later chapter onto the wrong id. */
  const chapters = book.chapterIds.map(
    (noteId) => notes.find((n) => n.id === noteId) ?? null,
  );

  return (
    <BookStage
      book={book}
      chapters={chapters}
      onReorder={(chapterIds) => onReorder(book.id, chapterIds)}
      onRemoveChapter={(noteId) => onRemoveChapter(book.id, noteId)}
      onSetNumbered={(noteId, numbered) =>
        onSetNumbered(book.id, noteId, numbered)
      }
      onSetStory={(noteId, title) => onSetStory(book.id, noteId, title)}
      onApplyStories={(stories) => onApplyStories(book.id, stories)}
      onRename={(title) => onRename(book.id, title)}
      resumeChapterId={positionFor(book.id)}
      onReadChapter={handleReadChapter}
      /* Only this book's pick counts. A pick left over from another book
         would scroll this one to a chapter it does not contain. */
      openAtChapterId={openAt?.bookId === book.id ? openAt.chapterId : null}
      onOpenedAtChapter={onOpenedAtChapter}
    />
  );
};

interface AppReadyProps {
  store: NonNullable<ReturnType<typeof useStorageBackend>["store"]>;
  conversationStore: ReturnType<typeof useStorageBackend>["conversationStore"];
  bookStore: ReturnType<typeof useStorageBackend>["bookStore"];
  folderState: ReturnType<typeof useStorageBackend>["folderState"];
  folderName: string | null;
  connectError: string | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

export const AppReady = ({
  store,
  conversationStore,
  bookStore,
  folderState,
  folderName,
  connectError,
  onConnect,
  onReconnect,
  onDisconnect,
}: AppReadyProps) => {
  const { theme, toggleTheme } = useTheme();
  const [organizeMode, setOrganizeMode] = useNoteOrganize();
  const navigate = useNavigate();

  // useMatch is react-router's own way to ask, from above <Routes>, "is this the
  // open route and with what id". The rail and the document title live up here,
  // so this is where the URL becomes the source of truth the old navigation
  // state used to be. Which note is selected and which tab is active are read
  // from the route, never stored. The old effect that auto-selected notes[0]
  // whenever selection was null is gone with that state: '/' now means a new
  // chat draft, and reviving that effect would send every empty draft into a
  // note instead.
  const noteMatch = useMatch("/note/:id");
  const bookMatch = useMatch("/book/:id");
  const selectedNoteId = noteMatch?.params.id ?? null;

  /* Remembered on every visit rather than on close, because the app is more
     often quit than closed politely, and a tab that dies still leaves the
     reader where they were. */
  useEffect(() => {
    if (selectedNoteId !== null) rememberLastNote(selectedNoteId);
  }, [selectedNoteId]);
  const selectedBookId = bookMatch?.params.id ?? null;

  const {
    notes,
    status,
    error,
    storeKind,
    createNote,
    updateNote,
    setNoteFormat,
    deleteNote,
    hasSampleNotes,
    deleteSampleNotes,
    readAsset,
    externalConflicts,
    dismissConflict,
  } = useNotes(store);

  const storageAvailable = storeKind === "local" ? store.isAvailable() : true;

  const {
    open: askOpen,
    width: askWidth,
    openPane,
    closePane,
    setWidth: setAskWidth,
  } = useAskPane();

  const {
    conversations,
    activeId: activeConversationId,
    messages,
    startDraft,
    select: selectConversation,
    append,
    remove: removeConversation,
    isFirstAssistantMessage,
    skippedCount: skippedChatCount,
  } = useConversations(conversationStore);

  const {
    books,
    loaded: booksLoaded,
    createBook,
    addChapter,
    removeChapter,
    setChapterNumbered,
    setStoryStart,
    setStories,
    reorderChapters,
    deleteBook,
    renameBook,
    bookByNoteId,
    removeNoteFromAllBooks,
  } = useBooks(bookStore);

  /* Per-device UI state, so it lives in localStorage and never enters the
     notes folder. A reading position is not something anyone would want
     syncing between machines or showing up as a file in their archive. */
  const {
    positionFor: readingPositionFor,
    remember: rememberReadingPosition,
    forget: forgetReadingPosition,
  } = useReadingPosition();

  /* Reduced to a name per note, because that is all a rail row shows. */
  const bookNameByNoteId = useMemo(() => {
    const byNote = new Map<string, string>();
    for (const [noteId, book] of bookByNoteId) {
      byNote.set(noteId, book.title.trim() || COPY.untitledBook);
    }
    return byNote;
  }, [bookByNoteId]);

  const [pendingScrollOffset, setPendingScrollOffset] = useState<number | null>(
    null,
  );
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);
  const seenConflictIdsRef = useRef<Set<string>>(new Set());

  /* Built when a question is asked, not when the notes change.
     
     The retrieval index has exactly one reader, the route() call in
     handleSubmit. Holding it in a useMemo keyed on notes meant it was rebuilt
     every time that array got a new identity, and useNotes mints a new array
     on every edit, which the editor fires per keystroke. On the library this
     was built for that is a full pass over 570 notes between one character and
     the next: measured at 80ms, about five dropped frames, for a value nobody
     reads until the reader asks something.

     Cached against the array it was built from rather than a counter or a
     hash. Identity is exactly the right test here: useNotes replaces the array
     on any change and keeps it otherwise, so this rebuilds when the corpus
     moves and holds across repeated questions. */
  const indexCache = useRef<{ source: Note[]; index: TfIdfIndex } | null>(null);
  const getIndex = useCallback((): TfIdfIndex => {
    if (indexCache.current?.source !== notes) {
      indexCache.current = { source: notes, index: createIndex(notes) };
    }
    return indexCache.current.index;
  }, [notes]);

  /* The tab title is the browser's own record of where you are. Back-button
     menus and a wall of tabs are unreadable when every one says "Glassbox", so
     it names the open note and falls back to the bare app name otherwise.

     Conversations no longer appear here. A question is asked beside whatever
     you are reading rather than instead of it, so the note is still the honest
     answer to "where am I", and a title that flipped to the question would
     misreport the tab the moment the pane opened. */
  useEffect(() => {
    let title = "Glassbox";
    if (selectedNoteId !== null) {
      const note = notes.find((n) => n.id === selectedNoteId);
      if (note) title = `${note.title || "Untitled"} · Glassbox`;
    }
    document.title = title;
  }, [selectedNoteId, notes]);

  const handleCreateNote = useCallback(
    (format: NoteFormat = "prose") => {
      const note = createNote(format);
      navigate(notePath(note.id));
    },
    [createNote, navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCreateNote]);

  const handleSelectNote = useCallback(
    (id: string) => {
      if (selectedNoteId === id) return;
      setPendingScrollOffset(null);
      navigate(notePath(id));
    },
    [selectedNoteId, navigate],
  );

  const handleJumpToNote = useCallback(
    (noteId: string) => {
      if (!notes.some((n) => n.id === noteId)) return;
      // A jump always scrolls to the top of the target, even when that target
      // is the note already open, so the scroll request is set unconditionally
      // and only the navigation is skipped to avoid a duplicate history entry.
      setPendingScrollOffset(0);
      if (selectedNoteId === noteId) return;
      navigate(notePath(noteId));
    },
    [notes, selectedNoteId, navigate],
  );

  /* Reached from any row in the rail, so it works on a note the reader is not
     looking at. It deliberately does not navigate: reshaping a poem three
     rows down should not drag the reader away from what they are reading. */
  const handleToggleNoteFormat = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      setNoteFormat(
        id,
        (note.format ?? "prose") === "verse" ? "prose" : "verse",
      );
    },
    [notes, setNoteFormat],
  );

  /* The note whose "Add to book" was chosen. Held as an id rather than the
     note itself so a rename or edit while the modal is open cannot show a
     stale title. */
  const [addToBookNoteId, setAddToBookNoteId] = useState<string | null>(null);

  const handleRequestAddToBook = useCallback((id: string) => {
    setAddToBookNoteId(id);
  }, []);

  /* Null when the id names a note that no longer exists, which closes the
     modal through `open`. */
  const addToBookNote = useMemo(
    () =>
      addToBookNoteId === null
        ? null
        : (notes.find((n) => n.id === addToBookNoteId) ?? null),
    [addToBookNoteId, notes],
  );

  const handleAddToBook = useCallback(
    (bookId: string) => {
      if (addToBookNoteId === null) return;
      // The title goes along so the book can tell a prologue from a chapter
      // and suggest whether it takes a number.
      void addChapter(bookId, addToBookNoteId, addToBookNote?.title ?? "");
      setAddToBookNoteId(null);
    },
    [addChapter, addToBookNote, addToBookNoteId],
  );

  /* Creating the book and adding the note are one action to the user, so a
     failure to add must not leave a named but empty book behind as though it
     had worked. Awaiting the create is what makes the new id available to add
     into. */
  const handleCreateBookWithNote = useCallback(
    (title: string) => {
      const noteId = addToBookNoteId;
      if (noteId === null) return;
      const noteTitle = addToBookNote?.title ?? "";
      setAddToBookNoteId(null);
      void (async () => {
        const book = await createBook(title);
        await addChapter(book.id, noteId, noteTitle);
      })();
    },
    [addChapter, addToBookNote, createBook, addToBookNoteId],
  );

  const handleSelectBook = useCallback(
    (id: string) => {
      navigate(bookPath(id));
    },
    [navigate],
  );

  /* Held in state rather than passed through the URL. The pick is a one-shot
     instruction, and a URL is a place: putting it in the address would make
     reloading or sharing the link repeat a glance that was only meant once. */
  const [openAt, setOpenAt] = useState<{
    bookId: string;
    chapterId: string;
  } | null>(null);

  const handleOpenChapter = useCallback(
    (bookId: string, chapterId: string) => {
      setOpenAt({ bookId, chapterId });
      navigate(bookPath(bookId));
    },
    [navigate],
  );

  const handleOpenedAtChapter = useCallback(() => setOpenAt(null), []);

  const handleOpenBooks = useCallback(() => {
    navigate("/books");
  }, [navigate]);

  /* Lands the reader in the book it just made, which is where naming it and
     adding chapters happens. An untitled book is valid: BookStage can rename
     it, and asking for a name before there is anything to name would put a
     dialog in front of a one-click action. */
  const handleCreateBook = useCallback(() => {
    void createBook(COPY.untitledBook).then((book) => {
      navigate(bookPath(book.id));
    });
  }, [createBook, navigate]);

  /* Leaving the book's own URL behind matters here. Once the record is gone
     the address points at nothing, so staying put would leave a dead route in
     history for the back button to land on. Only the open book moves the URL;
     deleting some other book from the rail leaves the address bar alone. */
  const handleDeleteBook = useCallback(
    (id: string) => {
      void deleteBook(id);
      // The record would otherwise outlive the book and be handed to a new
      // book that happened to reuse the id.
      forgetReadingPosition(id);
      if (selectedBookId === id) navigate("/", { replace: true });
    },
    [deleteBook, forgetReadingPosition, navigate, selectedBookId],
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      const idx = notes.findIndex((n) => n.id === id);
      const neighbour =
        idx >= 0 ? (notes[idx + 1] ?? notes[idx - 1] ?? null) : null;
      deleteNote(id);
      /* A book holding a deleted note would render a missing chapter forever.
         The book view tolerates that for a file deleted outside the app, but
         a deletion we performed ourselves should not leave the wreckage. */
      void removeNoteFromAllBooks(id);
      // Only the note actually on screen moves the URL. Deleting some other
      // note from the rail leaves the address bar alone, because the URL is the
      // truth about what is open and nothing open changed. The old code always
      // moved selection; staying put is the behaviour the route now demands.
      // The replace, not a push, is deliberate: the deleted note's URL is dead
      // and must not sit in history waiting for the back button to resurrect a
      // blank stage.
      if (id === selectedNoteId) {
        navigate(neighbour ? notePath(neighbour.id) : "/", { replace: true });
      }
      setPendingFocus("note-list");
    },
    [deleteNote, removeNoteFromAllBooks, navigate, notes, selectedNoteId],
  );

  /* removeConversation already moves the selection to a neighbour, and the
     pane reads that selection directly. Deleting the open question used to
     have to rewrite the URL as well; with conversations out of the address bar
     there is no second copy of the truth to keep in step. */
  const handleDeleteConversation = useCallback(
    (id: string) => {
      removeConversation(id);
    },
    [removeConversation],
  );

  useEffect(() => {
    if (pendingFocus === null) return;
    const raf = requestAnimationFrame(() => {
      if (pendingFocus === "note-list") {
        const selected =
          selectedNoteId !== null
            ? document.querySelector<HTMLElement>(
                `[data-note-id="${selectedNoteId}"]`,
              )
            : null;
        const target =
          selected ?? document.querySelector<HTMLElement>(".notes-rail__new");
        target?.focus();
      }
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingFocus, selectedNoteId]);

  const handleSubmit = useCallback(
    (text: string) => {
      const answer: Answer = route(text, notes, getIndex());
      /* A draft mints a new conversation, anything else extends the open one.
         This used to need two refs to survive the gap between append setting
         the active id and a replace-navigate landing on an async hashchange.
         The pane does not navigate, so activeConversationId is simply true at
         the moment it is read and the explicit null is enough. */
      const wasDraft = activeConversationId === null;
      append(text, answer, wasDraft ? null : undefined);
    },
    [activeConversationId, append, getIndex, notes],
  );

  const handleExamplePrompt = useCallback(
    (text: string) => {
      handleSubmit(text);
    },
    [handleSubmit],
  );

  const chatPanel = (
    <ChatPanel
      messages={messages}
      notes={notes}
      onSubmit={handleSubmit}
      onJumpToNote={handleJumpToNote}
      onExamplePrompt={handleExamplePrompt}
      isFirstAssistantMessage={isFirstAssistantMessage}
    />
  );

  return (
    <div className="app">
      <a className="skip-link" href="#stage">
        Skip to main workspace
      </a>

      {status === "loading" && (
        <div className="app__loading" role="status" aria-live="polite">
          Loading your notes…
        </div>
      )}

      {status === "error" && (
        <div className="app__error" role="alert">
          <p>Could not load your notes.</p>
          {error && <p className="app__error-detail">{error}</p>}
          {/* The rail, and the settings that disconnect a folder, are not
              drawn in this state. Without a way out here, a folder that fails
              to load would fail the same way on every launch. */}
          {folderState === "connected" && (
            <button
              type="button"
              className="app__error-action"
              onClick={() => void onDisconnect()}
            >
              Use the notes saved in this browser
            </button>
          )}
        </div>
      )}

      {status === "ready" && (
        <>
          <NotesRail
            organizeMode={organizeMode}
            onOrganizeChange={setOrganizeMode}
            notes={notes}
            selectedNoteId={selectedNoteId}
            hasSampleNotes={hasSampleNotes}
            folderState={folderState}
            folderName={folderName}
            connectError={connectError}
            onSelect={handleSelectNote}
            onCreate={handleCreateNote}
            books={books}
            selectedBookId={selectedBookId}
            bookNameByNoteId={bookNameByNoteId}
            onSelectBook={handleSelectBook}
            onOpenBooks={handleOpenBooks}
            onOpenChapter={handleOpenChapter}
            onDeleteBook={handleDeleteBook}
            onAddNoteToBook={handleRequestAddToBook}
            onDeleteNote={handleDeleteNote}
            onToggleNoteFormat={handleToggleNoteFormat}
            onDeleteSamples={deleteSampleNotes}
            onConnectFolder={onConnect}
            onReconnectFolder={onReconnect}
            onDisconnectFolder={onDisconnect}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Resolved from the id every render rather than captured when the
              menu was clicked, so an edit to the title while the modal is open
              shows the note's real name. A note deleted underneath it resolves
              to null and the modal closes rather than naming something gone. */}
          <AddToBookModal
            open={addToBookNote !== null}
            noteTitle={addToBookNote?.title.trim() || COPY.untitled}
            books={books}
            currentBookId={
              addToBookNote
                ? (bookByNoteId.get(addToBookNote.id)?.id ?? null)
                : null
            }
            onClose={() => setAddToBookNoteId(null)}
            onAddToBook={handleAddToBook}
            onCreateBook={handleCreateBookWithNote}
          />

          <main
            id="stage"
            className="stage"
            aria-label="Main workspace"
            tabIndex={-1}
          >
            <h1 className="sr-only">Glassbox: ask your notes</h1>

            {!storageAvailable && (
              <div className="stage__banner" role="status">
                {COPY.storageUnavailable}
              </div>
            )}

            {/* AC 60. Skipping unreadable chats without saying so leaves the
                rail looking like a complete list that is quietly short. This
                is status rather than alert: nothing the user just did caused
                it, and it is already true by the time they see the app. */}
            {skippedChatCount > 0 && (
              <div className="stage__banner stage__banner--warn" role="status">
                <span>
                  {skippedChatCount === 1
                    ? "1 chat could not be loaded. Your notes are unaffected."
                    : `${skippedChatCount} chats could not be loaded. Your notes are unaffected.`}
                </span>
              </div>
            )}

            {externalConflicts.map((c) => {
              const isNew = !seenConflictIdsRef.current.has(c.id);
              if (isNew) seenConflictIdsRef.current.add(c.id);
              return (
                <div
                  key={c.id}
                  className="stage__banner stage__banner--warn"
                  role={isNew ? "alert" : "status"}
                >
                  <span>
                    &ldquo;{c.title}&rdquo; changed on disk while you were
                    editing it. Your unsaved edits are kept.
                  </span>
                  <button
                    type="button"
                    className="stage__banner-dismiss"
                    onClick={() => dismissConflict(c.id)}
                    aria-label={`Dismiss warning for ${c.title}`}
                  >
                    Dismiss
                  </button>
                </div>
              );
            })}

            <div className="stage__panels">
              <Routes>
                <Route path="/" element={<HomeRoute notes={notes} />} />
                {/* Conversations used to be places you could link to. They are
                    not any more: Ask opens beside whatever you are reading
                    rather than replacing it, and a pane is not a location.
                    Old links still resolve rather than dying, they just land
                    home, and the stored chats themselves are untouched. */}
                <Route path="/chat/:id" element={<Navigate to="/" replace />} />
                <Route
                  path="/note/:id"
                  element={
                    <NoteStage
                      notes={notes}
                      scrollToOffset={pendingScrollOffset}
                      onUpdateNote={updateNote}
                      onScrollHandled={() => setPendingScrollOffset(null)}
                      onSelectNote={handleSelectNote}
                      readAsset={readAsset}
                      bookByNoteId={bookByNoteId}
                    />
                  }
                />
                {/* Any path that is not the draft, a chat, or a note is sent
                    home rather than shown as an error, matching the finance
                    app's catch-all. A dead /chat/<id> or /note/<id> still
                    resolves to a calm "not found" inside its own route, because
                    those paths match above and never reach this line. */}
                <Route
                  path="/book/:id"
                  element={
                    <BookStageRoute
                      books={books}
                      notes={notes}
                      booksLoaded={booksLoaded}
                      onReorder={reorderChapters}
                      onRemoveChapter={removeChapter}
                      onSetNumbered={setChapterNumbered}
                      onSetStory={setStoryStart}
                      onApplyStories={setStories}
                      onRename={(bookId, title) => {
                        void renameBook(bookId, title);
                      }}
                      positionFor={readingPositionFor}
                      onReadChapter={rememberReadingPosition}
                      openAt={openAt}
                      onOpenedAtChapter={handleOpenedAtChapter}
                    />
                  }
                />
                {/* Before the catch-all, or it would redirect away. */}
                <Route
                  path="/books"
                  element={
                    <Library
                      notes={notes}
                      books={books}
                      onOpenSpine={(spine) => {
                        if (spine.kind === "book") handleSelectBook(spine.id);
                      }}
                      onCreate={handleCreateBook}
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>

            {/* Only when the pane is shut. A button that opens something, still
                sitting on top of that thing once open, was the first flaw the
                mockups showed. Closing belongs in the pane's own header. */}
            {!askOpen && <AskFab onOpen={openPane} controls={ASK_PANE_ID} />}
          </main>

          {askOpen && (
            <>
              <AskResizer
                width={askWidth}
                onWidth={setAskWidth}
                controls={ASK_PANE_ID}
              />
              <AskPane
                id={ASK_PANE_ID}
                width={askWidth}
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelectConversation={selectConversation}
                onNewQuestion={startDraft}
                onDeleteConversation={handleDeleteConversation}
                onClose={closePane}
              >
                {/* Mounted here rather than under a Route, which is what used
                    to make this fragile. The old '/' and '/chat/:id' routes
                    both had to resolve to the same component or the composer
                    would remount and eat a prompt typed the instant after
                    hitting Ask. Outside the router that cannot happen: moving
                    between notes, books and search never touches this tree. */}
                {chatPanel}
              </AskPane>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default App;
