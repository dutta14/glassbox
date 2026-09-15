/**
 * First non-empty line of a note's body, used as a one-line excerpt.
 *
 * Used by the search modal. The rail dropped its excerpts when its rows became
 * single-line. Leading blank lines are skipped, so a note that opens with
 * spacing still previews its actual first sentence.
 */
export const previewFromBody = (body: string): string => {
  const firstLine =
    body.split(/\n/).find((line) => line.trim().length > 0) ?? "";
  return firstLine.trim();
};
