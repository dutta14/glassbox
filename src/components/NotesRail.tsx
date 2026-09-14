import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../types';
import { NoteListItem } from './NoteListItem';
import { StorageControl } from './StorageControl';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '../hooks/useTheme';
import type { FolderState } from '../hooks/useStorageBackend';
import { COPY } from '../engine/copy';
import '../styles/NotesRail.css';

interface NotesRailProps {
  notes: Note[];
  selectedNoteId: string | null;
  hasSampleNotes: boolean;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
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
  onDeleteSamples,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  theme,
  onToggleTheme,
}: NotesRailProps) => {
  const [filter, setFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  /**
   * Closing clears the filter. A collapsed field with a live query would hide
   * notes with nothing on screen explaining why the list looks short.
   */
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setFilter('');
    searchToggleRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const title = n.title.toLowerCase();
      const body = n.body.toLowerCase();
      const tags = n.tags.join(' ').toLowerCase();
      return title.includes(q) || body.includes(q) || tags.includes(q);
    });
  }, [filter, notes]);

  return (
    <aside className="notes-rail" aria-label="Notes">
      <header className="notes-rail__header">
        <div className="notes-rail__brand">Glassbox</div>
      </header>

      <div className="notes-rail__section">
        <div className="notes-rail__header-row">
          <h2 className="notes-rail__title">Notes</h2>
          <div className="notes-rail__actions">
            <button
              ref={searchToggleRef}
              type="button"
              className="notes-rail__action"
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              aria-expanded={searchOpen}
              aria-controls="notes-search"
              aria-label="Filter notes"
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
            <button
              type="button"
              className="notes-rail__action notes-rail__action--new"
              onClick={onCreate}
              aria-label="New note"
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
            </button>
          </div>
        </div>
      </div>

      <div
        className="notes-rail__search"
        id="notes-search"
        role="search"
        hidden={!searchOpen}
      >
        <input
          ref={searchInputRef}
          type="search"
          className="notes-rail__search-input"
          placeholder="Filter notes"
          aria-label="Filter notes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeSearch();
            }
          }}
        />
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

      <nav className="notes-rail__list" aria-label="Note list">
        {filtered.length === 0 ? (
          <div className="notes-rail__empty">
            <p className="notes-rail__empty-title">
              {notes.length === 0 ? 'No notes yet' : 'No matches'}
            </p>
            <p className="notes-rail__empty-body">
              {notes.length === 0
                ? COPY.emptyNotesSidebar
                : 'Try a different filter.'}
            </p>
            {notes.length === 0 && (
              <button
                type="button"
                className="notes-rail__empty-action"
                onClick={onCreate}
              >
                New note
              </button>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                onSelect={() => onSelect(note.id)}
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
    </aside>
  );
};
