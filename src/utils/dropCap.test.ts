import { describe, expect, it } from "vitest";
import { dropCapDepth } from "./dropCap";

/**
 * The rule under test is "the capital must not sink past the last line". The
 * thresholds are a character-count stand-in for a line count, so the boundary
 * cases are the ones worth pinning: they are what a change to the measure or
 * the type size would silently move.
 */

const chars = (n: number, lead = "A") => lead + "a".repeat(n - lead.length);

describe("dropCapDepth", () => {
  it("gives a long note the full three-line capital", () => {
    expect(dropCapDepth(chars(400))).toBe(3);
  });

  it("gives a two-line note a capital that sinks only two", () => {
    expect(dropCapDepth(chars(120))).toBe(2);
  });

  it("gives a one-line note no capital, so it cannot dangle", () => {
    expect(dropCapDepth("Hello world.")).toBe(0);
  });

  it("gives an empty note no capital", () => {
    expect(dropCapDepth("")).toBe(0);
  });

  describe("at the boundaries", () => {
    it("withholds the capital one character below the two-line mark", () => {
      expect(dropCapDepth(chars(89))).toBe(0);
    });

    it("grants the two-line capital exactly on the mark", () => {
      expect(dropCapDepth(chars(90))).toBe(2);
    });

    it("holds at two lines one character below the three-line mark", () => {
      expect(dropCapDepth(chars(169))).toBe(2);
    });

    it("grants the three-line capital exactly on the mark", () => {
      expect(dropCapDepth(chars(170))).toBe(3);
    });
  });

  describe("only when the note opens with prose", () => {
    it("declines a body that opens with a list dash", () => {
      expect(dropCapDepth(chars(400, "- "))).toBe(0);
    });

    it("declines a body that opens with a heading marker", () => {
      expect(dropCapDepth(chars(400, "# "))).toBe(0);
    });

    it("declines a body that opens with a quote marker", () => {
      expect(dropCapDepth(chars(400, "> "))).toBe(0);
    });

    it("declines a body that opens with a digit", () => {
      expect(dropCapDepth(chars(400, "1"))).toBe(0);
    });

    it("declines a body that opens with whitespace", () => {
      expect(dropCapDepth(chars(400, " "))).toBe(0);
    });

    it("accepts a letter outside the Latin alphabet", () => {
      expect(dropCapDepth(chars(400, "Ä"))).toBe(3);
    });

    it("accepts a letter from a non-Latin script", () => {
      expect(dropCapDepth("的" + "字".repeat(400))).toBe(3);
    });
  });
});
