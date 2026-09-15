import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteEditor } from "./NoteEditor";
import type { Note } from "../types";

const mkNote = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "A title",
  body: "Some body text",
  tags: ["work"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

const renderEditor = (note: Note = mkNote()) =>
  render(
    <NoteEditor
      note={note}
      scrollToOffset={null}
      onChangeTitle={vi.fn()}
      onChangeBody={vi.fn()}
      onDelete={vi.fn()}
      onScrollHandled={vi.fn()}
    />,
  );

describe("NoteEditor edited date placement", () => {
  it("renders the edited date immediately after the title field", () => {
    const { container } = renderEditor();
    const inner = container.querySelector(".editor__inner");
    const children = Array.from(inner?.children ?? []);
    const titleIndex = children.findIndex((el) =>
      el.classList.contains("editor__title"),
    );
    const dateIndex = children.findIndex((el) =>
      el.classList.contains("editor__edited"),
    );

    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(dateIndex).toBe(titleIndex + 1);
  });

  it("renders the edited date above the body rather than below it", () => {
    const { container } = renderEditor();
    const date = container.querySelector(".editor__edited");
    const body = container.querySelector(".editor__body");

    expect(date).not.toBeNull();
    expect(body).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING === the body comes after the date.
    expect(date!.compareDocumentPosition(body!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("no longer renders the edited date inside the footer", () => {
    const { container } = renderEditor();
    const footer = container.querySelector(".editor__meta");

    expect(footer).not.toBeNull();
    expect(footer!.querySelector(".editor__edited")).toBeNull();
  });

  it("exposes the edited date as a machine-readable time element", () => {
    renderEditor(mkNote({ updatedAt: "2026-03-04T05:06:07.000Z" }));
    const time = screen.getByText(/Edited/).querySelector("time");

    expect(time).not.toBeNull();
    expect(time!.getAttribute("dateTime")).toBe("2026-03-04T05:06:07.000Z");
  });
});
