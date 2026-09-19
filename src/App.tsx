import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Routes,
  Route,
  Navigate,
  useMatch,
  useNavigate,
  useParams,
} from "react-router-dom";
import type { Answer, Conversation, Note, NoteFormat } from "./types";
import { useNotes } from "./hooks/useNotes";
import { useConversations } from "./hooks/useConversations";
import { useStorageBackend } from "./hooks/useStorageBackend";
import { useTheme } from "./hooks/useTheme";
import { createIndex, route } from "./engine/router";
import { notePath, chatPath } from "./engine/routes";
import { COPY } from "./engine/copy";
import { NotesRail } from "./components/NotesRail";
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
      conversationStore={conversationStore}
      folderState={folderState}
      folderName={folderName}
      connectError={connectError}
      onConnect={connectFolder}
      onReconnect={reconnectFolder}
      onDisconnect={disconnectFolder}
    />
  );
};

interface ChatStageProps {
  conversationsLoaded: boolean;
  conversations: Conversation[];
  children: ReactNode;
}

/* The stage for /chat/:id. The id is read with useParams, so react-router does
   the decoding and the encode-on-write in chatPath is the whole contract: an id
   that carried a slash or a space when the link was built arrives here whole.

   It waits for conversationsLoaded on purpose. Chats load on their own clock,
   and before that first list resolves an id that is not in the set yet is
   unproven rather than invalid. Judging it early is the bounce that loses every
   chat deep link on refresh, so until then we hold on a loading state. */
const ChatStage = ({
  conversationsLoaded,
  conversations,
  children,
}: ChatStageProps) => {
  const { id } = useParams();
  // The draft route '/' has no id and is always valid, so it renders the panel
  // straight through. Crucially both '/' and '/chat/:id' resolve to this same
  // ChatStage component, which is what lets react-router keep one ChatPanel
  // instance mounted as the route flips between them. If the two routes
  // rendered different element types, the outlet would swap them, React would
  // remount the composer, and any prompt typed during that flip, exactly what
  // happens when a user hits "New chat" and immediately types, would be lost
  // to an emptied input. Keeping the type stable keeps the composer alive.
  if (!id) {
    return <>{children}</>;
  }
  if (!conversationsLoaded) {
    return (
      <div className="app__loading" role="status" aria-live="polite">
        Loading your chats…
      </div>
    );
  }
  if (!conversations.some((c) => c.id === id)) {
    return <NotFound what="chat" />;
  }
  return <>{children}</>;
};

interface NoteStageProps {
  notes: Note[];
  scrollToOffset: number | null;
  onUpdateNote: (id: string, patch: { title?: string; body?: string }) => void;
  onScrollHandled: () => void;
  onSelectNote: (id: string) => void;
  readAsset: (path: string) => Promise<Blob | null>;
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
    />
  );
};

interface AppReadyProps {
  store: NonNullable<ReturnType<typeof useStorageBackend>["store"]>;
  conversationStore: ReturnType<typeof useStorageBackend>["conversationStore"];
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
  folderState,
  folderName,
  connectError,
  onConnect,
  onReconnect,
  onDisconnect,
}: AppReadyProps) => {
  const { theme, toggleTheme } = useTheme();
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
  const chatMatch = useMatch("/chat/:id");
  const selectedNoteId = noteMatch?.params.id ?? null;
  const chatRouteId = chatMatch?.params.id ?? null;
  // Draft is the absence of both matches, which is the index path and, for the
  // blink before the catch-all redirect lands, any unrecognised path too.
  const isDraftRoute = noteMatch === null && chatMatch === null;
  const activeTab = noteMatch ? "editor" : "chat";

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
    conversations,
    activeId: activeConversationId,
    loaded: conversationsLoaded,
    messages,
    startDraft,
    select: selectConversation,
    append,
    remove: removeConversation,
    isFirstAssistantMessage,
    skippedCount: skippedChatCount,
  } = useConversations(conversationStore);

  const [pendingScrollOffset, setPendingScrollOffset] = useState<number | null>(
    null,
  );
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);
  const seenConflictIdsRef = useRef<Set<string>>(new Set());

  // The id of a conversation just minted from a draft, held only for the blink
  // between append setting activeId and the replace-navigate landing. append's
  // setActiveId and navigate() do not commit together, so there is a render
  // where the route still reads '/' but a real conversation is already active.
  // Without this the route-to-state sync below would see draft + active and
  // "helpfully" reset to a draft, throwing away the conversation the user just
  // created and, with it, the one-time reasoning expansion append had set. This
  // is the exact race the design warns about; the ref is what defuses it.
  const freshConversationIdRef = useRef<string | null>(null);

  // Set by "New chat", read and cleared by the next submit. It forces that
  // submit to mint a brand new conversation even when the async hashchange from
  // navigate('/') has not landed yet, so typing straight after "New chat" never
  // appends to the thread just left. Being a ref, it is immune to the route and
  // activeId timing that a click-then-type sequence can otherwise outrun.
  const newDraftPendingRef = useRef(false);

  const index = useMemo(() => createIndex(notes), [notes]);

  /* The route drives the open conversation, not the other way around. Back and
     forward, a refresh, and a hand-typed /chat/<id> all move through here, so
     the sync lives in one effect keyed on the route rather than being scattered
     across the click handlers, which only cover the cases the user reaches by
     clicking.

     It waits for conversationsLoaded on purpose. Before the store's first list
     resolves the set is empty for reasons that have nothing to do with the URL,
     and selecting or invalidating a route against that empty set is the bounce
     that loses every deep link on refresh. */
  useEffect(() => {
    if (!conversationsLoaded) return;
    if (chatRouteId !== null) {
      const exists = conversations.some((c) => c.id === chatRouteId);
      if (exists && activeConversationId !== chatRouteId) {
        selectConversation(chatRouteId);
      } else if (activeConversationId === chatRouteId) {
        // Release the fresh-id guard only once the route AND the active
        // conversation have both settled onto the same id. A HashRouter lands
        // its navigation on an async hashchange, so this effect can run in a
        // torn moment where the route already reads /chat/<new> but activeId
        // has not caught up. Clearing the guard on the mere sight of a chat
        // route would drop the protection in exactly that window, and a
        // reordered draft render could then wipe the conversation just made.
        // Waiting for activeId to match keeps the guard until it is truly spent.
        freshConversationIdRef.current = null;
      }
    } else if (isDraftRoute) {
      // Reset to an empty draft when something is still open, which is how back
      // and forward onto '/' clear the stage. The one case this must not touch
      // is the blink after a draft submit, where activeId already points at the
      // brand new conversation but the replace-navigate has not landed yet. The
      // ref marks that id so we leave it alone; resetting here would call
      // startDraft() at the worst possible moment and wipe what was just made.
      if (
        activeConversationId !== null &&
        activeConversationId !== freshConversationIdRef.current
      ) {
        startDraft();
      }
    }
  }, [
    chatRouteId,
    isDraftRoute,
    conversationsLoaded,
    conversations,
    activeConversationId,
    selectConversation,
    startDraft,
  ]);

  /* The tab title is the browser's own record of where you are. Back-button
     menus and a wall of tabs are unreadable when every one says "Glassbox", so
     it reflects the open note or chat by name and falls back to the bare app
     name for a draft or a dead link. */
  useEffect(() => {
    let title = "Glassbox";
    if (selectedNoteId !== null) {
      const note = notes.find((n) => n.id === selectedNoteId);
      if (note) title = `${note.title || "Untitled"} · Glassbox`;
    } else if (chatRouteId !== null) {
      const conversation = conversations.find((c) => c.id === chatRouteId);
      if (conversation) title = `${conversation.title} · Glassbox`;
    }
    document.title = title;
  }, [selectedNoteId, chatRouteId, notes, conversations]);

  /* Always a fresh draft. Returning to whatever thread was last open would
     make the row ambiguous: it would sometimes resume and sometimes start
     over, depending on history the user cannot see. */
  const handleNewChat = useCallback(() => {
    // Selecting the thing already open must not stack a duplicate history
    // entry, so a click while already on the draft is a no-op.
    if (isDraftRoute) return;
    // Mark the next submit as a fresh draft synchronously. A HashRouter lands
    // navigate('/') on an async hashchange, so isDraftRoute and activeId can
    // both still read the previous chat when a prompt is typed immediately
    // after this click. Without this ref that prompt would append to the thread
    // we just left instead of starting a new one. A ref is used rather than
    // nulling activeId here, because nulling it while the chat route is still
    // current makes the route-to-state sync re-select the old thread.
    newDraftPendingRef.current = true;
    navigate("/");
  }, [isDraftRoute, navigate]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (chatRouteId === id) return;
      navigate(chatPath(id));
    },
    [chatRouteId, navigate],
  );

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
      setNoteFormat(id, (note.format ?? "prose") === "verse" ? "prose" : "verse");
    },
    [notes, setNoteFormat],
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      const idx = notes.findIndex((n) => n.id === id);
      const neighbour =
        idx >= 0 ? (notes[idx + 1] ?? notes[idx - 1] ?? null) : null;
      deleteNote(id);
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
    [deleteNote, navigate, notes, selectedNoteId],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      const wasOpen = chatRouteId === id;
      const landed = removeConversation(id);
      // Same rule as notes: replace the URL only when the deleted thread was
      // the open one, and replace rather than push so its dead address does not
      // linger in history.
      if (wasOpen) {
        navigate(landed ? chatPath(landed) : "/", { replace: true });
      }
    },
    [chatRouteId, navigate, removeConversation],
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
      // Captured before append, because append is what mints the id and moves
      // us off the draft. A draft has no URL of its own, so the first prompt
      // has to swap '/' for '/chat/<id>'. It is a replace, not a push: pushing
      // would leave the empty draft in history, and back would return to a
      // blank composer the user can never get a real thread out of again.
      //
      // newDraftPendingRef wins over activeConversationId on purpose. Right
      // after "New chat" the async hashchange may not have landed, so activeId
      // can still point at the previous thread; honouring the ref is what makes
      // the new prompt start a new conversation instead of extending the old
      // one. Passing null as the explicit target tells append to mint fresh
      // rather than trust its own possibly-stale activeId.
      const wasDraft = newDraftPendingRef.current || activeConversationId === null;
      newDraftPendingRef.current = false;
      const id = append(text, answer, wasDraft ? null : undefined);
      if (wasDraft) {
        // Mark this id as freshly minted so the route-to-state sync leaves it
        // alone during the render where the route still reads '/' but activeId
        // has already advanced. See freshConversationIdRef where it is declared.
        freshConversationIdRef.current = id;
        navigate(chatPath(id), { replace: true });
      }
    },
    [activeConversationId, append, index, navigate, notes],
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
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            chatActive={activeTab === "chat"}
            onDeleteNote={handleDeleteNote}
            onToggleNoteFormat={handleToggleNoteFormat}
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

            <div className="stage__panels" data-active-tab={activeTab}>
              <Routes>
                <Route
                  path="/"
                  element={
                    <ChatStage
                      conversationsLoaded={conversationsLoaded}
                      conversations={conversations}
                    >
                      {chatPanel}
                    </ChatStage>
                  }
                />
                <Route
                  path="/chat/:id"
                  element={
                    <ChatStage
                      conversationsLoaded={conversationsLoaded}
                      conversations={conversations}
                    >
                      {chatPanel}
                    </ChatStage>
                  }
                />
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
                    />
                  }
                />
                {/* Any path that is not the draft, a chat, or a note is sent
                    home rather than shown as an error, matching the finance
                    app's catch-all. A dead /chat/<id> or /note/<id> still
                    resolves to a calm "not found" inside its own route, because
                    those paths match above and never reach this line. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </>
      )}
    </div>
  );
};

export default App;
