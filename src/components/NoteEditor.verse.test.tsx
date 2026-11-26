import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NoteEditor } from "./NoteEditor";
import type { Note } from "../types";

const POEM = "[1]\n\nfirst line\nsecond line\n\n---\n[2]\n\nthird line";

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "A poem",
  body: POEM,
  tags: [],
  format: "verse",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const renderEditor = (note: Note) =>
  render(
    <NoteEditor
      readAsset={async () => null}
      note={note}
      scrollToOffset={null}
      previousNote={null}
      nextNote={null}
      onChangeTitle={vi.fn()}
      onChangeBody={vi.fn()}
      onScrollHandled={vi.fn()}
      onSelectNote={vi.fn()}
    />,
  );

describe("NoteEditor — numbered sections in verse", () => {
  it("draws the opening [1] and the divided [2] in a verse note", () => {
    const { container } = renderEditor(makeNote());
    const breaks = container.querySelectorAll(".editor__break");
    expect([...breaks].map((b) => b.textContent)).toEqual(["1", "2"]);
    expect(breaks[0]).toHaveClass("editor__break--opening");
    expect(breaks[1]).not.toHaveClass("editor__break--opening");
  });

  it("keeps the verse layout while drawing the breaks", () => {
    const { container } = renderEditor(makeNote());
    expect(container.querySelector(".editor__bodywrap--verse")).not.toBeNull();
    expect(container.querySelector(".editor__read")).toHaveTextContent(
      "first line",
    );
    expect(container.querySelector(".editor__read")).not.toHaveAttribute(
      "data-dropcap",
    );
  });
});
