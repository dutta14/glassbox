import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "../types";
import { COPY } from "../engine/copy";
import "../styles/AddToBookModal.css";

interface AddToBookModalProps {
  noteTitle: string;
  books: Book[];
  /** Ids of books that already contain this note. */
  containingBookIds: string[];
  open: boolean;
  onClose: () => void;
  onAddToBook: (bookId: string) => void;
  onCreateBook: (title: string) => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const chapterLabel = (count: number): string =>
  count === 0 ? "Empty" : count === 1 ? "1 chapter" : `${count} chapters`;

export const AddToBookModal = ({
  noteTitle,
  books,
  containingBookIds,
  open,
  onClose,
  onAddToBook,
  onCreateBook,
}: AddToBookModalProps) => {
  const [title, setTitle] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element focus was on before the modal opened, so closing returns the
  // keyboard to the row it came from rather than the top of the document.
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const listLabelId = useId();

  const hasBooks = books.length > 0;

  // Reopening for a different note must not carry the last note's half typed
  // title, so the field is cleared on every open rather than on close.
  useEffect(() => {
    if (open) setTitle("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    if (root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      focusables[0]?.focus();
    }
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    if (!root) return;
    const hadInert = root.hasAttribute("inert");
    root.setAttribute("inert", "");
    return () => {
      if (!hadInert) root.removeAttribute("inert");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* Captured at the document so this runs ahead of the bubble-phase
           handlers underneath, which is the only point at which stopping does
           anything: by the time a window listener sees the key, everything
           else has already acted on it. */
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("inert"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    // A whitespace only title would create a book called "Untitled book", so
    // the confirm is disabled and this guards the Enter path too.
    if (trimmed === "") return;
    onCreateBook(trimmed);
    onClose();
  };

  return createPortal(
    <div
      className="add-book__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="add-book"
      >
        <h2 id={titleId} className="add-book__title">
          Add to book
        </h2>
        <p id={descId} className="add-book__desc">
          Add {noteTitle.trim() || COPY.untitled} to a book.
        </p>

        {hasBooks && (
          <div className="add-book__section">
            <p id={listLabelId} className="add-book__label">
              Your books
            </p>
            <ul className="add-book__list" aria-labelledby={listLabelId}>
              {books.map((book) => {
                const already = containingBookIds.includes(book.id);
                const bookTitle = book.title.trim() || COPY.untitledBook;
                return (
                  <li key={book.id}>
                    <button
                      type="button"
                      className="add-book__book"
                      disabled={already}
                      onClick={() => {
                        onAddToBook(book.id);
                        onClose();
                      }}
                    >
                      <span className="add-book__book-title">{bookTitle}</span>
                      <span className="add-book__book-meta">
                        {already
                          ? "Already in this book"
                          : chapterLabel(book.chapterIds.length)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <form className="add-book__section" onSubmit={onSubmit}>
          <label htmlFor={inputId} className="add-book__label">
            {hasBooks ? "Or create a book" : "Create a book"}
          </label>
          <div className="add-book__create-row">
            <input
              id={inputId}
              type="text"
              className="add-book__input"
              placeholder="Book title"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              type="submit"
              className="add-book__create"
              disabled={title.trim() === ""}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
