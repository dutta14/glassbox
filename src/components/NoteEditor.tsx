import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useScrollFades } from "../hooks/useScrollFades";
import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { readingTime } from "../utils/readingTime";
import { dropCapDepth } from "../utils/dropCap";
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
  // The year is always carried. Notes here go back well over a decade, and a
  // bare "Dec 28" on something written in 2010 reads as though it were written
  // last winter.
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/** Matches .editor__body's line-height, as a floor if the computed value is
    unreadable. */
const FALLBACK_LINE_HEIGHT = 31.5;

/**
 * Where in the text a click landed. The reading view holds the body as a
 * single text node, so the offset within that node is the offset within the
 * note, and the caret can be put exactly where the reader pointed rather than
 * at the end of the note.
 *
 * Two spellings because the standard one is recent and the WebKit one is what
 * older engines shipped. Returning null when neither is available is fine: the
 * caller falls back to the end of the text.
 */
const caretOffsetFromPoint = (
  x: number,
  y: number,
  root: HTMLElement
): number | null => {
  const doc = root.ownerDocument;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos && root.contains(pos.offsetNode)) return pos.offset;
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && root.contains(range.startContainer)) return range.startOffset;
  return null;
};

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
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const readRef = useRef<HTMLDivElement>(null);
  const wasEmptyOnMountRef = useRef<string | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  /**
   * A drop cap cannot be drawn on a textarea. ::first-letter matches one and is
   * then silently ignored, and getComputedStyle happily reports the styles it
   * did not apply, so the only way to see it is to render.
   *
   * So the note is read as prose and typed into as a field. The field stays
   * mounted underneath the whole time rather than being swapped in on demand:
   * it keeps the accessible name, the value and the caret in one place, so
   * assistive technology sees an ordinary textarea throughout and none of the
   * focus juggling a swap would need can go wrong.
   */
  const [editing, setEditing] = useState(false);
  const [verseWidth, setVerseWidth] = useState<number>();
  const [fontsReady, setFontsReady] = useState(false);

  // A poem is set as it was written. The capital that opens a chapter would
  // indent the first three lines of it out of shape, so verse never takes one.
  const verse = (note.format ?? "prose") === "verse";

  // One scroller, not two. The body grows to fit its text rather than scrolling
  // inside itself, so the note reads as a single document and the navigation at
  // its foot is reached by scrolling past the writing, the way it is under a
  // blog post.
  useScrollFades(scrollRef, [note.id, note.body, editing]);

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
  // Both fields, because the title wraps too. It has to be a textarea to be
  // centred at all: an input cannot wrap, so a long title scrolled sideways
  // and sat hard against the left edge, which is the one thing a centred
  // chapter heading must not do.
  const fitToContent = useCallback(() => {
    const scroller = scrollRef.current;
    const restore = scroller?.scrollTop;
    for (const el of [titleRef.current, bodyRef.current]) {
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    if (scroller && restore !== undefined && scroller.scrollTop !== restore) {
      scroller.scrollTop = restore;
    }
  }, []);

  useLayoutEffect(fitToContent, [
    fitToContent,
    note.body,
    note.title,
    note.id,
  ]);

  /**
   * A title is one line. An input enforced that for free; a textarea does not,
   * so both ways of getting a newline in are closed here. It matters beyond
   * looks: the title is written to the note's front matter as `title: ...`,
   * where a newline would break the file.
   */
  const handleTitleChange = (value: string) =>
    onChangeTitle(value.replace(/\s*\n+\s*/g, " "));

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    bodyRef.current?.focus();
  };

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
    setEditing(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  /* Measured once the serif has actually loaded. Measuring before it does
     reports the fallback font's wider metrics, and that stale number then sets
     the width of the field for the life of the note. */
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  /* The width of the poem's longest line, taken from the reading view, which
     is laid out at max-content and so is exactly that wide. Only the field
     needs it. While editing there is no reading view to measure, so the last
     value stands and the lines do not shuffle under the caret as you type. */
  useLayoutEffect(() => {
    if (!verse) {
      setVerseWidth(undefined);
      return;
    }
    const read = readRef.current;
    if (!read) return;
    setVerseWidth(read.getBoundingClientRect().width);
  }, [verse, note.body, note.id, editing, fontsReady]);

  /* Runs after the swap, because setSelectionRange on a field that is still
     hidden and unsized does not survive it being laid out. */
  useLayoutEffect(() => {
    if (!editing) return;
    const field = bodyRef.current;
    const at = pendingCaretRef.current;
    if (!field || at === null) return;
    pendingCaretRef.current = null;
    const clamped = Math.min(Math.max(0, at), note.body.length);
    field.setSelectionRange(clamped, clamped);
    fitToContent();
  }, [editing, note.body.length, fitToContent]);

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

  const isEmpty = note.body === "";
  // 0 when the note is too short to carry one; otherwise the number of lines
  // the capital sinks, which is also the value the stylesheet keys on.
  const cap = verse ? 0 : dropCapDepth(note.body);

  /**
   * Puts the caret where the reader actually pointed. Without this, moving from
   * reading to writing would drop you at one fixed place in the note and you
   * would have to find your way back to the sentence you meant to change.
   *
   * preventDefault stops the div taking focus, so the only thing that ever
   * holds it is the field.
   */
  const handleReadMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const root = readRef.current;
      const field = bodyRef.current;
      if (!root || !field) return;
      e.preventDefault();
      pendingCaretRef.current =
        caretOffsetFromPoint(e.clientX, e.clientY, root) ?? note.body.length;
      field.focus();
    },
    [note.body.length]
  );

  return (
    <section
      id="editor-panel"
      aria-label="Note editor"
      className="editor scroll-fades"
      ref={scrollRef}
    >
      <h2 className="sr-only">Editor</h2>
      <div className="editor__inner">
        <textarea
          ref={titleRef}
          className="editor__title"
          aria-label="Note title"
          rows={1}
          placeholder={COPY.placeholderTitle}
          value={note.title}
          onKeyDown={handleTitleKeyDown}
          onChange={(e) => handleTitleChange(e.target.value)}
        />
        {/* A chapter rule. Decorative only, so it is kept out of the
            accessibility tree: there is nothing here to announce. */}
        <div className="editor__ornament" aria-hidden="true">
          <span className="editor__ornament-mark" />
        </div>
        <div
          className={`editor__bodywrap${verse ? " editor__bodywrap--verse" : ""}`}
        >
          {!editing && (
            /* Hidden from assistive technology on purpose. It is a second copy
               of text the field below already exposes, and a screen reader
               meeting both would hear the note twice. Sighted readers get the
               prose, everyone else gets the textarea, and neither knows about
               the other. */
            <div
              ref={readRef}
              aria-hidden="true"
              className={`editor__body editor__read${
                isEmpty ? " editor__read--empty" : ""
              }`}
              data-dropcap={cap === 0 ? undefined : String(cap)}
              onMouseDown={handleReadMouseDown}
            >
              {isEmpty ? COPY.placeholderBody : note.body}
            </div>
          )}
          <textarea
            ref={bodyRef}
            className="editor__body"
            /* The reading view centres itself on its longest line without any
               help. A textarea cannot: it has no max-content width to take. So
               it is given the width the reading view worked out, which is what
               keeps the poem from jumping sideways the moment it is clicked. */
            style={
              verse && verseWidth !== undefined ? { width: verseWidth } : undefined
            }
            data-editing={editing ? "on" : undefined}
            aria-label="Note body"
            placeholder={COPY.placeholderBody}
            value={note.body}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={(e) => onChangeBody(e.target.value)}
          />
        </div>
        {/* A chapter opens with its title and nothing else, so when the note
            was edited and what it is tagged with are held back to the foot.
            They are still the first thing after the prose ends, just no longer
            standing between the title and the first line. */}
        <footer className="editor__colophon">
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
        </footer>
        <NoteNav
          previous={previousNote}
          next={nextNote}
          onSelect={onSelectNote}
        />
      </div>
    </section>
  );
};
