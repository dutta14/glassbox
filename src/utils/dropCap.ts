/**
 * A drop cap must never sink past the last line of the text it introduces.
 * That is the whole rule. On a one-line note a three-line capital hangs alone
 * in the white space with a few words floating at its shoulder, which reads as
 * broken rather than as typography.
 *
 * So the sink depth is matched to how much text there is to sit beside, and a
 * note with only one line gets no cap at all. Books do the same: no chapter
 * opens with a single sentence.
 */

/**
 * Character counts, not line counts, because the decision is made before
 * layout exists. Measured in the browser at --editor-measure (42.5rem), which
 * is the widest the column ever gets and therefore the worst case: 90
 * characters is reliably two lines, 170 reliably three.
 *
 * Every other condition errs the safe way. A narrower window wraps into more
 * lines, hard line breaks add lines the count cannot see, and the capital
 * itself pushes text rightwards and so can only ever add lines. All three give
 * the cap more room than assumed, never less.
 */
const MIN_CHARS_FOR_2 = 90;
const MIN_CHARS_FOR_3 = 170;

/** Lines the capital sinks. 0 means no drop cap. */
export type DropCapDepth = 0 | 2 | 3;

/**
 * Deliberately reads the very first character rather than the first letter it
 * can find. A body opening with "#", "-", ">" or a digit is structured text,
 * not prose, and enlarging that character says nothing: the list dash became
 * an enormous floating hyphen. Leading whitespace fails for the same reason it
 * fails in CSS, the capital would sink from a blank first line and float free
 * of the writing.
 */
export const dropCapDepth = (body: string): DropCapDepth => {
  if (body.length < MIN_CHARS_FOR_2) return 0;
  const first = [...body][0];
  if (first === undefined || !/\p{L}/u.test(first)) return 0;
  return body.length >= MIN_CHARS_FOR_3 ? 3 : 2;
};
