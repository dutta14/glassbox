import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/NoteRowMenu.css";

interface NoteRowMenuProps {
  noteId: string;
  noteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

/** Kept off screen until measured, so the first paint is never in the wrong
    place. */
const OFFSCREEN: MenuPosition = { top: -9999, left: -9999 };

const VIEWPORT_MARGIN = 8;

export const NoteRowMenu = ({
  noteId,
  noteTitle,
  open,
  onOpenChange,
  onRequestDelete,
}: NoteRowMenuProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition>(OFFSCREEN);

  /**
   * The menu is portalled to the body rather than nested in the row, because
   * the rail's note list scrolls and would otherwise clip it at the right and
   * bottom edges. Escaping the rail means positioning it by hand.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(OFFSCREEN);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const list = listRef.current?.getBoundingClientRect();
    if (!trigger || !list) return;

    // Dropping the menu below the trigger left it level with the row beneath,
    // so it read as belonging to that row instead. It opens level with the top
    // of its own row, which is the list item the trigger sits in.
    const row = triggerRef.current?.closest("li")?.getBoundingClientRect();

    // Left edges line up, so the menu hangs off the trigger instead of
    // floating back across the row.
    let left = trigger.left;
    let top = (row ?? trigger).top;
    if (left + list.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, trigger.right - list.width);
    }
    // Pulled back onto screen rather than flipped, so it stays anchored near
    // the row it came from.
    if (top + list.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(
        VIEWPORT_MARGIN,
        window.innerHeight - VIEWPORT_MARGIN - list.height,
      );
    }
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    /** The menu is no longer a DOM descendant of the row, so containment has
        to be asked of both halves. */
    const inside = (target: Node | null): boolean =>
      rootRef.current?.contains(target) === true ||
      listRef.current?.contains(target) === true;

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
      if (inside(e.target as Node)) return;
      onOpenChange(false);
    };

    // Tabbing out of the menu should dismiss it. Deferred because at keydown
    // time focus has not moved yet.
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (inside(document.activeElement)) return;
        onOpenChange(false);
      });
    };

    /** Fixed positioning does not follow a scrolling ancestor, so the menu
        would drift away from its row. Capture, because it is the rail's list
        that scrolls rather than the window. */
    const onReflow = () => onOpenChange(false);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
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

      {open &&
        createPortal(
          <div
            ref={listRef}
            className="note-row__menu-list"
            role="menu"
            style={{ top: position.top, left: position.left }}
          >
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8l.7-8.2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Delete
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
