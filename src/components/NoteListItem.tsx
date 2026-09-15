import type { Note } from "../types";
import { COPY } from "../engine/copy";
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
      </button>
    </li>
  );
};
