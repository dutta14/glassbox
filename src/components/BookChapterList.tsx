import { useRef } from "react";
import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { NoteListItem } from "./NoteListItem";
import { useScrollFades } from "../hooks/useScrollFades";
import "../styles/BookChapterList.css";

interface BookChapterListProps {
  /** Named by the expander that opens it, via aria-controls. */
  listId: string;
  bookTitle: string;
  /** The notes themselves, in the book's own chapter order. */
  chapters: Note[];
  currentNoteId: string | null;
  openMenuId: string | null;
  onSelect: (noteId: string) => void;
  onMenuOpenChange: (noteId: string, open: boolean) => void;
  onRequestDelete: (note: Note) => void;
  onToggleFormat: (noteId: string) => void;
  onAddToBook: (noteId: string) => void;
}

/**
 * The chapters of one expanded book, in the rail.
 *
 * Rows are the same NoteListItem the Notes list uses, because they are the
 * same notes: book mode only moves a note under its book, so a row that
 * looked or behaved differently here would be claiming otherwise. Reusing it
 * is also what gives a chapter its own actions menu.
 *
 * The book name is deliberately not passed. That badge exists to tell you
 * which book a note is in, and under the book's own heading it would say
 * nothing the row does not already say.
 *
 * Its own scroll area rather than part of the rail's, so a book costs the same
 * height whatever its length. One book here holds 131 chapters, and letting it
 * push everything else out of the rail would make expanding it a thing you
 * only do once.
 */
export const BookChapterList = ({
  listId,
  bookTitle,
  chapters,
  currentNoteId,
  openMenuId,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
  onToggleFormat,
  onAddToBook,
}: BookChapterListProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  /* Chapters are the dep: adding or removing one changes whether the list
     overflows, and nothing else would tell the hook. */
  useScrollFades(listRef, [chapters]);

  if (chapters.length === 0) {
    return (
      <p id={listId} className="book-chapters__empty">
        {COPY.emptyBookChapters}
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      id={listId}
      /* Five rows rarely holds a whole book, so the list has to say that it
         runs on. Without an edge fade a box that ends exactly on a row looks
         like a book with five chapters. */
      className="book-chapters scroll-fades"
      aria-label={`Chapters in ${bookTitle}`}
    >
      {chapters.map((note) => (
        <NoteListItem
          key={note.id}
          note={note}
          isSelected={note.id === currentNoteId}
          menuOpen={openMenuId === note.id}
          onSelect={() => onSelect(note.id)}
          onMenuOpenChange={(open) => onMenuOpenChange(note.id, open)}
          onRequestDelete={() => onRequestDelete(note)}
          onToggleFormat={() => onToggleFormat(note.id)}
          onAddToBook={() => onAddToBook(note.id)}
        />
      ))}
    </ul>
  );
};
