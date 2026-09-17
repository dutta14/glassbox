import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useScrollFades } from "../hooks/useScrollFades";
import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { readingTime } from "../utils/readingTime";
import { NoteNav } from "./NoteNav";
import "../styles/NoteEditor.css";

interface NoteEditorProps {
  note: Note;
  scrollToOffset: number | null;
  previousNote: Note | null;
  nextNote: Note | null;
  onChangeTitle: (title: string) => void;
  onChangeBody: (body: string) => void;
  onScrollHandled: () => void;
  onSelectNote: (id: string) => void;
}

const formatEdited = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Matches .editor__body's line-height, as a floor if the computed value is
    unreadable. */
const FALLBACK_LINE_HEIGHT = 31.5;

export const NoteEditor = ({
  note,
  scrollToOffset,
  previousNote,
  nextNote,
  onChangeTitle,
  onChangeBody,
  onScrollHandled,
  onSelectNote,
}: NoteEditorProps) => {
  const scrollRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const wasEmptyOnMountRef = useRef<string | null>(null);

  // One scroller, not two. The body grows to fit its text rather than scrolling
  // inside itself, so the note reads as a single document and the navigation at
  // its foot is reached by scrolling past the writing, the way it is under a
  // blog post.
  useScrollFades(scrollRef, [note.id, note.body]);

  /**
   * Collapses first, because scrollHeight can only grow while the old height is
   * still applied.
   *
   * That collapse is momentarily destructive: for the length of it the section
   * has far less to scroll, so the browser clamps scrollTop to the new maximum
   * and does not put it back when the height returns. Typing near the foot of a
   * long note would jump the view upward and take the caret off screen with it.
   * The position is therefore saved and restored around the measurement. By the
   * time this runs the browser has already scrolled to reveal the caret, so the
   * saved value is the one that keeps it in sight.
   */
  const fitToContent = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const scroller = scrollRef.current;
    const restore = scroller?.scrollTop;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (scroller && restore !== undefined && scroller.scrollTop !== restore) {
      scroller.scrollTop = restore;
    }
  }, []);

  useLayoutEffect(fitToContent, [fitToContent, note.body, note.id]);

  // Width changes reflow the text, which changes how many lines it needs. The
  // section is observed rather than the textarea, since resizing the textarea
  // is what this callback does and observing it would feed itself.
  useEffect(() => {
    const section = scrollRef.current;
    if (!section || typeof ResizeObserver === "undefined") return;
    let lastWidth = section.clientWidth;
    const observer = new ResizeObserver(() => {
      if (section.clientWidth === lastWidth) return;
      lastWidth = section.clientWidth;
      fitToContent();
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [fitToContent]);

  useLayoutEffect(() => {
    if (
      note.title === "" &&
      note.body === "" &&
      wasEmptyOnMountRef.current !== note.id
    ) {
      wasEmptyOnMountRef.current = note.id;
      titleRef.current?.focus();
    }
  }, [note.id, note.title, note.body]);

  // Switching notes starts you at the top of the new one. Without this a click
  // on the navigation at the foot of a long note lands you the same distance
  // down its neighbour, halfway through a sentence you have not read. Skipped
  // when a citation is steering, since that effect sets its own position.
  useLayoutEffect(() => {
    if (scrollToOffset !== null) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useLayoutEffect(() => {
    if (scrollToOffset === null) return;
    const el = bodyRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    el.focus();
    const clamped = Math.min(Math.max(0, scrollToOffset), note.body.length);
    el.setSelectionRange(clamped, clamped);

    // The textarea no longer scrolls, so the section is moved instead. Measured
    // rather than read off offsetTop, which would be wrong the moment anything
    // between the two gained a position.
    const lineHeight =
      parseFloat(getComputedStyle(el).lineHeight) || FALLBACK_LINE_HEIGHT;
    const linesBefore = note.body.slice(0, clamped).split("\n").length;
    const bodyTop =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    // Three lines of lead-in, so the passage lands inside its context rather
    // than flush against the top edge.
    scroller.scrollTop = Math.max(0, bodyTop + (linesBefore - 3) * lineHeight);
    onScrollHandled();
  }, [scrollToOffset, note.body, onScrollHandled]);

  return (
    <section
      id="editor-panel"
      aria-label="Note editor"
      className="editor scroll-fades"
      ref={scrollRef}
    >
      <h2 className="sr-only">Editor</h2>
      <div className="editor__inner">
        <input
          ref={titleRef}
          className="editor__title"
          aria-label="Note title"
          placeholder={COPY.placeholderTitle}
          value={note.title}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
        <p className="editor__edited">
          Edited{" "}
          <time dateTime={note.updatedAt}>{formatEdited(note.updatedAt)}</time>
          <span className="editor__meta-separator" aria-hidden="true">
            {" · "}
          </span>
          <span className="editor__reading-time">
            {readingTime(note.body)} min read
          </span>
        </p>
        {note.tags.length > 0 && (
          <div className="editor__tags" role="group" aria-label="Tags">
            {note.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={bodyRef}
          className="editor__body"
          aria-label="Note body"
          placeholder={COPY.placeholderBody}
          value={note.body}
          onChange={(e) => onChangeBody(e.target.value)}
        />
        <NoteNav
          previous={previousNote}
          next={nextNote}
          onSelect={onSelectNote}
        />
      </div>
    </section>
  );
};
