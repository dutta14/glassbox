import { useMemo, useState } from 'react';
import type { Note } from '../types';
import { NoteListItem } from './NoteListItem';
import { StorageControl } from './StorageControl';
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
}: NotesRailProps) => {
  const [filter, setFilter] = useState('');

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
        <div className="notes-rail__header-row">
          <h2 className="notes-rail__title">Notes</h2>
          <button
            type="button"
            className="notes-rail__new"
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
        <StorageControl
          folderState={folderState}
          folderName={folderName}
          connectError={connectError}
          onConnect={onConnectFolder}
          onReconnect={onReconnectFolder}
          onDisconnect={onDisconnectFolder}
        />
      </header>

      <div className="notes-rail__search" role="search">
        <input
          type="search"
          className="notes-rail__search-input"
          placeholder="Filter notes"
          aria-label="Filter notes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
    </aside>
  );
};
