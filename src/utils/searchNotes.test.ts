import { describe, expect, it } from "vitest";
import {
  bodySnippet,
  fullDateOf,
  noteMatches,
  searchNotes,
  splitByHits,
  titleHasHit,
} from "./searchNotes";
import type { Note } from "../types";

const mk = (over: Partial<Note> & { id: string }): Note => ({
  title: "",
  body: "",
  tags: [],
  createdAt: "2024-06-15T12:00:00.000Z",
  updatedAt: "2024-06-15T12:00:00.000Z",
  ...over,
});

describe("noteMatches", () => {
  const note = mk({
    id: "a",
    title: "Postgres tuning",
    body: "shared_buffers at 25% of RAM",
    tags: ["database", "ops"],
  });

  it("matches title, body and tags, ignoring case", () => {
    expect(noteMatches(note, "postgres")).toBe(true);
    expect(noteMatches(note, "shared_buffers")).toBe(true);
    expect(noteMatches(note, "database")).toBe(true);
    expect(noteMatches(note, "zzz")).toBe(false);
  });

  it("matches nothing for an empty query", () => {
    expect(noteMatches(note, "")).toBe(false);
  });
});

describe("searchNotes", () => {
  it("returns matches newest first and puts undated notes last", () => {
    const notes = [
      mk({ id: "old", title: "pool", createdAt: "2019-01-01T12:00:00.000Z" }),
      mk({ id: "bad", title: "pool", createdAt: "not a date" }),
      mk({ id: "new", title: "pool", createdAt: "2024-01-01T12:00:00.000Z" }),
      mk({ id: "miss", title: "other" }),
    ];

    expect(searchNotes(notes, "  POOL ").map((n) => n.id)).toEqual([
      "new",
      "old",
      "bad",
    ]);
  });

  it("returns nothing for a blank query", () => {
    expect(searchNotes([mk({ id: "a", title: "x" })], "   ")).toEqual([]);
  });
});

describe("titleHasHit", () => {
  it("looks at the title only", () => {
    const note = mk({ id: "a", title: "Sourdough", body: "starter" });
    expect(titleHasHit(note, "dough")).toBe(true);
    expect(titleHasHit(note, "starter")).toBe(false);
  });
});

describe("splitByHits", () => {
  it("flags every occurrence and keeps the original casing", () => {
    expect(splitByHits("Ship it, then ship again", "SHIP")).toEqual([
      { text: "Ship", hit: true },
      { text: " it, then ", hit: false },
      { text: "ship", hit: true },
      { text: " again", hit: false },
    ]);
  });

  it("returns the text whole when there is no query or no hit", () => {
    expect(splitByHits("abc", "")).toEqual([{ text: "abc", hit: false }]);
    expect(splitByHits("abc", "z")).toEqual([{ text: "abc", hit: false }]);
  });

  it("does not treat the query as a pattern", () => {
    expect(splitByHits("a.b a+b", "a+b")).toEqual([
      { text: "a.b ", hit: false },
      { text: "a+b", hit: true },
    ]);
  });
});

describe("bodySnippet", () => {
  it("returns null when the body has no hit", () => {
    expect(
      bodySnippet(mk({ id: "a", body: "nothing here" }), "zzz"),
    ).toBeNull();
  });

  it("returns a short body whole, without ellipses", () => {
    expect(bodySnippet(mk({ id: "a", body: "the starter" }), "starter")).toBe(
      "the starter",
    );
  });

  it("starts about 40 characters before the first hit and marks both cut ends", () => {
    const body = `${"a".repeat(100)} needle ${"b".repeat(200)}`;
    const snippet = bodySnippet(mk({ id: "a", body }), "needle")!;

    expect(snippet.startsWith("… ")).toBe(true);
    expect(snippet.endsWith(" …")).toBe(true);
    expect(snippet).toContain("needle");
    expect(snippet.indexOf("needle")).toBeLessThan(50);
  });

  it("flattens line breaks into one line", () => {
    const snippet = bodySnippet(
      mk({ id: "a", body: "one\n\ntwo needle" }),
      "needle",
    );
    expect(snippet).toBe("one two needle");
  });
});

describe("fullDateOf", () => {
  it("gives the month, day and year, or nothing for a bad date", () => {
    expect(fullDateOf(mk({ id: "a" }))).toBe("June 15, 2024");
    expect(fullDateOf(mk({ id: "b", createdAt: "nope" }))).toBe("");
  });
});
