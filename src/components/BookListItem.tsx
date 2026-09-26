import type { Book } from "../types";
import { COPY } from "../engine/copy";
import { NoteRowMenu } from "./NoteRowMenu";
import "../styles/RailRow.css";

/** Grouped rather than three optional props, so the type cannot describe a
    row that renders an expander whose toggle does nothing. Either the row
    expands and every part works, or there is no expander. */
export interface BookExpansion {
  open: boolean;
  onToggle: () => void;
}

interface BookListItemProps {
  book: Book;
  /** Absent in list mode, where a book row does not open. */
  expansion?: BookExpansion;
  isSelected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

/**
 * A book row carries its chapter count where a note row carries nothing,
 * because a book's length is the one thing you want to know before opening it
 * and the title alone will not tell you. An empty book says so rather than
 * showing "0 chapters", which reads like a counter that failed.
 */
export const BookListItem = ({
  book,
  expansion,
  isSelected,
  menuOpen,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
}: BookListItemProps) => {
  const title = book.title.trim() || COPY.untitledBook;
  const countLabel = COPY.chapterCount(book.chapterIds.length);

  return (
    <li className={expansion ? "note-row note-row--expandable" : "note-row"}>
      {expansion && (
        <button
          type="button"
          className="book-row__expander"
          aria-expanded={expansion.open}
          aria-controls={`book-chapters-${book.id}`}
          // Twenty "Expand" buttons are unusable in a screen reader's element
          // list, so each names its own book.
          aria-label={`${expansion.open ? "Collapse" : "Expand"} ${title}`}
          onClick={expansion.onToggle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* The shape carries the state: shut while the chapters are hidden,
                open once they are showing. */}
            {expansion.open ? (
              <>
                <path d="M12 7v14" />
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
              </>
            ) : (
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
            )}
          </svg>
        </button>
      )}
      <button
        type="button"
        className={`note-item${isSelected ? " note-item--selected" : ""}`}
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        data-book-id={book.id}
      >
        <span className="note-item__title">{title}</span>
        {/* Read out as part of the row rather than hidden, so the count is
            available to a screen reader too. It is one short phrase, not
            enough to make the list tedious to listen through. */}
        <span className="note-item__meta">{countLabel}</span>
      </button>
      <NoteRowMenu
        itemId={book.id}
        itemLabel={title}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onRequestDelete={onRequestDelete}
      />
    </li>
  );
};
