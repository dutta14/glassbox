import { useCallback, useRef, useState } from "react";
import type { Conversation, Note } from "../types";
import { NoteListItem } from "./NoteListItem";
import { ConversationItem } from "./ConversationItem";
import { NoteSearchModal } from "./NoteSearchModal";
import { RailFlyout } from "./RailFlyout";
import { useScrollFades } from "../hooks/useScrollFades";
import { ConfirmDialog } from "./ConfirmDialog";
import { StorageControl } from "./StorageControl";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../hooks/useTheme";
import type { FolderState } from "../hooks/useStorageBackend";
import { COPY } from "../engine/copy";
import "../styles/NotesRail.css";

const COLLAPSE_KEY = "glassbox.rail.v1";
const SECTIONS_KEY = "glassbox.railSections.v1";

type SectionName = "chats" | "notes";
type SectionState = Record<SectionName, boolean>;

/** Both open is the state the rail has always had, so a first-time reader
    sees no change. */
const DEFAULT_SECTIONS: SectionState = { chats: true, notes: true };

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
  /** Null while a draft chat is open, which is its own kind of current. */
  activeConversationId: string | null;
  selectedNoteId: string | null;
  hasSampleNotes: boolean;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  chatActive: boolean;
  onDeleteNote: (id: string) => void;
  onDeleteSamples: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export const NotesRail = ({
  notes,
  conversations,
  activeConversationId,
  selectedNoteId,
  hasSampleNotes,
  folderState,
  folderName,
  connectError,
  onSelect,
  onCreate,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  chatActive,
  onDeleteNote,
  onDeleteSamples,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  theme,
  onToggleTheme,
}: NotesRailProps) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [sections, setSections] = useState<SectionState>(readSections);
  /** Only one flyout at a time: two panels open beside a one-icon-wide rail
      would overlap each other. */
  const [openFlyout, setOpenFlyout] = useState<SectionName | null>(null);
  const chatsOpen = sections.chats;
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
  const [pendingChatDelete, setPendingChatDelete] = useState<Conversation | null>(
    null,
  );
  /* Nothing reads as open while the chat is showing. Otherwise the rail marks
     two rows current at once, the chat entry and whichever note was last
     opened, and aria-current stops meaning anything. */
  const currentNoteId = chatActive ? null : selectedNoteId;
  /* A draft is current only when the chat is showing and no saved thread is
     open. Without this the New chat row and a conversation row would both
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
          className="notes-rail__toggle"
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
            New chat
          </button>

          {/* Visible text, so the control names itself instead of leaning on
              an aria-label that only assistive tech ever sees. */}
          <button
            type="button"
            className="notes-rail__entry notes-rail__new"
            onClick={onCreate}
          >
            <svg
              width="16"
              height="16"
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
            New note
          </button>

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
                  Chats
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
                  <p className="notes-rail__empty-title">No chats yet</p>
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

            <nav id="rail-notes-list" aria-label="Note list" hidden={!notesOpen}>
              {notes.length === 0 ? (
                <div className="notes-rail__empty">
                  <p className="notes-rail__empty-title">No notes yet</p>
                  <p className="notes-rail__empty-body">
                    {COPY.emptyNotesSidebar}
                  </p>
                </div>
              ) : (
                <ul>
                  {notes.map((note) => (
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
            className="rail-flyout__trigger"
            onClick={onNewChat}
            aria-label="New chat"
            aria-current={draftActive ? "true" : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 2.75h8A1.25 1.25 0 0 1 13.25 4v5A1.25 1.25 0 0 1 12 10.25H6.6L3.75 12.6V10.2A1.25 1.25 0 0 1 2.75 9V4A1.25 1.25 0 0 1 4 2.75Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            className="rail-flyout__trigger"
            onClick={onCreate}
            aria-label="New note"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            ref={searchToggleRef}
            type="button"
            className="rail-flyout__trigger"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="Search notes"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7.2" cy="7.2" r="4.2" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.4 10.4 13.5 13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="notes-rail__icons-divider" />

          <RailFlyout
            label="Chats"
            heading="Chats"
            open={openFlyout === "chats"}
            onOpenChange={(next) => setOpenFlyout(next ? "chats" : null)}
            isEmpty={conversations.length === 0}
            emptyText={COPY.emptyChatsSidebar}
            icon={
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
            label="Notes"
            heading="Notes"
            open={openFlyout === "notes"}
            onOpenChange={(next) => setOpenFlyout(next ? "notes" : null)}
            isEmpty={notes.length === 0}
            emptyText={COPY.emptyNotesSidebar}
            icon={
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
              {notes.map((note) => (
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
                />
              ))}
            </ul>
          </RailFlyout>
        </div>
      )}

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
