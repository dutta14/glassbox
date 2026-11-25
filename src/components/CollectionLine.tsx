import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { Book } from "../types";
import { COPY } from "../engine/copy";
import { bookPath } from "../engine/routes";
import "../styles/NoteEditor.css";

interface CollectionLineProps {
  book: Book;
  /** The note the line sits under, so the collection opens at that chapter. */
  noteId: string;
  /** Opens the collection's page at the note. Without it the line is a plain
      link to the page. */
  onOpen?: (bookId: string, noteId: string) => void;
}

/** Says which collection a note sits in. A real link and not a button: this is
    a navigation, so it should survive a middle click and be copyable as an
    address. */
export const CollectionLine = ({
  book,
  noteId,
  onOpen,
}: CollectionLineProps) => {
  /* Only a plain click is taken over. A modified click is the reader asking
     the browser for a new tab, and the chapter target would be spent on it. */
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onOpen ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onOpen(book.id, noteId);
  };

  return (
    <p className="editor__from-book">
      {"In the collection – "}
      <Link
        className="editor__from-book-link"
        to={bookPath(book.id)}
        onClick={handleClick}
      >
        {book.title.trim() || COPY.untitledBook}
      </Link>
    </p>
  );
};
