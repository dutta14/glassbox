import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { NoteRowMenu } from "./NoteRowMenu";
import "../styles/RailRow.css";

interface NoteListItemProps {
  note: Note;
  isSelected: boolean;
  menuOpen: boolean;
  /* The caller holds the reverse index, so this arrives resolved. It is the
     name rather than a flag because the row shows the book, and a row in no
     book passes nothing at all. Only the first book is named: the rail is
     narrow, and the note itself lists every book it belongs to. */
  bookName?: string | null;
  onSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
  onToggleFormat: () => void;
  onAddToBook?: () => void;
}

export const NoteListItem = ({
  note,
  isSelected,
  menuOpen,
  bookName = null,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
  onToggleFormat,
  onAddToBook,
}: NoteListItemProps) => {
  const title = note.title.trim() || COPY.untitled;

  return (
    <li className="note-row">
      <button
        type="button"
        className={`note-item${isSelected ? " note-item--selected" : ""}`}
        onClick={onSelect}
        /* Stated outright rather than left to the name computation, which
           joins the row's spans with no separator and gave "Chapter 5Autumn".
           A hidden span holding the punctuation did not fix it either: the
           whitespace at the edge of a node is normalised away, non-breaking
           or not. Spelling the name out is the only form that does not depend
           on how an engine concatenates. It still opens with the visible
           title, so the visible label remains a prefix of the spoken one. */
        aria-label={bookName ? `${title}, in ${bookName}` : undefined}
        aria-current={isSelected ? "true" : undefined}
        data-note-id={note.id}
      >
        <span className="note-item__title">{title}</span>
        {bookName && (
          // The name replaces the bookmark that used to sit here. It says the
          // same thing and more, and a row carrying both read as clutter. The
          // whole span only renders for a note in a book, so the hundreds of
          // rows that are not stay exactly as they were.
          <span className="note-item__meta">
            <span className="note-item__book">{bookName}</span>
          </span>
        )}
      </button>
      <NoteRowMenu
        itemId={note.id}
        itemLabel={title}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onRequestDelete={onRequestDelete}
        format={note.format ?? "prose"}
        onToggleFormat={onToggleFormat}
        onAddToBook={onAddToBook}
      />
    </li>
  );
};
