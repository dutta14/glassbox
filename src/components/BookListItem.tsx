import type { Book } from "../types";
import { COPY } from "../engine/copy";
import { NoteRowMenu } from "./NoteRowMenu";
import "../styles/RailRow.css";

interface BookListItemProps {
  book: Book;
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
  isSelected,
  menuOpen,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
}: BookListItemProps) => {
  const title = book.title.trim() || COPY.untitledBook;
  const count = book.chapterIds.length;
  const countLabel =
    count === 0 ? "Empty" : count === 1 ? "1 chapter" : `${count} chapters`;

  return (
    <li className="note-row">
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
