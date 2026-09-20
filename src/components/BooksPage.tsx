import { useMemo, useState } from "react";
import type { Book } from "../types";
import { COPY } from "../engine/copy";
import "../styles/BooksPage.css";

interface BooksPageProps {
  books: Book[];
  /** False until the store has answered, so the page can keep quiet rather
      than claiming there are no books while they are still loading. */
  booksLoaded: boolean;
  onOpen: (bookId: string) => void;
  onCreate: () => void;
}

/**
 * Every book in one place, for readers who keep the rail as a single list.
 *
 * Deliberately plain. The shape is what matters here: a title, a search, a way
 * to start a book, and the books themselves.
 */
export const BooksPage = ({
  books,
  booksLoaded,
  onOpen,
  onCreate,
}: BooksPageProps) => {
  const [query, setQuery] = useState("");

  /* Whitespace is not a search. Typing a space should not empty the shelf. */
  const trimmed = query.trim();

  const matches = useMemo(() => {
    if (trimmed === "") return books;
    const needle = trimmed.toLowerCase();
    return books.filter((book) =>
      (book.title.trim() || COPY.untitledBook).toLowerCase().includes(needle),
    );
  }, [books, trimmed]);

  return (
    <section className="books-page" aria-labelledby="books-page-title">
      <header className="books-page__header">
        <h1 className="books-page__title" id="books-page-title">
          {COPY.booksPageTitle}
        </h1>
        <button type="button" className="books-page__new" onClick={onCreate}>
          {COPY.newBook}
        </button>
      </header>

      <label className="books-page__search">
        <span className="sr-only">{COPY.booksSearch}</span>
        <input
          type="search"
          value={query}
          placeholder={COPY.booksSearch}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {/* Three different nothings, and they do not mean the same thing: still
          loading, no books at all, and none matching what was typed. */}
      {!booksLoaded ? null : books.length === 0 ? (
        <p className="books-page__empty">{COPY.booksPageEmpty}</p>
      ) : matches.length === 0 ? (
        <p className="books-page__empty">{COPY.booksSearchEmpty(trimmed)}</p>
      ) : (
        <ul className="books-page__list">
          {matches.map((book) => {
            const title = book.title.trim() || COPY.untitledBook;
            return (
              <li key={book.id}>
                <button
                  type="button"
                  className="books-page__book"
                  onClick={() => onOpen(book.id)}
                >
                  <span className="books-page__book-title">{title}</span>
                  <span className="books-page__book-count">
                    {COPY.chapterCount(book.chapterIds.length)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
