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
      onScrollHandled={vi.fn()}
      previousNote={null}
      nextNote={null}
      onSelectNote={vi.fn()}
    />,
  );

/**
 * The date and tags used to sit between the title and the first line, the way
 * a blog post stamps itself. The editor now opens like a chapter: title, then
 * writing, with the housekeeping held back to the foot. These pin that order,
 * since it is the kind of thing a stray reorder undoes without failing
 * anything else.
 */
describe("NoteEditor chapter layout", () => {
  it("puts only the chapter rule between the title and the writing", () => {
    const { container } = renderEditor();
    const children = Array.from(
      container.querySelector(".editor__inner")?.children ?? [],
    );
    const at = (name: string) =>
      children.findIndex((el) => el.classList.contains(name));

    const title = at("editor__title");
    expect(title).toBeGreaterThanOrEqual(0);
    expect(at("editor__ornament")).toBe(title + 1);
    expect(at("editor__bodywrap")).toBe(title + 2);
  });

  it("keeps the chapter rule out of the accessibility tree", () => {
    const { container } = renderEditor();
    const ornament = container.querySelector(".editor__ornament");

    expect(ornament).not.toBeNull();
    expect(ornament).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the edited date below the writing rather than above it", () => {
    const { container } = renderEditor();
    const body = container.querySelector(".editor__bodywrap");
    const date = container.querySelector(".editor__edited");

    expect(body).not.toBeNull();
    expect(date).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING === the date comes after the body.
    expect(body!.compareDocumentPosition(date!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("gathers the date and the tags into one footer at the foot", () => {
    const { container } = renderEditor();
    const colophon = container.querySelector(".editor__colophon");

    expect(colophon).not.toBeNull();
    expect(colophon!.querySelector(".editor__edited")).not.toBeNull();
    expect(colophon!.querySelector(".editor__tags")).not.toBeNull();
  });

  it("renders no footer and no delete control, both of which moved to the rail", () => {
    const { container } = renderEditor();

    expect(container.querySelector(".editor__meta")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("exposes the edited date as a machine-readable time element", () => {
    renderEditor(mkNote({ updatedAt: "2026-03-04T05:06:07.000Z" }));
    const time = screen.getByText(/Edited/).querySelector("time");

    expect(time).not.toBeNull();
    expect(time!.getAttribute("dateTime")).toBe("2026-03-04T05:06:07.000Z");
  });
});
