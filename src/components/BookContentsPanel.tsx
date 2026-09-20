import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { BookIndex } from "./BookIndex";
import type { BookIndexChapter } from "./BookIndex";
import "../styles/BookContentsPanel.css";

interface BookContentsPanelProps {
  open: boolean;
  chapters: BookIndexChapter[];
  currentChapterId: string | null;
  onClose: () => void;
  onReorder: (chapterIds: string[]) => void;
  onJump: (chapterId: string) => void;
  onRemoveChapter: (chapterId: string) => void;
  onSetNumbered: (chapterId: string, numbered: boolean) => void;
  onSetStory: (chapterId: string, title: string | null) => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The contents, reachable from anywhere in the book.
 *
 * The book already opens onto a contents page, but that page scrolls away as
 * soon as reading starts, which left the one control for jumping between
 * chapters unreachable from the place a reader actually wants it. This holds
 * the same index and can be opened at any depth.
 *
 * It is a sheet down the side rather than a box in the middle because a long
 * book has a long contents, and a centred dialog would either scroll inside
 * itself or cover the page it is meant to be navigating.
 */
export const BookContentsPanel = ({
  open,
  chapters,
  currentChapterId,
  onClose,
  onReorder,
  onJump,
  onRemoveChapter,
  onSetNumbered,
  onSetStory,
}: BookContentsPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Where focus was before the sheet opened, so closing returns the keyboard
  // to the control that opened it instead of the top of the document.
  const restoreRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const root = panelRef.current;
    if (root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      focusables[0]?.focus();
    }
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    if (!root) return;
    const hadInert = root.hasAttribute("inert");
    root.setAttribute("inert", "");
    return () => {
      if (!hadInert) root.removeAttribute("inert");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* Captured at the document so this runs ahead of the bubble-phase
           handlers underneath, which is the only point at which stopping does
           anything: by the time a window listener sees the key, everything
           else has already acted on it. */
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("inert"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="book-contents__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="book-contents"
      >
        <button
          type="button"
          className="book-contents__close"
          onClick={onClose}
        >
          Close
        </button>
        <div className="book-contents__body">
          <BookIndex
            chapters={chapters}
            currentChapterId={currentChapterId}
            onReorder={onReorder}
            onRemoveChapter={onRemoveChapter}
            onSetNumbered={onSetNumbered}
            onSetStory={onSetStory}
            headingId={headingId}
            /* Closing on jump is the whole point of the sheet: it is a way
               through to a chapter, so leaving it open would cover the place
               the reader just asked to be taken to. Reordering does not close,
               because that is work done on the list itself. */
            onJump={(id) => {
              onJump(id);
              onClose();
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};
