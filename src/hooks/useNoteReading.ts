import { useMemo } from "react";
import type { Note } from "../types";
import { dropCapDepth } from "../utils/dropCap";
import { leadingImage } from "../utils/noteImage";
import { splitSectionBreaks } from "../utils/sectionBreaks";

/**
 * What the reading view needs to know about a note, worked out once. Shared by
 * the editor, which lays its field over this, and by the feed, which shows
 * nothing else, so the two cannot drift apart in how a note is read.
 */
export interface NoteReading {
  /** A poem is set as it was written, line for line, and never takes a drop
      cap. It does draw section breaks, as prose does. */
  verse: boolean;
  isEmpty: boolean;
  /** A picture that opens the note, shown as a picture and held out of the text. */
  image: ReturnType<typeof leadingImage>;
  /** Where the shown text starts in the note, past any lifted picture. */
  readOffset: number;
  readBody: string;
  /** 0 when the note is too short for a drop cap, else how many lines it sinks. */
  cap: number;
  segments: ReturnType<typeof splitSectionBreaks>;
  hasBreaks: boolean;
}

export const useNoteReading = (
  note: Pick<Note, "body" | "format">,
): NoteReading =>
  useMemo(() => {
    const verse = (note.format ?? "prose") === "verse";
    const isEmpty = note.body === "";
    /* The reading view holds the picture out so the note does not also print
       its own source line. The field underneath still holds the whole note. */
    const image = leadingImage(note.body);
    const readOffset = image ? image.bodyOffset : 0;
    const readBody = note.body.slice(readOffset);
    // Measured on what is actually shown: a sketch note's first words are its
    // prose, not the image line that no longer appears above them.
    const cap = verse ? 0 : dropCapDepth(readBody);
    // With no breaks in the note the reading view stays a single text node.
    const segments = isEmpty ? [] : splitSectionBreaks(readBody);
    return {
      verse,
      isEmpty,
      image,
      readOffset,
      readBody,
      cap,
      segments,
      hasBreaks: segments.some((seg) => seg.kind === "break"),
    };
  }, [note.body, note.format]);
