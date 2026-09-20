import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import type { Book, Note, StoryMark } from "../types";
import { COPY } from "../engine/copy";
import { notePath } from "../engine/routes";
import { readingTime } from "../utils/readingTime";
import { groupChapters, suggestStories } from "../utils/chapterNumbering";
import { BookIndex } from "./BookIndex";
import type { BookIndexChapter, BookIndexEditing } from "./BookIndex";
import { BookContentsPanel } from "./BookContentsPanel";
import "../styles/BookStage.css";

interface BookStageProps {
  book: Book;
  /**
   * The book's chapters, resolved in reading order. An entry is null where the
   * chapter's note no longer exists, which the caller cannot prevent because a
   * note can be deleted on disk outside the app.
   */
  chapters: (Note | null)[];
  onReorder: (chapterIds: string[]) => void;
  onRemoveChapter: (noteId: string) => void;
  onSetNumbered: (noteId: string, numbered: boolean) => void;
  /** Starts, renames or removes a story division at a chapter. */
  onSetStory: (noteId: string, title: string | null) => void;
  /** Replaces every story division at once, for accepting the book's offer. */
  onApplyStories: (stories: StoryMark[]) => void;
  onRename: (title: string) => void;
  /** The chapter to open at, or null to start at the front of the book. */
  resumeChapterId: string | null;
  /** Records the chapter being read, so the book can be resumed there. */
  onReadChapter: (chapterId: string) => void;
}

const titleOf = (note: Note): string => note.title.trim() || COPY.untitled;

/** Splits prose into paragraphs on blank lines and lets each one wrap. Single
    line breaks inside a paragraph are collapsed to spaces, which is what turns
    a note's soft-wrapped source into flowing prose rather than ragged lines. */
const proseParagraphs = (body: string): string[] =>
  body
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s*\n\s*/g, " ").trim())
    .filter((para) => para !== "");

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const chapterCount = (n: number): string =>
  n === 1 ? "1 chapter" : `${n} chapters`;

/**
 * The reading view for a book: the title, a contents page, then every chapter
 * in one continuous column flowing into the next. Bodies are already in memory,
 * so there is nothing to fetch and no loader; the continuous scroll is the
 * reading experience, not a data-loading strategy.
 */
export const BookStage = ({
  book,
  chapters,
  onReorder,
  onRemoveChapter,
  onSetNumbered,
  onSetStory,
  onApplyStories,
  onRename,
  resumeChapterId,
  onReadChapter,
}: BookStageProps) => {
  const bookTitle = book.title.trim() || COPY.untitledBook;

  const scrollRef = useRef<HTMLElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  // Whether the front matter has scrolled away. The running title in the
  // sticky bar is redundant while the real one is still on screen.
  const [titleShown, setTitleShown] = useState(false);

  const setChapterRef = useCallback(
    (id: string) =>
      (el: HTMLElement | null): void => {
        if (el) chapterRefs.current.set(id, el);
        else chapterRefs.current.delete(id);
      },
    [],
  );

  const handleJump = useCallback((id: string): void => {
    const el = chapterRefs.current.get(id);
    // jsdom has no scrollIntoView, and a future host might not either, so the
    // call is optional. Instant when motion is not wanted, so a jump does not
    // sweep the whole book past the reader.
    el?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const orderKey = book.chapterIds.join(",");

  /**
   * Marks the chapter being read so the contents can highlight it and the book
   * can be resumed there. Guarded because IntersectionObserver is absent in
   * jsdom and could be absent elsewhere; when it is missing the marker is
   * simply never set and nothing else breaks.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = [...chapterRefs.current.values()];
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.chapterId;
          if (id) {
            setCurrentChapterId(id);
            onReadChapter(id);
          }
        }
      },
      // A band across the middle of the pane, so the current chapter is the one
      // under the eye rather than the one just entering at the bottom.
      { rootMargin: "-40% 0px -55% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // orderKey changes whenever chapters are added, removed or reordered, so
    // the observer re-binds to the current set of chapter elements.
  }, [book.id, orderKey, onReadChapter]);

  /** Reveals the running title once the real one has gone off the top. */
  useEffect(() => {
    const front = frontRef.current;
    // Without an observer the title is shown rather than hidden: a permanently
    // missing running header is a worse failure than a redundant one.
    if (!front || typeof IntersectionObserver === "undefined") {
      setTitleShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setTitleShown(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(front);
    return () => observer.disconnect();
  }, [book.id]);

  /** How far through the whole book the reader is, for the rule in the bar. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const measure = (): void => {
      const travel = el.scrollHeight - el.clientHeight;
      // A book short enough to fit the pane has nowhere to travel, and
      // dividing by zero would leave the rule at NaN width.
      setProgress(travel <= 0 ? 0 : Math.min(1, el.scrollTop / travel));
    };
    const onScroll = (): void => {
      // Coalesced to one measurement per frame. Scroll fires far faster than
      // the rule can usefully be redrawn, and each one sets state.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [book.id, orderKey]);

  /**
   * Opens the book where reading stopped.
   *
   * Skipped when the remembered chapter is the first one, because jumping past
   * the title and contents to land on chapter one reads as the book having
   * lost its front matter rather than as being resumed.
   */
  const resumedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (resumedFor.current === book.id) return;
    resumedFor.current = book.id;
    if (!resumeChapterId) return;
    if (resumeChapterId === book.chapterIds[0]) return;
    /* A chapter removed while the app was closed simply is not among the
       rendered ones, so the lookup misses and the book opens at the front.
       There is deliberately no separate guard for that: it would be a second
       expression of the same rule, and the one that never runs is the one that
       rots. */
    chapterRefs.current
      .get(resumeChapterId)
      ?.scrollIntoView?.({ behavior: "auto", block: "start" });
  }, [book.id, book.chapterIds, resumeChapterId]);

  /* Numbering is worked out once for the whole book and shared by the
     contents and the reading column, so the two can never disagree about
     which chapter is chapter one. */
  const unnumbered = useMemo(
    () => new Set(book.unnumberedIds ?? []),
    [book.unnumberedIds],
  );
  const titled = book.chapterIds.map((id, i) => {
    const note = chapters[i];
    return { id, title: note ? titleOf(note) : "Missing chapter" };
  });

  const sections = groupChapters(titled, unnumbered, book.stories);

  /* Only offered to a book that has not been divided yet. Once the reader has
     said what the stories are, the titles are no longer a better guess than
     the answer already given. */
  const suggestedStories =
    (book.stories?.length ?? 0) === 0 ? suggestStories(titled) : [];

  /* Gathered once and shared by both copies of the contents, though only the
     one on the page takes it. */
  const editing: BookIndexEditing = {
    onReorder,
    onRemoveChapter,
    onSetNumbered,
    onSetStory,
    suggestedStories,
    onApplyStories,
  };

  const missing = new Set(
    book.chapterIds.filter((_, i) => chapters[i] === null),
  );

  /* Flat, even though the book is divided, because reordering works on
     positions across the whole book and a nested list would have to flatten
     itself again to do it. The divisions ride along as a name on each row. */
  const indexChapters: BookIndexChapter[] = sections.flatMap((section) =>
    section.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      number: c.number,
      story: section.title,
      missing: missing.has(c.id),
    })),
  );

  const isEmpty = book.chapterIds.length === 0;
  const minutes = chapters.reduce(
    (total, note) => total + (note ? readingTime(note.body) : 0),
    0,
  );

  return (
    <section
      className="book-stage scroll-fades"
      aria-label={bookTitle}
      ref={scrollRef}
    >
      <div className="book-stage__bar">
        {/* Decorative: the same information is in the contents, and a reader
            using a screen reader has no use for a fraction of a scrollbar. */}
        <div
          className="book-stage__progress"
          aria-hidden="true"
          style={{ transform: `scaleX(${progress})` }}
        />
        <span
          className={`book-stage__running${titleShown ? " book-stage__running--shown" : ""}`}
          aria-hidden="true"
        >
          {bookTitle}
        </span>
        {!isEmpty && (
          <button
            type="button"
            className="book-stage__contents-button"
            onClick={() => setContentsOpen(true)}
          >
            Contents
          </button>
        )}
      </div>

      <div className="book-stage__inner">
        <div className="book-stage__front" ref={frontRef}>
          <BookTitleField title={book.title} onRename={onRename} />
          {!isEmpty && (
            <p className="book-stage__meta">
              {chapterCount(book.chapterIds.length)}
              {minutes > 0 ? ` · ${minutes} min` : ""}
            </p>
          )}
        </div>

        {isEmpty ? (
          <p className="book-stage__empty">
            This book has no chapters yet. Add a note to it from the note's menu
            in the list.
          </p>
        ) : (
          <>
            <div className="book-stage__contents-page">
              <BookIndex
                chapters={indexChapters}
                currentChapterId={currentChapterId}
                onJump={handleJump}
                editing={editing}
              />
            </div>

            <div className="book-stage__chapters">
              {sections.map((section, si) => (
                <Fragment key={section.title === null ? "__none" : `s${si}`}>
                  {/* A story is announced once, above the chapter that opens
                      it. Chapters standing outside any story get nothing, so
                      a book that is not an anthology reads exactly as it did
                      before stories existed. */}
                  {section.title !== null && (
                    <div
                      className={
                        si === 0 ? "book-story book-story--first" : "book-story"
                      }
                    >
                      <h3 className="book-story__title">{section.title}</h3>
                    </div>
                  )}
                  {section.chapters.map(({ id, number, title }, ci) => {
                    const i = book.chapterIds.indexOf(id);
                    const note = chapters[i];
                    /* The grey line carries the number when there is one, and the
                   chapter's own name when there is not. A prologue says
                   PROLOGUE and stops; it does not say "Chapter 1", which is
                   the number it must not take, nor repeat its name twice. */
                    const eyebrow =
                      number === null ? title : `Chapter ${number}`;
                    /* Empty when the chapter had no title beyond its number, in
                   which case the grey line is the whole heading. */
                    const display = number === null ? "" : title;

                    return (
                      <article
                        key={id}
                        className={
                          note
                            ? "book-chapter"
                            : "book-chapter book-chapter--missing"
                        }
                        data-chapter-id={id}
                        ref={setChapterRef(id)}
                      >
                        {/* Between chapters, never above the first: the ornament
                        is a join, and one at the top would divide the opening
                        chapter from the contents it already follows. */}
                        {ci > 0 && (
                          <div
                            className="book-chapter__ornament"
                            aria-hidden="true"
                          >
                            <span className="book-chapter__ornament-mark" />
                          </div>
                        )}

                        <h3 className="book-chapter__heading">
                          {!note ? (
                            <>
                              <span className="book-chapter__number">
                                {eyebrow}
                              </span>{" "}
                              <span className="book-chapter__title book-chapter__title--missing">
                                Missing chapter
                              </span>
                            </>
                          ) : display ? (
                            <>
                              <span className="book-chapter__number">
                                {eyebrow}
                              </span>{" "}
                              {/* The title is the way into the note. It replaced a
                              pair of buttons under every chapter, which on a
                              book of any length turned the reading column into
                              a column of controls. */}
                              <Link
                                className="book-chapter__title"
                                to={notePath(id)}
                              >
                                {display}
                              </Link>
                            </>
                          ) : (
                            /* Nothing but the grey line to show, so the grey line
                           has to be the way into the note. Leaving it as plain
                           text would strand the chapter with no route back to
                           what it is made of. */
                            <Link
                              className="book-chapter__number book-chapter__number--sole"
                              to={notePath(id)}
                            >
                              {eyebrow}
                            </Link>
                          )}
                        </h3>

                        {!note && (
                          <p className="book-chapter__missing">
                            This chapter's note was deleted or moved. Remove it
                            from the contents to tidy the book.
                          </p>
                        )}

                        {note &&
                          ((note.format ?? "prose") === "verse" ? (
                            // pre-wrap keeps the line breaks the poem was written
                            // with. Rendering it as prose paragraphs would fuse the
                            // lines and destroy the shape of the verse.
                            <div className="book-chapter__body book-chapter__body--verse">
                              {note.body}
                            </div>
                          ) : (
                            <div className="book-chapter__body">
                              {proseParagraphs(note.body).map((para, p) => (
                                <p key={p} className="book-chapter__paragraph">
                                  {para}
                                </p>
                              ))}
                            </div>
                          ))}
                      </article>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      <BookContentsPanel
        open={contentsOpen}
        chapters={indexChapters}
        currentChapterId={currentChapterId}
        onClose={() => setContentsOpen(false)}
        onJump={handleJump}
      />
    </section>
  );
};

interface BookTitleFieldProps {
  title: string;
  onRename: (title: string) => void;
}

/**
 * The book's title, editable in place.
 *
 * It holds its own draft and reports on blur and on Enter rather than on every
 * keystroke, because each rename writes the book's file: committing per
 * keystroke would put a dozen writes on disk for one retitling. The draft is
 * flushed on unmount too, so navigating away mid-edit does not lose the change.
 */
const BookTitleField = ({ title, onRename }: BookTitleFieldProps) => {
  const [draft, setDraft] = useState(title);

  // Follows the title when it changes from somewhere else, but not while this
  // field is the thing being typed into.
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(title);
  }, [title]);

  const latest = useRef({ draft, title, onRename });
  latest.current = { draft, title, onRename };

  /* Escape has to cancel the pending save, not just reset the field. Blurring
     runs the commit before React has re-rendered with the restored title, so
     without this flag the abandoned draft is exactly what gets written. */
  const abandoned = useRef(false);

  const commit = useCallback((): void => {
    if (abandoned.current) {
      abandoned.current = false;
      return;
    }
    const { draft: value, title: current, onRename: rename } = latest.current;
    const trimmed = value.trim();
    // An empty title is a request to clear it, and the view falls back to
    // "Untitled book" on its own, so only a no-op change is skipped here.
    if (trimmed === current.trim()) return;
    rename(trimmed);
  }, []);

  useEffect(() => commit, [commit]);

  return (
    <input
      className="book-stage__title"
      aria-label="Book title"
      placeholder={COPY.untitledBook}
      value={draft}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          abandoned.current = true;
          setDraft(title);
          editing.current = false;
          e.currentTarget.blur();
        }
      }}
    />
  );
};
