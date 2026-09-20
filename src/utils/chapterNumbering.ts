/**
 * Chapter numbering for books.
 *
 * Two problems live here, and they are the same problem twice. A book can
 * open with a prologue, which must not consume chapter one; and an author
 * often numbers chapters in the title itself, which must not be printed above
 * a number the app has already worked out.
 */

/* Words that name a part of a book rather than number it. Used only to
   suggest a default when a chapter is added: the answer is then written to
   the book as data the reader can see and change, so a wrong guess is one
   click to undo rather than a rule that keeps re-applying itself. */
const FRONT_MATTER =
  /^(prologue|epilogue|foreword|forward|preface|introduction|interlude|afterword|appendi(x|ces)|postscript|coda)\b/i;

/**
 * Whether a title reads as front or back matter rather than as a chapter.
 *
 * Deliberately generous: "Introduction to the Dragon" matches. Suggesting
 * unnumbered for a chapter that wanted a number is a visible, reversible
 * mistake, while missing a prologue silently shifts every number in the book.
 */
export const isFrontMatterTitle = (title: string): boolean =>
  FRONT_MATTER.test(title.trim());

/* A number the author wrote into the title. The marker is required: without
   it a title that merely opens with digits, "1984", would be mistaken for a
   chapter heading and lose its first word.

   Digits only, no roman numerals. "Chapter IV" is rare in practice, and the
   set of roman letters is broad enough that "Chapter Mild Winter" would match
   it, which is a worse failure than not stripping at all. */
const SELF_NUMBER = /^(?:#\s*|(?:chapters?|chap|ch|parts?)\.?\s+)\d+\s*(?:[–—\-:.)]+\s*)?/i;

/**
 * The title with the author's own chapter number taken off the front.
 *
 * Returns an empty string when the title was nothing but its number, which is
 * not a failure: it means the chapter has no title of its own and should be
 * shown by its number alone.
 */
export const stripSelfNumber = (title: string): string =>
  /* No second trim after the replace: the pattern already consumes the
     whitespace that follows the number, and the input was trimmed going in. */
  title.trim().replace(SELF_NUMBER, "");

export interface ChapterLabel {
  /**
   * Position among the numbered chapters, counting from one, or null when the
   * chapter is unnumbered. Front matter does not take a number and does not
   * advance the count, so a prologue leaves chapter one where it belongs and
   * an epilogue at the end costs nothing.
   */
  number: number | null;
  /**
   * The title as it should be shown. Empty when the chapter has no title
   * beyond its number, in which case the number is the whole heading.
   */
  title: string;
}

/**
 * Works out the number and displayed title for every chapter in a book.
 *
 * The author's own numbering is stripped only from chapters the app is
 * numbering. An unnumbered chapter keeps its title exactly as written, because
 * there is no number above it to contradict.
 */
export const labelChapters = (
  chapters: readonly { id: string; title: string }[],
  unnumbered: ReadonlySet<string>,
): ChapterLabel[] => {
  let counted = 0;
  return chapters.map(({ id, title }) => {
    if (unnumbered.has(id)) return { number: null, title: title.trim() };
    counted += 1;
    return { number: counted, title: stripSelfNumber(title) };
  });
};
