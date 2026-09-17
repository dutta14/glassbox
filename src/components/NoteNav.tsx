import type { Note } from "../types";
import { COPY } from "../engine/copy";
import "../styles/NoteNav.css";

interface NoteNavProps {
  previous: Note | null;
  next: Note | null;
  onSelect: (id: string) => void;
}

const titleOf = (note: Note): string => note.title.trim() || COPY.untitled;

/**
 * Moves between notes in the order they were written, sitting under the note
 * the way it does at the foot of a blog post.
 *
 * Buttons rather than links: a note is selection state, not a route, so there
 * is no href to give them.
 */
export const NoteNav = ({ previous, next, onSelect }: NoteNavProps) => {
  // A single note has nowhere to go, and an empty nav would leave its rule
  // hanging under the body for no reason.
  if (!previous && !next) return null;

  return (
    <nav className="note-nav" aria-label="Previous and next notes">
      {previous && (
        <button
          type="button"
          className="note-nav__link note-nav__link--prev"
          onClick={() => onSelect(previous.id)}
          aria-label={`Previous note: ${titleOf(previous)}`}
        >
          <span className="note-nav__direction">← Previous</span>
          <span className="note-nav__title">{titleOf(previous)}</span>
        </button>
      )}
      {next && (
        <button
          type="button"
          className="note-nav__link note-nav__link--next"
          onClick={() => onSelect(next.id)}
          aria-label={`Next note: ${titleOf(next)}`}
        >
          <span className="note-nav__direction">Next →</span>
          <span className="note-nav__title">{titleOf(next)}</span>
        </button>
      )}
    </nav>
  );
};
