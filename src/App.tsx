import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Answer } from "./types";
import { useNotes } from "./hooks/useNotes";
import { useChat } from "./hooks/useChat";
import { useStorageBackend } from "./hooks/useStorageBackend";
import { useTheme } from "./hooks/useTheme";
import { createIndex, route } from "./engine/router";
import { COPY } from "./engine/copy";
import { NotesRail } from "./components/NotesRail";
import { NoteEditor } from "./components/NoteEditor";
import { ChatPanel } from "./components/ChatPanel";
import "./styles/App.css";

type Tab = "chat" | "editor";
type PendingFocus = "note-list" | null;

const App = () => {
  const {
    store,
    folderState,
    folderName,
    connectError,
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
    <AppReady
      store={store}
      folderState={folderState}
      folderName={folderName}
      connectError={connectError}
      onConnect={connectFolder}
      onReconnect={reconnectFolder}
      onDisconnect={disconnectFolder}
    />
  );
};

interface AppReadyProps {
  store: NonNullable<ReturnType<typeof useStorageBackend>["store"]>;
  folderState: ReturnType<typeof useStorageBackend>["folderState"];
  folderName: string | null;
  connectError: string | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

const AppReady = ({
  store,
  folderState,
  folderName,
  connectError,
  onConnect,
  onReconnect,
  onDisconnect,
}: AppReadyProps) => {
  const { theme, toggleTheme } = useTheme();
  const {
    notes,
    status,
    error,
    storeKind,
    createNote,
    updateNote,
    deleteNote,
    hasSampleNotes,
    deleteSampleNotes,
    externalConflicts,
    dismissConflict,
  } = useNotes(store);

  const storageAvailable = storeKind === "local" ? store.isAvailable() : true;

  const { messages, append, clear, isFirstAssistantMessage } = useChat();

  const [activeTab, setActiveTab] = useState<Tab>("chat");

  const handleOpenChat = useCallback(() => setActiveTab("chat"), []);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    notes[0]?.id ?? null,
  );
  const [pendingScrollOffset, setPendingScrollOffset] = useState<number | null>(
    null,
  );
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);
  const seenConflictIdsRef = useRef<Set<string>>(new Set());

  const index = useMemo(() => createIndex(notes), [notes]);

  useEffect(() => {
    if (selectedNoteId === null && notes.length > 0) {
      setSelectedNoteId(notes[0].id);
    } else if (selectedNoteId && !notes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]?.id ?? null);
    }
  }, [notes, selectedNoteId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNote = useCallback(() => {
    const note = createNote();
    setSelectedNoteId(note.id);
    setActiveTab("editor");
  }, [createNote]);

  const handleSelectNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    setPendingScrollOffset(null);
    setActiveTab("editor");
  }, []);

  const handleJumpToNote = useCallback(
    (noteId: string) => {
      if (!notes.some((n) => n.id === noteId)) return;
      setSelectedNoteId(noteId);
      setActiveTab("editor");
      setPendingScrollOffset(0);
    },
    [notes],
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      const idx = notes.findIndex((n) => n.id === id);
      const nextNote =
        idx >= 0 ? (notes[idx + 1] ?? notes[idx - 1] ?? null) : null;
      deleteNote(id);
      if (nextNote) {
        setSelectedNoteId(nextNote.id);
        setPendingFocus("note-list");
      } else {
        setSelectedNoteId(null);
        setActiveTab("chat");
        setPendingFocus("note-list");
      }
    },
    [deleteNote, notes],
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
      const answer: Answer = route(text, notes, index);
      append(text, answer);
    },
    [append, index, notes],
  );

  const handleExamplePrompt = useCallback(
    (text: string) => {
      handleSubmit(text);
    },
    [handleSubmit],
  );

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
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
        </div>
      )}

      {status === "ready" && (
        <>
          <NotesRail
            notes={notes}
            selectedNoteId={selectedNoteId}
            hasSampleNotes={hasSampleNotes}
            folderState={folderState}
            folderName={folderName}
            connectError={connectError}
            onSelect={handleSelectNote}
            onCreate={handleCreateNote}
            onOpenChat={handleOpenChat}
            chatActive={activeTab === "chat"}
            onDeleteNote={handleDeleteNote}
            onDeleteSamples={deleteSampleNotes}
            onConnectFolder={onConnect}
            onReconnectFolder={onReconnect}
            onDisconnectFolder={onDisconnect}
            theme={theme}
            onToggleTheme={toggleTheme}
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

            <div className="stage__panels" data-active-tab={activeTab}>
              {activeTab === "chat" && (
                <ChatPanel
                  messages={messages}
                  notes={notes}
                  onSubmit={handleSubmit}
                  onJumpToNote={handleJumpToNote}
                  onClear={clear}
                  onExamplePrompt={handleExamplePrompt}
                  isFirstAssistantMessage={isFirstAssistantMessage}
                />
              )}
              {activeTab === "editor" && selectedNote && (
                <NoteEditor
                  note={selectedNote}
                  scrollToOffset={pendingScrollOffset}
                  onChangeTitle={(title) =>
                    updateNote(selectedNote.id, { title })
                  }
                  onChangeBody={(body) => updateNote(selectedNote.id, { body })}
                  onScrollHandled={() => setPendingScrollOffset(null)}
                />
              )}
              {activeTab === "editor" && !selectedNote && (
                <div className="stage__no-note">
                  <p>Select a note or create a new one.</p>
                </div>
              )}
            </div>
          </main>
        </>
      )}
    </div>
  );
};

export default App;
