import type { Note } from '../types';
import { COPY } from '../engine/copy';
import '../styles/NoteListItem.css';

interface NoteListItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
}

const formatRelative = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startNoteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startToday - startNoteDay) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const previewFromBody = (body: string): string => {
  const firstLine = body.split(/\n/).find((line) => line.trim().length > 0) ?? '';
  return firstLine.trim();
};

export const NoteListItem = ({ note, isSelected, onSelect }: NoteListItemProps) => {
  const title = note.title.trim() || COPY.untitled;
  const preview = previewFromBody(note.body);
  const dateLabel = formatRelative(note.updatedAt);

  return (
    <li>
      <button
        type="button"
        className={`note-item${isSelected ? ' note-item--selected' : ''}`}
        onClick={onSelect}
        aria-current={isSelected ? 'true' : undefined}
        data-note-id={note.id}
      >
        <span className="note-item__title">{title}</span>
        {preview && <span className="note-item__preview">{preview}</span>}
        <span className="note-item__meta">
          <time dateTime={note.updatedAt}>{dateLabel}</time>
          {note.tags.length > 0 && (
            <span className="note-item__tags">
              {note.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};
