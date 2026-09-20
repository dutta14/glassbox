import type { ReactNode } from "react";
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
  children?: ReactNode;
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
  children,
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
    <li className={expansion ? "note-row note-row--expandable" : "note-row"}>
      {expansion && (
        <button
          type="button"
          className="book-row__expander"
          aria-expanded={expansion.open}
          // Twenty "Expand" buttons are unusable in a screen reader's element
          // list, so each names its own book.
          aria-label={`${expansion.open ? "Collapse" : "Expand"} ${title}`}
          onClick={expansion.onToggle}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d={
                expansion.open
                  ? "M2.5 4.5L6 8l3.5-3.5"
                  : "M4.5 2.5L8 6l-3.5 3.5"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
      {expansion?.open && children}
    </li>
  );
};
