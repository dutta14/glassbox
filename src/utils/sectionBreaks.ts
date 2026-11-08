/**
 * Section breaks written into prose by hand: a line of dashes with a bracketed
 * number on the line below, and a bare "[1]" opening the note.
 *
 *     ...the end of one part.
 *
 *     ---
 *     [2]
 *
 *     The start of the next.
 *
 * The note stays plain text. This only decides which lines the reading view
 * draws as a break, so the file and the field underneath are never rewritten.
 */

export type BodySegment =
  | { kind: "text"; start: number; text: string }
  | {
      kind: "break";
      /** Offset of the first character of the line(s) the break stands in for. */
      start: number;
      number: string;
      /** The "[1]" that opens a note. Has no rule above it, there being no
          section before it to separate from. */
      opening: boolean;
    };

const RULE = /^\s*-{2,}\s*$/;
const MARKER = /^\s*\[(\d{1,4})\]\s*$/;

/**
 * Splits a body into text and breaks. Joining every text segment with the
 * lines each break replaced gives back the original, apart from the one
 * newline that ends a break's last line, which is dropped so that the break
 * occupies exactly the lines it replaced and nothing shifts when the reading
 * view is swapped for the field.
 */
export const splitSectionBreaks = (body: string): BodySegment[] => {
  const segments: BodySegment[] = [];
  let textStart = 0;
  let at = 0;
  let seenContent = false;

  const lines = body.split("\n");
  const lineAt = (i: number) => lines[i] ?? "";
  const flushText = (end: number) => {
    if (end > textStart) {
      segments.push({
        kind: "text",
        start: textStart,
        text: body.slice(textStart, end),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lineAt(i);
    const lineEnd = at + line.length;
    const next = i + 1 < lines.length ? lineAt(i + 1) : null;

    const opening = !seenContent ? MARKER.exec(line) : null;
    const closing =
      opening === null && RULE.test(line) && next !== null
        ? MARKER.exec(next)
        : null;

    if (opening || closing) {
      flushText(at);
      const consumedEnd = closing ? lineEnd + 1 + next!.length : lineEnd;
      segments.push({
        kind: "break",
        start: at,
        number: (opening ?? closing)![1]!,
        opening: opening !== null,
      });
      // Skip the newline that ends the break's last line.
      textStart = Math.min(consumedEnd + 1, body.length);
      at = consumedEnd + 1;
      seenContent = true;
      if (closing) i++;
      continue;
    }

    if (line.trim() !== "") seenContent = true;
    at = lineEnd + 1;
  }

  flushText(body.length);
  return segments;
};
