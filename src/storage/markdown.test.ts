import { describe, it, expect } from "vitest";
import {
  serialiseNote,
  parseNote,
  normaliseDate,
  slugify,
  noteFilename,
} from "./markdown";
import type { Note } from "../types";

const mk = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? "abc123",
  title: overrides.title ?? "Title",
  body: overrides.body ?? "body text",
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-02T00:00:00.000Z",
});

describe("serialiseNote + parseNote round-trip", () => {
  const roundtrip = (note: Note) => {
    const result = parseNote(serialiseNote(note));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    return result.note;
  };

  it("preserves a title containing a colon, escaped quotes, and a #hash", () => {
    const note = mk({ title: 'Title: with "quotes" and #hash' });
    expect(roundtrip(note)).toEqual(note);
  });

  it("preserves an embedded newline in the title", () => {
    const note = mk({ title: "Line one\nLine two" });
    const back = roundtrip(note);
    expect(back.title).toBe("Line one\nLine two");
    expect(back).toEqual(note);
  });

  it("preserves backslashes, unicode, an emoji, and a tab in the body", () => {
    const body = "back\\slash tab\there café 🎉 done";
    const note = mk({ body });
    const back = roundtrip(note);
    expect(back.body).toBe(body);
    expect(back).toEqual(note);
  });

  it("round-trips an empty body with empty tags", () => {
    const note = mk({ body: "", tags: [] });
    const back = roundtrip(note);
    expect(back.body).toBe("");
    expect(back.tags).toEqual([]);
    expect(back).toEqual(note);
  });

  it("round-trips a body that is only three dashes", () => {
    const note = mk({ body: "---" });
    const back = roundtrip(note);
    expect(back.body).toBe("---");
    expect(back).toEqual(note);
  });

  it("does NOT let a fake frontmatter block inside the body hijack identity", () => {
    // A note body that contains a complete-looking frontmatter block must not
    // be parsed as if that block were the outer frontmatter. Only the FIRST
    // closing --- terminates the real frontmatter; everything after belongs
    // to the body verbatim. Regression: this is an injection surface.
    const evilBody =
      'real body starts here\n\n---\nid: evil\ntitle: "hijack"\ntags: []\ncreatedAt: 2000-01-01T00:00:00.000Z\nupdatedAt: 2000-01-01T00:00:00.000Z\n---\nfake trailing body';
    const note = mk({ id: "real-id", title: "Real title", body: evilBody });
    const back = roundtrip(note);
    expect(back.id).toBe("real-id");
    expect(back.title).toBe("Real title");
    expect(back.body).toBe(evilBody);
    // Prove the injected block did not become the identity, and that the
    // injected block is still present verbatim in the body (not stripped).
    expect(back.id).not.toBe("evil");
    expect(back.title).not.toBe("hijack");
    expect(back.body).toContain("id: evil");
  });
});

describe("parseNote error handling", () => {
  it("returns ok:false for an empty string without throwing", () => {
    const r = parseNote("");
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for a file with no frontmatter", () => {
    const r = parseNote("just a plain body\nwith no frontmatter at all\n");
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for a truncated frontmatter with no closing delimiter", () => {
    const r = parseNote('---\nid: x\ntitle: "T"\ntags: []\n');
    expect(r.ok).toBe(false);
  });

  it("returns ok:false when the frontmatter is missing a required field", () => {
    // Closed frontmatter with body, but no `id` line. This is the closest the
    // impl allows to "frontmatter with no body" without also being empty on
    // both sides. Missing id must be a hard failure, not a silent adopt.
    const text =
      '---\ntitle: "T"\ntags: []\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\n---\n\nbody';
    const r = parseNote(text);
    expect(r.ok).toBe(false);
  });

  it("does not throw on any of the malformed inputs above", () => {
    expect(() => parseNote("")).not.toThrow();
    expect(() => parseNote("no frontmatter")).not.toThrow();
    expect(() => parseNote("---\nid: x\n")).not.toThrow();
    expect(() => parseNote("---\n\n---\n\nbody")).not.toThrow();
  });
});

describe("normaliseDate", () => {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("accepts a canonical ISO string unchanged", () => {
    expect(normaliseDate("2026-09-04T17:00:00.000Z")).toBe(
      "2026-09-04T17:00:00.000Z",
    );
  });

  it("accepts a double-quoted ISO string and strips the quotes", () => {
    expect(normaliseDate('"2026-09-04T17:00:00Z"')).toBe(
      "2026-09-04T17:00:00.000Z",
    );
  });

  it("accepts a single-quoted ISO string and strips the quotes", () => {
    expect(normaliseDate("'2026-09-04T17:00:00Z'")).toBe(
      "2026-09-04T17:00:00.000Z",
    );
  });

  it("accepts a space between date and time and outputs canonical ISO with T", () => {
    expect(normaliseDate("2026-09-04 17:00:00.000Z")).toBe(
      "2026-09-04T17:00:00.000Z",
    );
  });

  it("accepts a string with no milliseconds and adds .000 in canonical output", () => {
    expect(normaliseDate("2026-09-04T17:00:00Z")).toBe(
      "2026-09-04T17:00:00.000Z",
    );
  });

  it("accepts a string with no timezone and returns a canonical ISO", () => {
    // Naive datetimes are interpreted per the runtime, but the output shape
    // is always canonical Zulu ISO with milliseconds. Assert shape and that
    // the output round-trips to the same instant, without asserting a TZ
    // that depends on the runner.
    const out = normaliseDate("2026-09-04T17:00:00");
    expect(out).not.toBeNull();
    expect(out!).toMatch(ISO);
    expect(Date.parse(out!)).toBe(Date.parse("2026-09-04T17:00:00"));
  });

  it("returns null for junk that is not a date", () => {
    expect(normaliseDate("not a date")).toBeNull();
    expect(normaliseDate("")).toBeNull();
    expect(normaliseDate('""')).toBeNull();
  });
});

describe("slugify and noteFilename", () => {
  it("replaces spaces with hyphens and lowercases", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation and collapses runs of non-alphanumerics", () => {
    expect(slugify("Foo, Bar!! Baz?")).toBe("foo-bar-baz");
  });

  it("folds accented unicode via NFKD", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  it('returns "untitled" for an empty title', () => {
    expect(slugify("")).toBe("untitled");
  });

  it('returns "untitled" for a punctuation-only title', () => {
    expect(slugify("!!!???")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
  });

  it('produces a usable filename even when the title is empty (no ".md" or bare-dot name)', () => {
    const note = mk({ id: "abc123", title: "" });
    const name = noteFilename(note);
    expect(name).toBe("untitled-abc123.md");
    expect(name).not.toBe(".md");
    expect(name).not.toBe("-abc123.md");
    expect(name.startsWith(".")).toBe(false);
  });

  it("produces a usable filename for a punctuation-only title", () => {
    const note = mk({ id: "abc123", title: "???" });
    const name = noteFilename(note);
    expect(name).toBe("untitled-abc123.md");
  });
});

/**
 * Format is the one optional key in the frontmatter, which makes it the one
 * that can break the round-trip invariant. All three states are pinned: absent,
 * explicitly prose, and verse.
 */
describe("note format", () => {
  const base = {
    id: "abc",
    title: "Hope is the thing with feathers",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    body: "Hope is the thing with feathers\nThat perches in the soul,",
  };

  it("round-trips a verse note", () => {
    const note = { ...base, format: "verse" as const };
    const result = parseNote(serialiseNote(note));

    expect(result.ok).toBe(true);
    expect(result.ok && result.note).toEqual(note);
  });

  it("round-trips a note with no format, leaving the key off entirely", () => {
    const result = parseNote(serialiseNote(base));

    expect(serialiseNote(base)).not.toContain("format");
    expect(result.ok).toBe(true);
    expect(result.ok && result.note).toEqual(base);
  });

  /* Writing `format: "prose"` into every existing file the first time it was
     touched would churn the whole folder for no gain. */
  it("leaves a prose note byte-identical to what it was before formats existed", () => {
    expect(serialiseNote(base)).toBe(
      [
        "---",
        "id: abc",
        'title: "Hope is the thing with feathers"',
        "tags: []",
        "createdAt: 2026-01-01T00:00:00.000Z",
        "updatedAt: 2026-01-02T00:00:00.000Z",
        "---",
        "",
        base.body,
      ].join("\n"),
    );
  });

  it("round-trips a note whose format is explicitly prose", () => {
    const note = { ...base, format: "prose" as const };
    const result = parseNote(serialiseNote(note));

    expect(result.ok && result.note).toEqual(note);
  });

  it("reads a bare unquoted format, as a hand-edited file would have it", () => {
    const text = serialiseNote(base).replace(
      "updatedAt: 2026-01-02T00:00:00.000Z",
      "updatedAt: 2026-01-02T00:00:00.000Z\nformat: verse",
    );
    const result = parseNote(text);

    expect(result.ok && result.note.format).toBe("verse");
  });

  /* A bad format is never a reason to lose a note. */
  it("keeps the note and falls back to prose when the format is unrecognised", () => {
    const text = serialiseNote(base).replace(
      "updatedAt: 2026-01-02T00:00:00.000Z",
      'updatedAt: 2026-01-02T00:00:00.000Z\nformat: "haiku"',
    );
    const result = parseNote(text);

    expect(result.ok).toBe(true);
    expect(result.ok && result.note.format).toBeUndefined();
    expect(result.ok && result.note.body).toBe(base.body);
  });

  it("keeps the note when the format line is empty", () => {
    const text = serialiseNote(base).replace(
      "updatedAt: 2026-01-02T00:00:00.000Z",
      "updatedAt: 2026-01-02T00:00:00.000Z\nformat:",
    );
    const result = parseNote(text);

    expect(result.ok).toBe(true);
    expect(result.ok && result.note.format).toBeUndefined();
  });
});
