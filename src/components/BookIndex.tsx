import { useLayoutEffect, useRef, useState } from "react";
import type { StoryMark } from "../types";
import "../styles/BookIndex.css";

export interface BookIndexChapter {
  /** The note id. Stays valid even when the note itself is gone. */
  id: string;
  /**
   * Title as it should be shown, with any number the author wrote into it
   * already removed. Empty when the chapter has no title beyond its number.
   */
  title: string;
  /** Position among the numbered chapters, or null for front matter. */
  number: number | null;
  /** The story this chapter belongs to, or null when it stands outside one. */
  story: string | null;
  missing: boolean;
}

/**
 * What the row should read. A chapter whose whole title was its number has
 * nothing left once the number is lifted out, so it borrows the number back
 * here. The reading column can drop to a single grey line in that case; a
 * contents cannot, because a column of bare digits names nothing.
 */
const displayTitleOf = (chapter: BookIndexChapter): string =>
  chapter.title || (chapter.number === null ? "" : `Chapter ${chapter.number}`);

/** Something to call a chapter in a label, whatever it is short of. */
const nameOf = (chapter: BookIndexChapter): string =>
  displayTitleOf(chapter) || "this chapter";

interface BookIndexProps {
  chapters: BookIndexChapter[];
  /** The chapter currently in view, so it can be marked. Null when unknown. */
  currentChapterId: string | null;
  /** Emits the full id list in its new order. */
  onReorder: (chapterIds: string[]) => void;
  /** Scrolls the matching chapter into view in the stage. */
  onJump: (chapterId: string) => void;
  /** Takes a chapter out of the book. The note itself is untouched. */
  onRemoveChapter: (chapterId: string) => void;
  /** Moves a chapter into or out of the numbering. */
  onSetNumbered: (chapterId: string, numbered: boolean) => void;
  /**
   * Starts a story at this chapter under the given name, renames the one
   * already starting here, or with null takes the division away.
   */
  onSetStory: (chapterId: string, title: string | null) => void;
  /**
   * The stories the book has read out of the chapter titles, and the way to
   * accept them. Empty when there is nothing to propose.
   */
  suggestedStories?: StoryMark[];
  onApplyStories?: (stories: StoryMark[]) => void;
  /* Set only when something outside needs to name itself after this heading.
     Left undefined on the page copy so that two mounted indexes, the one at
     the front of the book and the one in the panel, cannot collide on an id. */
  headingId?: string;
}

/** -1 moves a chapter earlier, +1 later. */
type Direction = -1 | 1;

const keyFor = (id: string, dir: Direction): string => `${id}:${dir}`;

/**
 * The book's table of contents, doing two jobs: jump to a chapter and reorder
 * the chapters. Reorder is driven by buttons rather than drag alone, because a
 * drag-only control cannot be operated without a pointer and would lock out
 * keyboard and switch users entirely.
 */
export const BookIndex = ({
  chapters,
  currentChapterId,
  onReorder,
  onJump,
  onRemoveChapter,
  onSetNumbered,
  onSetStory,
  suggestedStories = [],
  onApplyStories,
  headingId,
}: BookIndexProps) => {
  /* Which row is having its story named. Held here rather than in each row so
     that opening a second field closes the first, which stops two half-typed
     names being in play at once. */
  const [naming, setNaming] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  /**
   * Which button to restore focus to after the order prop updates. The parent
   * owns the order, so the moved row is torn down and rebuilt at its new index
   * and the browser drops focus to the top of the document unless it is put
   * back by hand. This is the bug that makes repeated moves impossible, so the
   * pressed control is recorded before the reorder and refocused after it.
   */
  const pendingFocus = useRef<{ id: string; dir: Direction } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    // Follow the moved item. If the pressed direction is now disabled, because
    // the chapter landed first or last, focus the opposite control on the same
    // row so focus still rests on the item the user just moved.
    const pressed = buttonRefs.current.get(keyFor(pending.id, pending.dir));
    if (pressed && !pressed.disabled) {
      pressed.focus();
      return;
    }
    const opposite = buttonRefs.current.get(
      keyFor(pending.id, (pending.dir * -1) as Direction),
    );
    opposite?.focus();
  }, [chapters]);

  const move = (index: number, dir: Direction): void => {
    const target = index + dir;
    if (target < 0 || target >= chapters.length) return;

    const ids = chapters.map((c) => c.id);
    const moved = chapters[index];
    [ids[index], ids[target]] = [ids[target], ids[index]];

    pendingFocus.current = { id: moved.id, dir };
    const movedName = nameOf(moved);
    // The new position is announced from the intended move rather than read
    // back from the DOM, so a non-sighted user hears that the press did
    // something and where the chapter now sits.
    setAnnouncement(
      `Moved ${movedName} to position ${target + 1} of ${chapters.length}`,
    );
    onReorder(ids);
  };

  const registerButton =
    (id: string, dir: Direction) =>
    (el: HTMLButtonElement | null): void => {
      const key = keyFor(id, dir);
      if (el) buttonRefs.current.set(key, el);
      else buttonRefs.current.delete(key);
    };

  return (
    <nav className="book-index" aria-label="Contents">
      <h3 className="book-index__heading" id={headingId}>
        Contents
      </h3>
      {/* An imported book arrives with its structure written into the chapter
          titles and nowhere else. Marking five stories by hand is tedious
          enough that nobody would, so the book offers. It is an offer rather
          than something done on load, because the book is the reader's and a
          shape they did not ask for is worse than no shape. */}
      {onApplyStories && suggestedStories.length > 0 && (
        <div className="book-index__suggestion">
          <p className="book-index__suggestion-text">
            These chapters look like {suggestedStories.length} stories:{" "}
            {suggestedStories.map((m) => m.title).join(", ")}.
          </p>
          <button
            type="button"
            className="book-index__suggestion-accept"
            onClick={() => onApplyStories(suggestedStories)}
          >
            Divide the book
          </button>
        </div>
      )}
      <ol className="book-index__list">
        {chapters.map((chapter, index) => {
          const name = nameOf(chapter);
          const numbered = chapter.number !== null;
          /* Blank rather than repeated when the title is already the number.
             "3  Chapter 3" says the same thing twice in one row. */
          const gutter = !numbered ? "–" : chapter.title ? chapter.number : "";
          const opensStory =
            chapter.story !== null &&
            chapter.story !== chapters[index - 1]?.story;
          return (
            <li key={chapter.id} className="book-index__row">
              {/* Named once, above the chapter that opens it. Rendered inside
                the row rather than between rows so the list stays a list of
                chapters and reordering keeps counting in a straight line. */}
              {opensStory && naming !== chapter.id && (
                <button
                  type="button"
                  className="book-index__story"
                  onClick={() => setNaming(chapter.id)}
                >
                  {chapter.story}
                  <span className="sr-only"> (rename this story)</span>
                </button>
              )}
              {naming === chapter.id && (
                <StoryNameField
                  initial={chapter.story ?? ""}
                  onCommit={(title) => {
                    setNaming(null);
                    onSetStory(chapter.id, title === "" ? null : title);
                  }}
                  onCancel={() => setNaming(null)}
                />
              )}
              <button
                type="button"
                className="book-index__jump"
                aria-current={
                  chapter.id === currentChapterId ? "true" : undefined
                }
                /* Named outright because a chapter with no title of its own has
                 nothing in it but a number, and "1" alone is not a thing
                 anyone can act on when it is read aloud. */
                aria-label={`Go to ${name}`}
                onClick={() => onJump(chapter.id)}
              >
                <span
                  className={
                    numbered
                      ? "book-index__number"
                      : "book-index__number book-index__number--none"
                  }
                  aria-hidden="true"
                >
                  {/* A dash rather than a blank for front matter, so the titles
                    stay on the same left edge as every other chapter. */}
                  {gutter}
                </span>{" "}
                <span
                  className={
                    chapter.missing
                      ? "book-index__title book-index__title--missing"
                      : "book-index__title"
                  }
                >
                  {displayTitleOf(chapter)}
                </span>
              </button>
              <div className="book-index__controls">
                <button
                  type="button"
                  className="book-index__move"
                  ref={registerButton(chapter.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${name} up`}
                  onClick={() => move(index, -1)}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="book-index__move"
                  ref={registerButton(chapter.id, 1)}
                  disabled={index === chapters.length - 1}
                  aria-label={`Move ${name} down`}
                  onClick={() => move(index, 1)}
                >
                  <span aria-hidden="true">↓</span>
                </button>
                {/* A prologue is not chapter one. Marking it here takes it out
                  of the count so the chapters after it keep the numbers the
                  author gave them. */}
                <button
                  type="button"
                  className="book-index__move book-index__numbering"
                  aria-pressed={numbered}
                  aria-label={`Number ${name}`}
                  onClick={() => onSetNumbered(chapter.id, !numbered)}
                >
                  <span aria-hidden="true">#</span>
                </button>
                {/* Not guarded by a confirmation. This takes the chapter out of
                  the running order and leaves the note itself in the library,
                  so the worst case is retyping a position, and a prompt on
                  every row would make tidying a book tiresome. The label says
                  "from this book" for exactly that reason. */}
                {/* An anthology starts a new story part way down the book, and
                  its numbering starts again with it. Pressed means this
                  chapter is where one begins. */}
                <button
                  type="button"
                  className="book-index__move book-index__story-toggle"
                  aria-pressed={opensStory}
                  aria-label={`Start a story at ${name}`}
                  onClick={() =>
                    opensStory
                      ? onSetStory(chapter.id, null)
                      : setNaming(chapter.id)
                  }
                >
                  <span aria-hidden="true">¶</span>
                </button>
                <button
                  type="button"
                  className="book-index__move book-index__remove"
                  aria-label={`Remove ${name} from this book`}
                  onClick={() => onRemoveChapter(chapter.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </nav>
  );
};

/**
 * The field for naming a story, shown in place until it is committed.
 *
 * Enter commits and Escape abandons. Blur abandons too rather than saving,
 * which is the opposite of the book's own title field: that one edits
 * something that already exists, where losing the keystrokes is the worse
 * outcome, while this one creates a division that was not there before and
 * should not appear because a click landed somewhere else.
 */
const StoryNameField = ({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(initial);

  return (
    <input
      className="book-index__story-input"
      autoFocus
      value={draft}
      aria-label="Story name"
      placeholder="Name this story"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft.trim());
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
};
