import { COPY } from "../engine/copy";
import "../styles/BookChapterList.css";

export interface RailChapter {
  id: string;
  /** The note's own title. A book's contents renames its chapters to read as
      a contents; the rail does not, because the row is the same note the
      Notes list shows and it should answer to one name. */
  label: string;
}

interface BookChapterListProps {
  bookTitle: string;
  chapters: RailChapter[];
  currentNoteId: string | null;
  onOpen: (chapterId: string) => void;
}

/**
 * The chapters of one expanded book, in the rail.
 *
 * Its own scroll area rather than part of the rail's, so a book costs the same
 * height whatever its length. One book here holds 131 chapters, and letting it
 * push everything else out of the rail would make expanding it a thing you
 * only do once.
 */
export const BookChapterList = ({
  bookTitle,
  chapters,
  currentNoteId,
  onOpen,
}: BookChapterListProps) => {
  if (chapters.length === 0) {
    return <p className="book-chapters__empty">{COPY.emptyBookChapters}</p>;
  }

  return (
    <ul className="book-chapters" aria-label={`Chapters in ${bookTitle}`}>
      {chapters.map((chapter) => {
        const current = chapter.id === currentNoteId;
        return (
          <li key={chapter.id}>
            <button
              type="button"
              className={`book-chapters__item${current ? " book-chapters__item--current" : ""}`}
              aria-current={current ? "true" : undefined}
              onClick={() => onOpen(chapter.id)}
            >
              {chapter.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
