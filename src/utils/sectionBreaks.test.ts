import { describe, expect, it } from "vitest";
import { splitSectionBreaks } from "./sectionBreaks";

describe("splitSectionBreaks", () => {
  it("returns a single text segment when there are no breaks", () => {
    expect(splitSectionBreaks("Just a line.\nAnother.")).toEqual([
      { kind: "text", start: 0, text: "Just a line.\nAnother." },
    ]);
  });

  it("turns a dash line followed by a bracketed number into a break", () => {
    const body = "One.\n\n---\n[2]\n\nTwo.";
    expect(splitSectionBreaks(body)).toEqual([
      { kind: "text", start: 0, text: "One.\n\n" },
      { kind: "break", start: 6, number: "2", opening: false },
      { kind: "text", start: 14, text: "\nTwo." },
    ]);
  });

  it("accepts two dashes, as well as longer runs", () => {
    for (const rule of ["--", "-----"]) {
      const parts = splitSectionBreaks(`a\n${rule}\n[3]\nb`);
      expect(parts.map((p) => p.kind)).toEqual(["text", "break", "text"]);
    }
  });

  it("treats a bracketed number opening the note as an opening marker", () => {
    expect(splitSectionBreaks("[1]\n\nIt began.")).toEqual([
      { kind: "break", start: 0, number: "1", opening: true },
      { kind: "text", start: 4, text: "\nIt began." },
    ]);
  });

  it("does not treat a bracketed number later in the note as a break", () => {
    const body = "Text first.\n[2]\nMore.";
    expect(splitSectionBreaks(body)).toEqual([
      { kind: "text", start: 0, text: body },
    ]);
  });

  it("leaves a dash line with no number beneath it as text", () => {
    const body = "a\n---\nb";
    expect(splitSectionBreaks(body)).toEqual([
      { kind: "text", start: 0, text: body },
    ]);
  });

  it("handles several breaks and a break at the very end", () => {
    const parts = splitSectionBreaks("[1]\na\n--\n[2]\nb\n--\n[3]");
    expect(parts.map((p) => p.kind)).toEqual([
      "break",
      "text",
      "break",
      "text",
      "break",
    ]);
  });

  it("records offsets that point back into the original body", () => {
    const body = "[1]\nab\n--\n[2]\ncd";
    for (const part of splitSectionBreaks(body)) {
      if (part.kind === "text") {
        expect(body.slice(part.start, part.start + part.text.length)).toBe(
          part.text,
        );
      }
    }
  });
});
