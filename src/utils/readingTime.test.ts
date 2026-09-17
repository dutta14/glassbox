import { describe, expect, it } from "vitest";
import { readingTime } from "./readingTime";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("readingTime", () => {
  it("rounds to the nearest minute at 230 words per minute", () => {
    expect(readingTime(words(460))).toBe(2);
  });

  it("rounds a part-minute up once it passes the halfway point", () => {
    expect(readingTime(words(350))).toBe(2);
  });

  it("never reports less than a minute, so a short note is not '0 min read'", () => {
    expect(readingTime("three short words")).toBe(1);
  });

  it("treats an empty note as a minute rather than reporting nothing", () => {
    expect(readingTime("")).toBe(1);
  });

  it("does not count whitespace as a word", () => {
    // "".split(/\s+/) yields [""], which would make blank notes read as 1 word
    // and any leading space inflate the count.
    expect(readingTime("   \n\n   ")).toBe(1);
  });

  it("counts words separated by newlines, not just spaces", () => {
    expect(readingTime(Array.from({ length: 460 }, () => "w").join("\n"))).toBe(
      2,
    );
  });
});
