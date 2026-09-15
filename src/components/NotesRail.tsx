import { useCallback, useRef, useState } from "react";
import type { Note } from "../types";
import { NoteListItem } from "./NoteListItem";
import { NoteSearchModal } from "./NoteSearchModal";
import { useScrollFades } from "../hooks/useScrollFades";
import { ConfirmDialog } from "./ConfirmDialog";
import { StorageControl } from "./StorageControl";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../hooks/useTheme";
import type { FolderState } from "../hooks/useStorageBackend";
import { COPY } from "../engine/copy";
import "../styles/NotesRail.css";

const COLLAPSE_KEY = "glassbox.rail.v1";

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
  selectedNoteId: string | null;
  hasSampleNotes: boolean;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenChat: () => void;
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
  selectedNoteId,
  hasSampleNotes,
  folderState,
  folderName,
  connectError,
  onSelect,
  onCreate,
  onOpenChat,
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
  /** Held here rather than per row, so opening one menu closes any other. */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  /* Nothing reads as open while the chat is showing. Otherwise the rail marks
     two rows current at once, the chat entry and whichever note was last
     opened, and aria-current stops meaning anything. */
  const currentNoteId = chatActive ? null : selectedNoteId;

  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
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
        <button
          type="button"
          className="notes-rail__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect
              x="4"
              y="5"
              width="14"
              height="2.2"
              rx="1.1"
              fill="currentColor"
            />
            <rect
              x="4"
              y="9.4"
              width="10"
              height="2.2"
              rx="1.1"
              fill="currentColor"
            />
            <rect
              x="4"
              y="13.8"
              width="14"
              height="2.2"
              rx="1.1"
              fill="currentColor"
            />
          </svg>
        </button>
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
      </div>

      {!collapsed && (
        <>
          {/* The rail is the only way into the chat now that the Chat/Editor
              tablist is gone, so this reads as the current view rather than as
              an action. aria-current matches how the note rows mark theirs. */}
          <button
            type="button"
            className={`notes-rail__entry${chatActive ? " notes-rail__entry--active" : ""}`}
            onClick={onOpenChat}
            aria-current={chatActive ? "true" : undefined}
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
            Chat
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

          <div className="notes-rail__section">
            <h2 className="notes-rail__title">Notes</h2>
          </div>

          {hasSampleNotes && (
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
            ref={listRef}
            className="notes-rail__list scroll-fades"
            aria-label="Note list"
          >
            {notes.length === 0 ? (
              <div className="notes-rail__empty">
                <p className="notes-rail__empty-title">No notes yet</p>
                <p className="notes-rail__empty-body">
                  {COPY.emptyNotesSidebar}
                </p>
                <button
                  type="button"
                  className="notes-rail__empty-action"
                  onClick={onCreate}
                >
                  Create your first note
                </button>
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
