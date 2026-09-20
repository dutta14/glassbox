import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "../hooks/useDismissable";
import type { OrganizeMode } from "../hooks/useNoteOrganize";
import { COPY } from "../engine/copy";
import "../styles/OrganizeMenu.css";

interface OrganizeMenuProps {
  mode: OrganizeMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (mode: OrganizeMode) => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

const OFFSCREEN: MenuPosition = { top: -9999, left: -9999 };

const VIEWPORT_MARGIN = 8;

const OPTIONS: { mode: OrganizeMode; label: string }[] = [
  { mode: "list", label: COPY.organizeOptionList },
  { mode: "book", label: COPY.organizeOptionBook },
];

/**
 * The menu on the Notes heading. It holds choices, where the menu on a row
 * holds actions, so it looks different on purpose: a vertical kebab rather
 * than the row's horizontal dots, and nothing in it is destructive.
 *
 * The two options are exclusive and show a check, so they are
 * menuitemradio rather than menuitem. A plain menuitem would let a screen
 * reader announce them as two unrelated commands.
 */
export const OrganizeMenu = ({
  mode,
  open,
  onOpenChange,
  onChoose,
}: OrganizeMenuProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const checkedRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition>(OFFSCREEN);

  /* Portalled for the same reason the row menu is: the rail's list scrolls and
     the heading is sticky, so a nested menu would be clipped by both. */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(OFFSCREEN);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const list = listRef.current?.getBoundingClientRect();
    if (!trigger || !list) return;

    let left = trigger.left;
    /* Opens below its own heading rather than level with it, so it covers the
       list it is about to rearrange instead of the heading naming it. */
    let top = trigger.bottom + 4;
    if (left + list.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, trigger.right - list.width);
    }
    /* Clamped upward rather than flipped above the trigger, so it stays
       anchored to the heading it belongs to even near the bottom edge. */
    if (top + list.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(
        VIEWPORT_MARGIN,
        window.innerHeight - VIEWPORT_MARGIN - list.height,
      );
    }
    setPosition({ top, left });
  }, [open]);

  /* Focus lands on the active choice, not the first one, so the menu opens
     saying where you already are. */
  useEffect(() => {
    if (!open) return;
    checkedRef.current?.focus();
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useDismissable({
    open,
    onClose: close,
    parts: [rootRef, listRef],
    returnFocusTo: triggerRef,
  });

  return (
    <div className="organize-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="organize-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={COPY.organizeMenu}
        onClick={() => onOpenChange(!open)}
      >
        {/* Vertical dots, where a row's menu is horizontal. Same family, and
            still tellable apart at a glance. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="3.5" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="12.5" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            className="organize-menu__list"
            role="menu"
            aria-label={COPY.organizeMenu}
            style={{ top: position.top, left: position.left }}
          >
            <p className="organize-menu__heading" aria-hidden="true">
              {COPY.organizeMenu}
            </p>
            {OPTIONS.map((option) => {
              const checked = option.mode === mode;
              return (
                <button
                  key={option.mode}
                  ref={checked ? checkedRef : undefined}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  className="organize-menu__item"
                  onClick={() => {
                    onOpenChange(false);
                    onChoose(option.mode);
                  }}
                >
                  <span className="organize-menu__label">{option.label}</span>
                  {/* Hidden from the screen reader because aria-checked has
                      already said it. Drawn for everyone else. */}
                  <svg
                    className="organize-menu__check"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    {checked && (
                      <path
                        d="M3.5 8.5l3 3 6-6"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
};
