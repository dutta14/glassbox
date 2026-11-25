import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { NoteRowMenu } from "./NoteRowMenu";
import { Highlight } from "./Highlight";
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
  /* "June 15": the line under the title. The year is the heading above the
     row, so it is not repeated here. */
  dateLabel?: string;
  /* A search in progress. Marks every hit in the title, and the snippet is the
     body line shown under the date when the title has none. */
  query?: string;
  snippet?: string | null;
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
  dateLabel = "",
  query = "",
  snippet = null,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
  onToggleFormat,
  onAddToBook,
}: NoteListItemProps) => {
  const title = note.title.trim() || COPY.untitled;
  const metaId = `note-meta-${note.id}`;

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
        aria-label={
          bookName
            ? `${title}, in ${bookName}`
            : dateLabel || snippet
              ? title
              : undefined
        }
        // The date is read as the row's description, so the name stays the
        // title and a test or a screen reader can still find the row by it.
        aria-describedby={dateLabel ? metaId : undefined}
        aria-current={isSelected ? "true" : undefined}
        data-note-id={note.id}
      >
        <span className="note-item__title">
          {query && note.title.trim() ? (
            <Highlight text={title} query={query} />
          ) : (
            title
          )}
        </span>
        {(bookName || dateLabel) && (
          // The name replaces the bookmark that used to sit here. It says the
          // same thing and more, and a row carrying both read as clutter.
          <span className="note-item__meta" id={metaId}>
            {dateLabel}
            {dateLabel && bookName && " · "}
            {bookName && <span className="note-item__book">{bookName}</span>}
          </span>
        )}
        {snippet && (
          <span className="note-item__snippet">
            <Highlight text={snippet} query={query} />
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
