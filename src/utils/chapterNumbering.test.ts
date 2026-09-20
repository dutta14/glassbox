import { describe, expect, it } from "vitest";
import {
  isFrontMatterTitle,
  stripSelfNumber,
  labelChapters,
  splitStoryTitle,
  groupChapters,
} from "./chapterNumbering";

describe("isFrontMatterTitle", () => {
  it.each([
    "Prologue",
    "prologue",
    "Epilogue",
    "Foreword",
    "Preface",
    "Introduction",
    "Interlude",
    "Afterword",
    "Appendix",
    "Appendices",
    "Postscript",
    "Coda",
  ])("recognises %s", (title) => {
    expect(isFrontMatterTitle(title)).toBe(true);
  });

  it("recognises front matter that carries its own subtitle", () => {
    expect(isFrontMatterTitle("Prologue: The Fallen Nest")).toBe(true);
    expect(isFrontMatterTitle("Interlude — Winter")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isFrontMatterTitle("  Prologue  ")).toBe(true);
  });

  it("does not match a chapter that merely starts with those letters", () => {
    // "Prologues" is a word a chapter could be called; the boundary stops the
    // prefix from swallowing it.
    expect(isFrontMatterTitle("Prologuey Business")).toBe(false);
    expect(isFrontMatterTitle("Introductions Are Hard")).toBe(false);
  });

  it("only looks at the start of the title", () => {
    // A chapter can be about a prologue without being one.
    expect(isFrontMatterTitle("The Long Prologue")).toBe(false);
    expect(isFrontMatterTitle("Notes on the Epilogue")).toBe(false);
  });

  it("does not match an ordinary chapter title", () => {
    expect(isFrontMatterTitle("The Fallen Nest")).toBe(false);
    expect(isFrontMatterTitle("#1 – The Fallen Nest")).toBe(false);
    expect(isFrontMatterTitle("")).toBe(false);
  });
});

describe("stripSelfNumber", () => {
  it.each([
    ["#1 – The Fallen Nest", "The Fallen Nest"],
    ["#1 - The Fallen Nest", "The Fallen Nest"],
    ["#1 — The Fallen Nest", "The Fallen Nest"],
    ["#1: The Fallen Nest", "The Fallen Nest"],
    ["#1. The Fallen Nest", "The Fallen Nest"],
    ["#1 The Fallen Nest", "The Fallen Nest"],
    ["#1–The Fallen Nest", "The Fallen Nest"],
    ["# 1 – The Fallen Nest", "The Fallen Nest"],
    ["#10 – A Cold Night", "A Cold Night"],
  ])("takes the hash form off %s", (input, expected) => {
    expect(stripSelfNumber(input)).toBe(expected);
  });

  it.each([
    ["Chapter 1 – The Fallen Nest", "The Fallen Nest"],
    ["chapter 1: The Fallen Nest", "The Fallen Nest"],
    ["Chapter 1. The Fallen Nest", "The Fallen Nest"],
    ["Ch. 1 – The Fallen Nest", "The Fallen Nest"],
    ["Ch 1 – The Fallen Nest", "The Fallen Nest"],
    ["Chap. 2 — The Broken Branch", "The Broken Branch"],
    ["Part 2 – The Fall", "The Fall"],
  ])("takes the word form off %s", (input, expected) => {
    expect(stripSelfNumber(input)).toBe(expected);
  });

  it("returns nothing when the title was only its number", () => {
    // Not a failure. It means the chapter has no title of its own, and the
    // number becomes the whole heading.
    expect(stripSelfNumber("Chapter 1")).toBe("");
    expect(stripSelfNumber("#1")).toBe("");
    expect(stripSelfNumber("Chapter 12 —")).toBe("");
  });

  it("leaves a title that merely opens with digits alone", () => {
    // The marker is what makes it a chapter number. Without this, "1984"
    // would lose the only word it has.
    expect(stripSelfNumber("1984")).toBe("1984");
    expect(stripSelfNumber("1984 – A Long Year")).toBe("1984 – A Long Year");
    expect(stripSelfNumber("12 Monkeys")).toBe("12 Monkeys");
  });

  it("leaves a title whose first word only looks like a marker", () => {
    expect(stripSelfNumber("Chapter of Secrets")).toBe("Chapter of Secrets");
    expect(stripSelfNumber("Charlie 1 – The Dog")).toBe("Charlie 1 – The Dog");
    // A tag, not a number.
    expect(stripSelfNumber("#verses")).toBe("#verses");
  });

  it("leaves an ordinary title untouched", () => {
    expect(stripSelfNumber("The Fallen Nest")).toBe("The Fallen Nest");
    expect(stripSelfNumber("")).toBe("");
  });

  it("only takes the number off the front", () => {
    expect(stripSelfNumber("The Fallen Nest, Chapter 1")).toBe(
      "The Fallen Nest, Chapter 1",
    );
  });
});

describe("labelChapters", () => {
  const chapters = [
    { id: "p", title: "Prologue" },
    { id: "a", title: "#1 – The Fallen Nest" },
    { id: "b", title: "#2 – The Broken Branch" },
  ];

  it("numbers every chapter when nothing is marked unnumbered", () => {
    expect(labelChapters(chapters, new Set())).toEqual([
      { number: 1, title: "Prologue" },
      { number: 2, title: "The Fallen Nest" },
      { number: 3, title: "The Broken Branch" },
    ]);
  });

  it("does not let a prologue consume chapter one", () => {
    expect(labelChapters(chapters, new Set(["p"]))).toEqual([
      { number: null, title: "Prologue" },
      { number: 1, title: "The Fallen Nest" },
      { number: 2, title: "The Broken Branch" },
    ]);
  });

  it("does not disturb the numbering of chapters before it", () => {
    // An epilogue at the end is the same rule from the other direction: it
    // takes no number and the chapters before it keep theirs.
    const withEpilogue = [...chapters, { id: "e", title: "Epilogue" }];
    expect(labelChapters(withEpilogue, new Set(["p", "e"]))).toEqual([
      { number: null, title: "Prologue" },
      { number: 1, title: "The Fallen Nest" },
      { number: 2, title: "The Broken Branch" },
      { number: null, title: "Epilogue" },
    ]);
  });

  it("keeps counting across an unnumbered chapter in the middle", () => {
    const withInterlude = [
      { id: "a", title: "One" },
      { id: "i", title: "Interlude" },
      { id: "b", title: "Two" },
    ];
    expect(labelChapters(withInterlude, new Set(["i"]))).toEqual([
      { number: 1, title: "One" },
      { number: null, title: "Interlude" },
      { number: 2, title: "Two" },
    ]);
  });

  it("leaves an unnumbered chapter's own numbering in its title", () => {
    // Nothing is printed above it to contradict, so taking the number off
    // would destroy the only label the chapter has.
    expect(labelChapters([{ id: "x", title: "#1 – Ahead" }], new Set(["x"]))).toEqual(
      [{ number: null, title: "#1 – Ahead" }],
    );
  });

  it("reports an empty title for a chapter that was only a number", () => {
    expect(labelChapters([{ id: "x", title: "Chapter 1" }], new Set())).toEqual([
      { number: 1, title: "" },
    ]);
  });

  it("renumbers from the order it is given, not from the titles", () => {
    // The book owns the order. A chapter the author called #5 is chapter one
    // if it was put first, and the stale number in the title is removed rather
    // than shown next to a contradicting one.
    const reordered = [
      { id: "b", title: "#5 – Later" },
      { id: "a", title: "#1 – Earlier" },
    ];
    expect(labelChapters(reordered, new Set())).toEqual([
      { number: 1, title: "Later" },
      { number: 2, title: "Earlier" },
    ]);
  });

  it("returns nothing for a book with no chapters", () => {
    expect(labelChapters([], new Set())).toEqual([]);
  });
});

describe("splitStoryTitle", () => {
  it("takes the story name off a chapter that carries one", () => {
    expect(splitStoryTitle("Borrowed Weather – Chapter 1")).toEqual({
      story: "Borrowed Weather",
      rest: "Chapter 1",
    });
  });

  it("reads a part the same way as a chapter", () => {
    expect(splitStoryTitle("Almost Love – Part 2")).toEqual({
      story: "Almost Love",
      rest: "Part 2",
    });
  });

  it("accepts a colon as the separator", () => {
    expect(splitStoryTitle("Echoes: Chapter 3")).toEqual({
      story: "Echoes",
      rest: "Chapter 3",
    });
  });

  it("finds no story in a chapter that names none", () => {
    expect(splitStoryTitle("Chapter 1")).toEqual({
      story: null,
      rest: "Chapter 1",
    });
  });

  /**
   * The separator needs space on both sides for exactly this reason. Without
   * it every hyphenated word in the library becomes a story boundary.
   */
  it("does not split a hyphenated word", () => {
    expect(splitStoryTitle("Well-Being – Chapter 1")).toEqual({
      story: "Well-Being",
      rest: "Chapter 1",
    });
  });

  /** "Chapter" has to be numbering something, or it is just a word. */
  it("leaves a title alone when the word chapter is part of the prose", () => {
    expect(splitStoryTitle("Rain – Chapter of Errors")).toEqual({
      story: null,
      rest: "Rain – Chapter of Errors",
    });
  });

  it("keeps whatever follows the number", () => {
    expect(splitStoryTitle("Fracture – Chapter 4: The Long Road")).toEqual({
      story: "Fracture",
      rest: "Chapter 4: The Long Road",
    });
  });
});

describe("groupChapters", () => {
  const plain = (...titles: string[]) =>
    titles.map((title, i) => ({ id: `c${i}`, title }));

  it("puts a book with no stories in one unnamed section", () => {
    const [section, ...rest] = groupChapters(
      plain("One", "Two"),
      new Set(),
      [],
    );

    expect(rest).toEqual([]);
    expect(section.title).toBeNull();
    expect(section.chapters.map((c) => c.number)).toEqual([1, 2]);
  });

  /** The whole point: chapter one comes round again with each story. */
  it("starts each story's numbering over at one", () => {
    const sections = groupChapters(
      plain("A1", "A2", "B1", "B2", "B3"),
      new Set(),
      [
        { startsAt: "c0", title: "Echoes" },
        { startsAt: "c2", title: "Fracture" },
      ],
    );

    expect(sections.map((s) => s.title)).toEqual(["Echoes", "Fracture"]);
    expect(sections[0].chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(sections[1].chapters.map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it("leaves chapters before the first story in a section of their own", () => {
    const sections = groupChapters(plain("Foreword", "A1"), new Set(), [
      { startsAt: "c1", title: "Echoes" },
    ]);

    expect(sections.map((s) => s.title)).toEqual([null, "Echoes"]);
    expect(sections[0].chapters.map((c) => c.id)).toEqual(["c0"]);
  });

  it("does not leave an empty section when a story opens the book", () => {
    const sections = groupChapters(plain("A1"), new Set(), [
      { startsAt: "c0", title: "Echoes" },
    ]);

    expect(sections).toHaveLength(1);
  });

  it("ignores a story anchored to a chapter the book does not have", () => {
    const sections = groupChapters(plain("A1", "A2"), new Set(), [
      { startsAt: "gone", title: "Echoes" },
    ]);

    expect(sections.map((s) => s.title)).toEqual([null]);
  });

  /** Front matter costs nothing inside a story either. */
  it("skips unnumbered chapters within a story's count", () => {
    const sections = groupChapters(
      plain("Echoes", "Prologue", "One"),
      new Set(["c1"]),
      [{ startsAt: "c0", title: "Echoes" }],
    );

    expect(sections[0].chapters.map((c) => c.number)).toEqual([1, null, 2]);
  });

  it("takes the story's name out of a chapter that repeats it", () => {
    const sections = groupChapters(
      plain("Echoes – Chapter 1", "Echoes – Chapter 2"),
      new Set(),
      [{ startsAt: "c0", title: "Echoes" }],
    );

    expect(sections[0].chapters.map((c) => c.title)).toEqual(["", ""]);
    expect(sections[0].chapters.map((c) => c.number)).toEqual([1, 2]);
  });

  /**
   * A chapter calling itself part of another story is almost certainly filed
   * wrong, and hiding the evidence would make that impossible to notice.
   */
  it("keeps a prefix that disagrees with the story it sits in", () => {
    const sections = groupChapters(
      plain("Fracture – Chapter 1"),
      new Set(),
      [{ startsAt: "c0", title: "Echoes" }],
    );

    expect(sections[0].chapters[0].title).toBe("Fracture – Chapter 1");
  });

  it("keeps a story prefix when the chapter is in no story at all", () => {
    const sections = groupChapters(plain("Echoes – Chapter 1"), new Set(), []);

    expect(sections[0].chapters[0].title).toBe("Echoes – Chapter 1");
  });

  it("matches the story name regardless of case", () => {
    const sections = groupChapters(plain("ECHOES – Chapter 1"), new Set(), [
      { startsAt: "c0", title: "Echoes" },
    ]);

    expect(sections[0].chapters[0].title).toBe("");
  });
});
