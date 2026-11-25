import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { groupByYear, monthDayOf, yearKeyOf } from "./groupByYear";

const mk = (id: string, createdAt: string): Note => ({
  id,
  title: id,
  body: "",
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

describe("groupByYear", () => {
  it("orders years and the notes in them newest first", () => {
    const groups = groupByYear([
      mk("a", "2023-03-10T12:00:00"),
      mk("b", "2025-06-01T12:00:00"),
      mk("c", "2023-09-10T12:00:00"),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["2025", "2023"]);
    expect(groups[1].notes.map((n) => n.id)).toEqual(["c", "a"]);
  });

  it("puts notes without a valid date in a final Undated group", () => {
    const groups = groupByYear([
      mk("x", "garbage"),
      mk("a", "2020-05-05T12:00:00"),
      mk("y", ""),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["2020", "Undated"]);
    expect(groups[1].notes.map((n) => n.id)).toEqual(["x", "y"]);
  });

  it("returns nothing for no notes", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("date helpers", () => {
  it("names the day without a year", () => {
    expect(monthDayOf(mk("a", "2024-06-15T12:00:00"))).toBe("June 15");
    expect(yearKeyOf(mk("a", "2024-06-15T12:00:00"))).toBe("2024");
  });

  it("has no day line for an unreadable date", () => {
    expect(monthDayOf(mk("a", "nope"))).toBe("");
  });
});
