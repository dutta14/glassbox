/** Words per minute. Matches the blog so the same text reports the same
    estimate in both places. */
const WORDS_PER_MINUTE = 230;

/**
 * Minutes to read a note, rounded, never below one.
 *
 * A note of three words is still "1 min read" rather than "0 min read", which
 * would read as an error rather than as an estimate.
 */
export const readingTime = (body: string): number => {
  const trimmed = body.trim();
  if (trimmed === "") return 1;
  return Math.max(
    1,
    Math.round(trimmed.split(/\s+/).length / WORDS_PER_MINUTE),
  );
};
