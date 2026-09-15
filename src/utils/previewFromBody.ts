/**
 * First non-empty line of a note's body, used as a one-line excerpt.
 *
 * Shared by the note rail and the search modal so the same note shows the same
 * excerpt in both places. Leading blank lines are skipped, so a note that opens
 * with spacing still previews its actual first sentence.
 */
export const previewFromBody = (body: string): string => {
  const firstLine =
    body.split(/\n/).find((line) => line.trim().length > 0) ?? "";
  return firstLine.trim();
};
