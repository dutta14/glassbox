import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { formatRelative } from "../utils/formatRelative";
import { previewFromBody } from "../utils/previewFromBody";
import "../styles/NoteListItem.css";

interface NoteListItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
}

export const NoteListItem = ({
  note,
  isSelected,
  onSelect,
}: NoteListItemProps) => {
  const title = note.title.trim() || COPY.untitled;
  const preview = previewFromBody(note.body);
  const dateLabel = formatRelative(note.updatedAt);

  return (
    <li>
      <button
        type="button"
        className={`note-item${isSelected ? " note-item--selected" : ""}`}
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
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
