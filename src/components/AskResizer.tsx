import { useCallback, useEffect, useRef } from "react";
import { COPY } from "../engine/copy";
import { MAX_WIDTH, MIN_WIDTH, clampWidth } from "../hooks/useAskPane";
import "../styles/AskResizer.css";

interface AskResizerProps {
  width: number;
  onWidth: (width: number) => void;
  /** The pane being sized, so the separator says what it controls. */
  controls: string;
}

/** One press of an arrow key. Small enough to aim, large enough to get there. */
const STEP = 16;
/** Shift makes it a coarse move, for crossing the range without holding a key. */
const COARSE_STEP = 64;

/**
 * The drag handle between the note and the pane.
 *
 * A separator rather than a button: it has a value, a range, and an
 * orientation, and screen readers can announce the width as it changes. That
 * also makes the keyboard story fall out for free, which matters because a
 * drag handle with no keyboard equivalent is a control some people simply
 * cannot use.
 *
 * The pane grows leftward, so a smaller x means a wider pane. The arrow keys
 * follow the pane rather than the pointer: Left widens, Right narrows, which
 * is what "make the pane bigger" means to someone looking at it.
 */
export const AskResizer = ({ width, onWidth, controls }: AskResizerProps) => {
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      /* Measured from the right edge of the window, because that is the edge
         the pane is pinned to. Using a delta from the grab point instead would
         drift whenever the clamp bit. */
      onWidth(clampWidth(window.innerWidth - e.clientX));
    },
    [onWidth],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  /* While dragging, the pointer regularly leaves the 5px handle. Without this
     the whole window would be selecting text under the cursor the entire time. */
  useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? COARSE_STEP : STEP;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onWidth(width + step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onWidth(width - step);
      } else if (e.key === "Home") {
        e.preventDefault();
        onWidth(MIN_WIDTH);
      } else if (e.key === "End") {
        e.preventDefault();
        onWidth(MAX_WIDTH);
      }
    },
    [onWidth, width],
  );

  return (
    <div
      className="ask-resizer"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={COPY.askResize}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
};
