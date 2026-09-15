import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { formatRelative } from "../utils/formatRelative";
import { previewFromBody } from "../utils/previewFromBody";
import "../styles/NoteSearchModal.css";

interface NoteSearchModalProps {
  open: boolean;
  notes: Note[];
  selectedNoteId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const matches = (note: Note, query: string): boolean => {
  const title = note.title.toLowerCase();
  const body = note.body.toLowerCase();
  const tags = note.tags.join(" ").toLowerCase();
  return title.includes(query) || body.includes(query) || tags.includes(query);
};

export const NoteSearchModal = ({
  open,
  notes,
  selectedNoteId,
  onSelect,
  onClose,
}: NoteSearchModalProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  /**
   * An empty query lists every note rather than nothing, so the modal doubles
   * as a full note picker and not only a search box.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => matches(note, q));
  }, [notes, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  // A shrinking result set must never leave the highlight past the last row.
  useEffect(() => {
    setActiveIndex((current) =>
      current > results.length - 1 ? 0 : Math.max(0, current),
    );
  }, [results.length]);

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

  const choose = useCallback(
    (id: string) => {
      onSelect(id);
      onClose();
    },
    [onSelect, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const note = results[activeIndex];
      if (note) choose(note.id);
    }
  };

  return createPortal(
    <div
      className="note-search__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="note-search"
      >
        <h2 id={titleId} className="sr-only">
          Search notes
        </h2>

        <div className="note-search__input-row">
          <svg
            className="note-search__icon"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="7.2"
              cy="7.2"
              r="4.2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10.4 10.4 13.5 13.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="note-search__input"
            placeholder="Search notes"
            aria-label="Search notes"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0 ? optionId(activeIndex) : undefined
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
        </div>

        <p className="sr-only" role="status">
          {results.length === 1 ? "1 note" : `${results.length} notes`}
        </p>

        {results.length === 0 ? (
          <div className="note-search__empty">
            <p className="note-search__empty-title">
              {notes.length === 0 ? "No notes yet" : "No matches"}
            </p>
            <p className="note-search__empty-body">
              {notes.length === 0
                ? COPY.emptyNotesSidebar
                : "Try a different search."}
            </p>
          </div>
        ) : (
          <ul className="note-search__list" id={listId} role="listbox">
            {results.map((note, index) => (
              <li
                key={note.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={`note-search__option${
                  index === activeIndex ? " note-search__option--active" : ""
                }${note.id === selectedNoteId ? " note-search__option--current" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(note.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="note-search__option-main">
                  <span className="note-search__option-title">
                    {note.title.trim() || COPY.untitled}
                  </span>
                  {note.id === selectedNoteId && (
                    <span className="note-search__current-badge">Open</span>
                  )}
                  <time
                    className="note-search__option-date"
                    dateTime={note.updatedAt}
                  >
                    {formatRelative(note.updatedAt)}
                  </time>
                </span>
                {previewFromBody(note.body) && (
                  <span className="note-search__option-preview">
                    {previewFromBody(note.body)}
                  </span>
                )}
                {note.tags.length > 0 && (
                  <span className="note-search__tag-list">
                    {note.tags.map((tag) => (
                      <span key={tag} className="note-search__tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="note-search__footer" aria-hidden="true">
          <span className="note-search__hint">
            <kbd>↑↓</kbd> Navigate
          </span>
          <span className="note-search__hint">
            <kbd>↵</kbd> Open
          </span>
          <span className="note-search__hint">
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
};
