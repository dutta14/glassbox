import { useCallback, useEffect, useRef, useState } from "react";
import { useDismissable } from "../hooks/useDismissable";
import type { NoteFormat } from "../types";
import "../styles/NewNoteMenu.css";

interface NewNoteMenuProps {
  onCreate: (format: NoteFormat) => void;
}

/**
 * A split control rather than a menu, because the two choices are not equal.
 * Almost everything written here is prose, so "New note" stays a single click
 * and verse costs one deliberate extra step. Making both live behind one menu
 * would tax the common case to advertise the rare one.
 *
 * Not portalled, unlike the row menu: this sits above the rail's scroll area,
 * so nothing clips it and it can be positioned in normal flow.
 */
export const NewNoteMenu = ({ onCreate }: NewNoteMenuProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useDismissable({
    open,
    onClose: close,
    parts: [rootRef, listRef],
    returnFocusTo: triggerRef,
  });

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
  }, [open]);

  /* Closed before the note is made, so focus can land on the new note's title
     instead of being pulled back to a menu that is still open. */
  const choose = (format: NoteFormat) => {
    setOpen(false);
    onCreate(format);
  };

  return (
    <div className="new-note" ref={rootRef}>
      <div className="new-note__row">
        {/* Visible text, so the control names itself instead of leaning on
            an aria-label that only assistive tech ever sees. */}
        <button
          type="button"
          className="notes-rail__entry notes-rail__new new-note__primary"
          onClick={() => onCreate("prose")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New note
        </button>

        <button
          ref={triggerRef}
          type="button"
          className="new-note__disclosure"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="New note options"
          onClick={() => setOpen(!open)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 6.5 8 10l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div ref={listRef} className="new-note__list" role="menu">
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            className="new-note__item"
            onClick={() => choose("prose")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              {/* Full measure lines for prose, ragged ones for verse: the
                  shape of the result, not a letterform to be read. */}
              <path
                d="M2.5 4h7M2.5 8h11M2.5 12h11"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Note
          </button>

          <button
            type="button"
            role="menuitem"
            className="new-note__item"
            onClick={() => choose("verse")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4h11M2.5 8h7M2.5 12h9"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Verse
          </button>
        </div>
      )}
    </div>
  );
};
