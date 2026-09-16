import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface DismissableOptions {
  open: boolean;
  onClose: () => void;
  /**
   * Everything that counts as "inside". Portalled panels are not DOM
   * descendants of their trigger, so containment has to be asked of each part
   * separately rather than of one root.
   */
  parts: RefObject<HTMLElement | null>[];
  /** Focused when Escape closes the layer, so the keyboard does not get
      dumped back at the top of the document. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Shared dismissal for transient layers anchored to a trigger: the row menu
 * and the collapsed rail's flyouts. Both are portalled out of a scrolling
 * container, and both were growing the same four listeners by hand.
 */
export const useDismissable = ({
  open,
  onClose,
  parts,
  returnFocusTo,
}: DismissableOptions): void => {
  // Held in refs so the listeners do not resubscribe on every render just
  // because the caller rebuilt the array literal.
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const returnRef = useRef(returnFocusTo);
  returnRef.current = returnFocusTo;

  useEffect(() => {
    if (!open) return;

    const inside = (target: Node | null): boolean =>
      partsRef.current.some(part => part.current?.contains(target) === true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped so the editor and any ancestor handler do not also react to
      // the same Escape that only meant "close this layer".
      e.stopPropagation();
      onClose();
      returnRef.current?.current?.focus();
    };

    /** Pointer rather than click, so the layer is gone before the press lands
        on whatever is underneath it. */
    const onPointerDown = (e: PointerEvent) => {
      if (inside(e.target as Node)) return;
      onClose();
    };

    // Tabbing out should dismiss. Deferred because at keydown time focus has
    // not moved yet.
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (inside(document.activeElement)) return;
        onClose();
      });
    };

    /** Fixed positioning does not follow a scrolling ancestor, so the layer
        would drift away from its anchor. Capture, because it is an inner
        container that scrolls rather than the window. */
    const onScroll = (e: Event) => {
      // A layer that scrolls its own contents has not moved relative to its
      // anchor, so it must not dismiss itself. Only an ancestor scrolling
      // drifts it.
      if (inside(e.target as Node)) return;
      onClose();
    };

    const onReflow = () => onClose();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, onClose]);
};
