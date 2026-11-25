import type { ReactNode } from "react";
import type { Note } from "../types";
import { readingTime } from "../utils/readingTime";
import "../styles/NoteEditor.css";

const formatWritten = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  // The year is always carried. Notes here go back well over a decade, and a
  // bare "Dec 28" on something written in 2010 reads as though it were written
  // last winter.
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

interface NoteColophonProps {
  note: Note;
  /** Trails the reading time on the same line, as the feed's Edit link does. */
  action?: ReactNode;
}

/* A chapter opens with its title and nothing else, so when the note was
   written and what it is tagged with are held back to the foot. They are still
   the first thing after the prose ends, just no longer standing between the
   title and the first line.

   The date is createdAt, not updatedAt. A poem from 2011 belongs to 2011, and
   correcting a typo in it this afternoon does not make it a poem from this
   afternoon. The rail orders on createdAt for the same reason, so the foot of
   the note agrees with the list it came from. */
export const NoteColophon = ({ note, action }: NoteColophonProps) => (
  <footer className="editor__colophon">
    <p className="editor__written">
      Written{" "}
      <time dateTime={note.createdAt}>{formatWritten(note.createdAt)}</time>
      <span className="editor__meta-separator" aria-hidden="true">
        {" · "}
      </span>
      <span className="editor__reading-time">
        {readingTime(note.body)} min read
      </span>
      {action && (
        <>
          <span className="editor__meta-separator" aria-hidden="true">
            {" · "}
          </span>
          {action}
        </>
      )}
    </p>
    {note.tags.length > 0 && (
      <div className="editor__tags" role="group" aria-label="Tags">
        {note.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    )}
  </footer>
);
