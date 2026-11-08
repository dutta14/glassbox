import type { MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useScrollFades } from "../hooks/useScrollFades";
import type { Book, Note } from "../types";
import { COPY } from "../engine/copy";
import { bookPath } from "../engine/routes";
import { readingTime } from "../utils/readingTime";
import { dropCapDepth } from "../utils/dropCap";
import { leadingImage } from "../utils/noteImage";
import { splitSectionBreaks } from "../utils/sectionBreaks";
import { NoteImage } from "./NoteImage";
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
  readAsset: (path: string) => Promise<Blob | null>;
  /** The book holding this note. Null for the great majority of notes. */
  book?: Book | null;
}

/**
 * How far right a block of verse has to move to look centred.
 *
 * Centring the block on its bounding box puts the middle of the *longest* line
 * on the page's axis. Every shorter line then stops well before that right
 * edge, so the weight of the text collects on the left and the poem reads as
 * though it has slipped sideways, even though a ruler says it has not. The eye
 * centres on the average line, not the longest one, so the block is nudged by
 * half the gap between the two.
 *
 * It is self-limiting: a poem whose lines are all about the same length has an
 * average near its longest and barely moves, which is right, because a squared
 * off block needs no correction.
 */
const verseOpticalShift = (read: HTMLElement, columnWidth: number): number => {
  const node = read.firstChild;
  if (node === null || node.nodeType !== Node.TEXT_NODE) return 0;
  // Range measurement is not universal; jsdom has no getClientRects at all.
  // The shift is a refinement on top of an already correct layout, so when it
  // cannot be measured the honest answer is to leave the poem where it is
  // rather than to guess or to throw and take the editor down with it.
  if (typeof document.createRange().getClientRects !== "function") return 0;
  const text = node.textContent ?? "";

  const widths: number[] = [];
  let at = 0;
  for (const line of text.split("\n")) {
    if (line.trim() !== "") {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + line.length);
      // Per rect rather than the union, so a line long enough to wrap counts as
      // the two lines it is drawn as and does not report the whole column.
      for (const rect of range.getClientRects()) widths.push(rect.width);
    }
    at += line.length + 1;
  }
  if (widths.length === 0) return 0;

  const longest = Math.max(...widths);
  const mean = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  // Never past the point where the longest line would leave the column.
  const room = Math.max(0, (columnWidth - longest) / 2);
  return Math.min((longest - mean) / 2, room);
};

const formatWritten = (iso: string): string => {
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
 * Where in the text a click landed. The reading view holds the body as text
 * nodes, each carrying the offset it starts at in the note, so the offset
 * within a node plus that base is the offset within the note, and the caret
 * can be put exactly where the reader pointed rather than at the end.
 *
 * Two spellings because the standard one is recent and the WebKit one is what
 * older engines shipped. Returning null when neither is available is fine: the
 * caller falls back to the end of the text.
 */
const caretOffsetFromPoint = (
  x: number,
  y: number,
  root: HTMLElement,
): number | null => {
  const doc = root.ownerDocument;
  const hit: { node: Node; offset: number } | null = (() => {
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
    return null;
  })();
  if (!hit || !root.contains(hit.node)) return null;

  const marked = (node: Node | null): HTMLElement | null => {
    const el =
      node instanceof HTMLElement ? node : (node?.parentElement ?? null);
    return el?.closest<HTMLElement>("[data-offset]") ?? null;
  };
  const owner = marked(hit.node);
  if (owner && root.contains(owner)) {
    const base = Number(owner.dataset.offset);
    // A break is drawn, not typed, so a click on it lands at its start.
    return hit.node.nodeType === Node.TEXT_NODE && !owner.dataset.break
      ? base + hit.offset
      : base;
  }
  // Landed on the container itself: the offset is a child index.
  if (hit.node === root) {
    const child = root.childNodes[hit.offset];
    const el = child instanceof HTMLElement ? child : null;
    return el?.dataset.offset !== undefined ? Number(el.dataset.offset) : null;
  }
  return hit.node.nodeType === Node.TEXT_NODE ? hit.offset : null;
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
  readAsset,
  book = null,
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
  const [verseShift, setVerseShift] = useState(0);
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

  useLayoutEffect(fitToContent, [fitToContent, note.body, note.title, note.id]);

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
      setVerseShift(0);
      return;
    }
    const read = readRef.current;
    if (!read) return;
    setVerseWidth(read.getBoundingClientRect().width);
    const column =
      read.parentElement?.parentElement?.getBoundingClientRect().width;
    setVerseShift(
      verseOpticalShift(read, column ?? read.getBoundingClientRect().width),
    );
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

  /* A picture that opens the note is shown as a picture and held out of the
     reading view, so the note does not also print its own source line. The
     field underneath is untouched and still holds the whole note, Markdown
     and all, because the file is the thing being edited. */
  const image = leadingImage(note.body);
  const readOffset = image ? image.bodyOffset : 0;
  const readBody = note.body.slice(readOffset);

  // 0 when the note is too short to carry one; otherwise the number of lines
  // the capital sinks, which is also the value the stylesheet keys on.
  // Measured on what is actually shown: a sketch note's first words are its
  // prose, not the image line that no longer appears above them.
  const cap = verse ? 0 : dropCapDepth(readBody);

  // A poem is set as it was written, so only prose gets its section breaks
  // drawn. With none in the note the reading view stays a single text node.
  const segments = useMemo(
    () => (verse || isEmpty ? [] : splitSectionBreaks(readBody)),
    [verse, isEmpty, readBody],
  );
  const hasBreaks = segments.some((seg) => seg.kind === "break");

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
      /* Offsets come back relative to the text on screen, which starts after
         any picture lifted off the top. Adding that back is what keeps a
         click landing on the word it was aimed at rather than that many
         characters earlier in the note. */
      const at = caretOffsetFromPoint(e.clientX, e.clientY, root);
      pendingCaretRef.current =
        at === null ? note.body.length : at + readOffset;
      field.focus();
    },
    [note.body.length, readOffset],
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
        {/* Placed above the rule rather than below it, because it says where
            this note sits rather than anything about the writing that follows.
            A real link and not a button: this is a navigation, so it should
            survive a middle click and be copyable as an address. */}
        {book && (
          <p className="editor__from-book">
            {"In the Book - "}
            <Link className="editor__from-book-link" to={bookPath(book.id)}>
              {book.title.trim() || COPY.untitledBook}
            </Link>
          </p>
        )}

        {/* A chapter rule. Decorative only, so it is kept out of the
            accessibility tree: there is nothing here to announce. */}
        <div className="editor__ornament" aria-hidden="true">
          <span className="editor__ornament-mark" />
        </div>
        {image && (
          <NoteImage src={image.src} alt={image.alt} readAsset={readAsset} />
        )}
        <div
          className={`editor__bodywrap${verse ? " editor__bodywrap--verse" : ""}`}
          /* Moves the reading view and the field together, so the poem is
             optically centred whether it is being read or written. */
          style={
            verse && verseShift > 0
              ? { transform: `translateX(${verseShift}px)` }
              : undefined
          }
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
              {isEmpty
                ? COPY.placeholderBody
                : hasBreaks
                  ? segments.map((seg) =>
                      seg.kind === "text" ? (
                        <span key={seg.start} data-offset={seg.start}>
                          {seg.text}
                        </span>
                      ) : (
                        <span
                          key={seg.start}
                          className={`editor__break${
                            seg.opening ? " editor__break--opening" : ""
                          }`}
                          data-offset={seg.start}
                          data-break="true"
                        >
                          <span className="editor__break-number">
                            {seg.number}
                          </span>
                        </span>
                      ),
                    )
                  : readBody}
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
              verse && verseWidth !== undefined
                ? { width: verseWidth }
                : undefined
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
            was written and what it is tagged with are held back to the foot.
            They are still the first thing after the prose ends, just no longer
            standing between the title and the first line.

            The date is createdAt, not updatedAt. A poem from 2011 belongs to
            2011, and correcting a typo in it this afternoon does not make it a
            poem from this afternoon. The rail orders on createdAt for the same
            reason, so the foot of the note now agrees with the list it came
            from. */}
        <footer className="editor__colophon">
          <p className="editor__written">
            Written{" "}
            <time dateTime={note.createdAt}>
              {formatWritten(note.createdAt)}
            </time>
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
