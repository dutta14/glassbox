import { describe, expect, it } from "vitest";
import {
  isFrontMatterTitle,
  stripSelfNumber,
  labelChapters,
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
