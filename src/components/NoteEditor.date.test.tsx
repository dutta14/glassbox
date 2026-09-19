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
      readAsset={async () => null}
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

  it("renders the written date below the writing rather than above it", () => {
    const { container } = renderEditor();
    const body = container.querySelector(".editor__bodywrap");
    const date = container.querySelector(".editor__written");

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
    expect(colophon!.querySelector(".editor__written")).not.toBeNull();
    expect(colophon!.querySelector(".editor__tags")).not.toBeNull();
  });

  it("renders no footer and no delete control, both of which moved to the rail", () => {
    const { container } = renderEditor();

    expect(container.querySelector(".editor__meta")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("exposes the written date as a machine-readable time element", () => {
    renderEditor(mkNote({ createdAt: "2026-03-04T05:06:07.000Z" }));
    const time = screen.getByText(/Written/).querySelector("time");

    expect(time).not.toBeNull();
    expect(time!.getAttribute("dateTime")).toBe("2026-03-04T05:06:07.000Z");
  });
});

/* Notes here go back to 2010, so a date without a year is not just terse, it is
   wrong: it reads as this year's. */
describe("the written year", () => {
  const renderAt = (createdAt: string) => {
    renderEditor(mkNote({ createdAt }));
    return screen.getByText(/Written/).textContent ?? "";
  };

  it("names the year of a note written years ago", () => {
    expect(renderAt("2010-12-28T10:00:00.000Z")).toContain("2010");
  });

  it("names the year even for a note written earlier this year", () => {
    const thisYear = new Date().getFullYear();
    const text = renderAt(`${thisYear}-01-05T10:00:00.000Z`);

    expect(text).toContain(String(thisYear));
  });

  /* Anything inside the relative window is still phrased in the relative way,
     where a year would be noise. */
  it("still says just now for a note started a moment ago", () => {
    expect(renderAt(new Date().toISOString())).toContain("just now");
  });
});

/**
 * The foot shows when the note was written, not when it was last touched. An
 * archive of poems going back to 2010 gets edited constantly for typos and
 * tags, and stamping each one with the afternoon it was corrected erases the
 * only date a reader cares about. This is easy to regress, because both
 * timestamps are on the note and either one renders without complaint.
 */
describe("the date at the foot of a note", () => {
  it("shows the year it was written, not the year it was last edited", () => {
    renderEditor(
      mkNote({
        createdAt: "2011-01-29T16:30:39.000Z",
        updatedAt: "2026-09-17T12:00:00.000Z",
      }),
    );

    const text = screen.getByText(/Written/).textContent ?? "";
    expect(text).toContain("2011");
    expect(text).not.toContain("2026");
  });

  it("points the time element at createdAt so the machine-readable date agrees", () => {
    renderEditor(
      mkNote({
        createdAt: "2011-01-29T16:30:39.000Z",
        updatedAt: "2026-09-17T12:00:00.000Z",
      }),
    );

    const time = screen.getByText(/Written/).querySelector("time");
    expect(time!.getAttribute("dateTime")).toBe("2011-01-29T16:30:39.000Z");
  });

  it("does not describe an old note as freshly edited after a typo fix", () => {
    renderEditor(
      mkNote({
        createdAt: "2011-01-29T16:30:39.000Z",
        updatedAt: new Date().toISOString(),
      }),
    );

    expect(screen.getByText(/Written/).textContent).not.toContain("just now");
  });
});
