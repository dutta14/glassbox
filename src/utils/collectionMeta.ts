import type { Note } from "../types";
import { COPY } from "../engine/copy";
import { UNDATED, yearKeyOf } from "./groupByYear";

/**
 * "3 chapters · 2011–2014" for a collection's row and page. The years are the
 * earliest and latest in the chapters' written dates, in the reader's own
 * calendar. One year stands alone, never "2011–2011". A chapter that is gone
 * or has no readable date adds no year, and a collection with no years at all
 * is just its count, which is "Empty" at zero.
 */
export const collectionMeta = (
  chapterCount: number,
  chapters: readonly (Note | null | undefined)[],
): string => {
  const count = COPY.chapterCount(chapterCount);
  const years: number[] = [];
  for (const note of chapters) {
    if (!note) continue;
    const key = yearKeyOf(note);
    if (key !== UNDATED) years.push(Number(key));
  }
  if (years.length === 0) return count;

  const first = Math.min(...years);
  const last = Math.max(...years);
  return `${count} · ${first === last ? first : `${first}–${last}`}`;
};
