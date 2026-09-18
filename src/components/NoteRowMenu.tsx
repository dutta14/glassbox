import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDismissable } from "../hooks/useDismissable";
import type { NoteFormat } from "../types";
import { createPortal } from "react-dom";
import "../styles/NoteRowMenu.css";

interface NoteRowMenuProps {
  /** Generic on purpose. Used by note rows and by conversation rows. */
  itemId: string;
  itemLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
  /**
   * Both optional because this menu serves conversation rows too, and a chat
   * has no shape to change. Passing neither leaves the menu exactly as it was.
   */
  format?: NoteFormat;
  onToggleFormat?: () => void;
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
  itemId,
  itemLabel,
  open,
  onOpenChange,
  onRequestDelete,
  format,
  onToggleFormat,
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

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /* A chat row passes neither, and gets the menu it has always had. */
  const showFormat = format !== undefined && onToggleFormat !== undefined;
  const toVerse = format === "prose";

  useDismissable({
    open,
    onClose: close,
    parts: [rootRef, listRef],
    returnFocusTo: triggerRef,
  });

  return (
    <div className="note-row__menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="note-row__menu-trigger"
        data-menu-for={itemId}
        aria-haspopup="menu"
        aria-expanded={open}
        // Twenty identical "More actions" buttons are unusable in a screen
        // reader's element list, so each one names its own note.
        aria-label={`More actions for ${itemLabel}`}
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
            {showFormat && (
              <button
                ref={firstItemRef}
                type="button"
                role="menuitem"
                className="note-row__menu-item"
                onClick={() => {
                  onOpenChange(false);
                  onToggleFormat?.();
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  {/* Three ragged lines against one long one: the shape of the
                      change, rather than a letterform that would need reading. */}
                  <path
                    d={
                      toVerse
                        ? "M2.5 4h11M2.5 8h7M2.5 12h9"
                        : "M2.5 4h7M2.5 8h11M2.5 12h11"
                    }
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                {toVerse ? "Turn into verse" : "Turn into prose"}
              </button>
            )}

            <button
              ref={showFormat ? undefined : firstItemRef}
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
