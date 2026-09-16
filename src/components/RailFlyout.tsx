import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "../hooks/useDismissable";
import { RailTip } from "./RailTip";
import "../styles/RailFlyout.css";

interface FlyoutPosition {
  top: number;
  left: number;
}

/** Kept off screen until measured, so the first paint is never in the wrong
    place. */
const OFFSCREEN: FlyoutPosition = { top: -9999, left: -9999 };
const VIEWPORT_MARGIN = 8;
/** Clear of the rail edge without drifting away from the icon it belongs to. */
const ANCHOR_GAP = 8;

interface RailFlyoutProps {
  /** Names the trigger for screen readers, which never see the icon. */
  label: string;
  heading: string;
  icon: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in place of the list, so an empty flyout still explains itself
      rather than opening onto nothing. */
  emptyText: string;
  isEmpty: boolean;
  children: ReactNode;
}

/**
 * A list that lives in the collapsed rail. The rail is too narrow to show
 * titles, so each section keeps its icon and hands its contents to a panel
 * that opens beside it.
 */
export const RailFlyout = ({
  label,
  heading,
  icon,
  open,
  onOpenChange,
  emptyText,
  isEmpty,
  children,
}: RailFlyoutProps) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FlyoutPosition>(OFFSCREEN);
  const headingId = `rail-flyout-${heading.toLowerCase().replace(/\s+/g, "-")}`;

  /**
   * Portalled to the body rather than nested in the rail, because the rail is
   * only as wide as one icon and would clip the panel at its right edge.
   * Escaping the rail means positioning it by hand.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(OFFSCREEN);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!trigger || !panel) return;

    let left = trigger.right + ANCHOR_GAP;
    let top = trigger.top;
    // Flipped to the other side of the icon rather than clamped, because a
    // panel overlapping its own trigger hides what it is anchored to.
    if (left + panel.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, trigger.left - ANCHOR_GAP - panel.width);
    }
    // Pulled back onto screen rather than flipped, so it stays near its icon.
    if (top + panel.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(
        VIEWPORT_MARGIN,
        window.innerHeight - VIEWPORT_MARGIN - panel.height,
      );
    }
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus the panel itself rather than its first row: these lists can be
    // long, and landing on row one would make the heading unreadable to a
    // screen reader that announces from the focus point.
    panelRef.current?.focus();
  }, [open]);

  useDismissable({
    open,
    onClose: () => onOpenChange(false),
    parts: [triggerRef as RefObject<HTMLElement | null>, panelRef],
    returnFocusTo: triggerRef as RefObject<HTMLElement | null>,
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`rail-flyout__trigger rail-tip-host${open ? " rail-flyout__trigger--open" : ""}`}
        onClick={() => onOpenChange(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
      >
        {icon}
        {/* Dropped while the panel is open. The panel names itself in its own
            heading, and the tip would otherwise sit on top of it. */}
        {!open && <RailTip label={label} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="rail-flyout__panel"
            style={{ top: position.top, left: position.left }}
            role="group"
            aria-labelledby={headingId}
            tabIndex={-1}
          >
            <p className="rail-flyout__heading" id={headingId}>
              {heading}
            </p>
            {isEmpty ? (
              <p className="rail-flyout__empty">{emptyText}</p>
            ) : (
              <div className="rail-flyout__list">{children}</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};
