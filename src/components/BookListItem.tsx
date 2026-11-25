import type { Book, Note } from "../types";
import { COPY } from "../engine/copy";
import { collectionMeta } from "../utils/collectionMeta";
import { NoteRowMenu } from "./NoteRowMenu";
import "../styles/RailRow.css";

interface BookListItemProps {
  book: Book;
  /** The book's chapters that still exist, for the year range. */
  chapters: readonly (Note | null | undefined)[];
  isSelected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

/**
 * A collection row carries its chapter count and the years it spans where a
 * note row carries a date, because a collection's length is the one thing you
 * want to know before opening it and the name alone will not tell you. An empty
 * one says so rather than showing "0 chapters", which reads like a counter
 * that failed.
 */
export const BookListItem = ({
  book,
  chapters,
  isSelected,
  menuOpen,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
}: BookListItemProps) => {
  const title = book.title.trim() || COPY.untitledBook;
  const metaLabel = collectionMeta(book.chapterIds.length, chapters);

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
        <span className="note-item__meta">{metaLabel}</span>
      </button>
      <NoteRowMenu
        itemId={book.id}
        itemLabel={title}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onRequestDelete={onRequestDelete}
        deleteLabel={COPY.deleteCollection}
      />
    </li>
  );
};
