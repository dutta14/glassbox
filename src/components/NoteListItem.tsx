import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { NoteRowMenu } from "./NoteRowMenu";
import "../styles/RailRow.css";

interface NoteListItemProps {
  note: Note;
  isSelected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

export const NoteListItem = ({
  note,
  isSelected,
  menuOpen,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
}: NoteListItemProps) => {
  const title = note.title.trim() || COPY.untitled;

  return (
    <li className="note-row">
      <button
        type="button"
        className={`note-item${isSelected ? " note-item--selected" : ""}`}
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        data-note-id={note.id}
      >
        <span className="note-item__title">{title}</span>
      </button>
      <NoteRowMenu
        itemId={note.id}
        itemLabel={title}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onRequestDelete={onRequestDelete}
      />
    </li>
  );
};
