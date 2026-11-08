import { COPY } from "../engine/copy";
import "../styles/AskFab.css";

interface AskFabProps {
  onOpen: () => void;
  /** The pane's id, so the button can say what it controls. */
  controls: string;
}

/**
 * The way into Ask, now that it has no row in the rail.
 *
 * It floats over the note rather than sitting in the rail because Ask is an
 * accessory to reading, not a destination beside it. A rail row would put it
 * back among the places you go; down here it reads as something you reach for
 * without leaving the page you are on.
 *
 * It renders only when the pane is closed. A button that opens something,
 * still sitting on top of that thing once it is open, was the first flaw the
 * mockups showed: in the overlay layout it landed squarely on the composer.
 * Closing is the pane's own job, in its header, next to the thing it closes.
 */
export const AskFab = ({ onOpen, controls }: AskFabProps) => (
  <button
    type="button"
    className="ask-fab"
    onClick={onOpen}
    aria-label={COPY.askOpen}
    aria-expanded={false}
    aria-controls={controls}
  >
    {/* A question mark, measured to 9.8px tall so it sits between the rail's
        plus at 9.5 and its book at 11.5 rather than reading as a different
        size. Not circled: a circled question mark means Help everywhere else,
        and this is not help. */}
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M7.3 7.2a2.7 2.7 0 1 1 3.6 2.55c-.55.2-.9.72-.9 1.3v.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="14.6" r="0.85" fill="currentColor" />
    </svg>
  </button>
);
