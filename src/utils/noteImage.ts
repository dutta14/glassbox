/**
 * A note is plain Markdown, and the editor is a plain text field. The one
 * exception is a picture: seven notes in the archive are sketches, and a
 * sketch that reads as `![Sultry Days](images/handdrawn-001.jpg)` is not a
 * note about a drawing, it is the drawing, shown as its own filename.
 *
 * Only a picture that opens a note is lifted out. That is what a sketch note
 * is: the image, then what it is about. An image further down stays as the
 * text it is, because pulling it to the top would move it away from the
 * sentence that introduces it and silently reorder the writing.
 */

export interface LeadingImage {
  /** The alt text, which for the archive is the title of the sketch. */
  alt: string;
  /** The path as written in the note, relative to the notes folder. */
  src: string;
  /**
   * Where the rest of the note begins. The reading view is shown from here,
   * so the picture is not also printed as its own source, and every offset
   * taken from that view has to be shifted by it to point back into the body.
   */
  bodyOffset: number;
}

/** A whole line that is nothing but one image. */
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^()\s]+)\)$/;

export const leadingImage = (body: string): LeadingImage | null => {
  const lines = body.split("\n");

  // Blank lines before it are skipped, because a file written by hand or by
  // an importer may leave one after the front matter.
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  if (index >= lines.length) return null;

  const match = IMAGE_LINE.exec(lines[index].trim());
  if (!match) return null;

  // The blank lines separating the picture from the prose go with it, so the
  // note does not open on an empty line where the image used to be.
  let after = index + 1;
  while (after < lines.length && lines[after].trim() === "") after += 1;

  const bodyOffset = lines
    .slice(0, after)
    .reduce((total, line) => total + line.length + 1, 0);

  return {
    alt: match[1],
    src: match[2],
    // Clamped, because a note that is only an image has no trailing newline
    // and the count above would run one past its end.
    bodyOffset: Math.min(bodyOffset, body.length),
  };
};

/** Paths the browser can load directly, with no folder to resolve them in. */
export const isExternalAsset = (src: string): boolean =>
  /^(https?:|data:|blob:)/i.test(src);
