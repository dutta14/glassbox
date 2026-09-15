import { useEffect, useRef } from "react";
import "../styles/NoteRowMenu.css";

interface NoteRowMenuProps {
  noteId: string;
  noteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

export const NoteRowMenu = ({
  noteId,
  noteTitle,
  open,
  onOpenChange,
  onRequestDelete,
}: NoteRowMenuProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  /** Focus enters the menu on open so a keyboard user is not stranded on the
      trigger with an open menu they cannot reach. */
  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped so the editor and any ancestor handler do not also react to
      // the same Escape that only meant "close this menu".
      e.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };

    /** Pointer rather than click, so the menu is gone before the press lands
        on whatever is underneath it. */
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    };

    // Tabbing out of the menu should dismiss it. Deferred because at keydown
    // time focus has not moved yet.
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!rootRef.current) return;
        if (rootRef.current.contains(document.activeElement)) return;
        onOpenChange(false);
      });
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    rootRef.current?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      rootRef.current?.removeEventListener("focusout", onFocusOut);
    };
  }, [open, onOpenChange]);

  return (
    <div className="note-row__menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="note-row__menu-trigger"
        data-menu-for={noteId}
        aria-haspopup="menu"
        aria-expanded={open}
        // Twenty identical "More actions" buttons are unusable in a screen
        // reader's element list, so each one names its own note.
        aria-label={`More actions for ${noteTitle}`}
        onClick={() => onOpenChange(!open)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="note-row__menu-list" role="menu">
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            className="note-row__menu-item note-row__menu-item--danger"
            onClick={() => {
              onOpenChange(false);
              onRequestDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
