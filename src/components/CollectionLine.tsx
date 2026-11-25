import { Link } from "react-router-dom";
import type { Book } from "../types";
import { COPY } from "../engine/copy";
import { bookPath } from "../engine/routes";
import "../styles/NoteEditor.css";

/** Says which collection a note sits in. A real link and not a button: this is
    a navigation, so it should survive a middle click and be copyable as an
    address. */
export const CollectionLine = ({ book }: { book: Book }) => (
  <p className="editor__from-book">
    {"In the collection – "}
    <Link className="editor__from-book-link" to={bookPath(book.id)}>
      {book.title.trim() || COPY.untitledBook}
    </Link>
  </p>
);
