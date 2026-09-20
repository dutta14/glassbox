import { describe, expect, it } from "vitest";
import { suggestStories } from "./chapterNumbering";

const c = (id: string, title: string) => ({ id, title });

describe("suggestStories", () => {
  it("proposes a story for each run of chapters sharing a prefix", () => {
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "Echoes – Chapter 2"),
        c("c", "Fracture – Chapter 1"),
        c("d", "Fracture – Chapter 2"),
      ]),
    ).toEqual([
      { startsAt: "a", title: "Echoes" },
      { startsAt: "c", title: "Fracture" },
    ]);
  });

  it("proposes nothing when no title names a story", () => {
    expect(suggestStories([c("a", "Chapter 1"), c("b", "Chapter 2")])).toEqual(
      [],
    );
  });

  it("ignores a prefix that appears only once", () => {
    // More likely a chapter with a long title than a story of one chapter.
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "Echoes – Chapter 2"),
        c("c", "Napkin Map – Chapter 1"),
      ]),
    ).toEqual([{ startsAt: "a", title: "Echoes" }]);
  });

  it("opens a second story when a name returns after another", () => {
    // The order on the page is the order the reader meets them in, and a
    // story cannot be in two places.
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "Echoes – Chapter 2"),
        c("c", "Fracture – Chapter 1"),
        c("d", "Fracture – Chapter 2"),
        c("e", "Echoes – Chapter 3"),
        c("f", "Echoes – Chapter 4"),
      ]),
    ).toEqual([
      { startsAt: "a", title: "Echoes" },
      { startsAt: "c", title: "Fracture" },
      { startsAt: "e", title: "Echoes" },
    ]);
  });

  it("does not let front matter break a run in two", () => {
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "Echoes – Chapter 2"),
      ]).length,
    ).toBe(1);
  });

  it("matches a prefix regardless of its case", () => {
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "ECHOES – Chapter 2"),
      ]),
    ).toEqual([{ startsAt: "a", title: "Echoes" }]);
  });

  it("keeps a chapter with no prefix out of the story before it", () => {
    expect(
      suggestStories([
        c("a", "Echoes – Chapter 1"),
        c("b", "An Interlude"),
        c("c", "Echoes – Chapter 2"),
      ]),
    ).toEqual([]);
  });

  it("proposes nothing for an empty book", () => {
    expect(suggestStories([])).toEqual([]);
  });
});
