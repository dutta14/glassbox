import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteEditor } from "./NoteEditor";
import type { Note } from "../types";

const mkNote = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "grading fog",
  body: "Some body text",
  tags: ["evaluation", "ambiguity"],
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
    />,
  );

/**
 * The hash is how a tag is written into the body, not what a tag is called.
 * Repeating it on the pill showed the user the syntax they had already typed.
 * Nothing covered the pill's text before this, so the prefix could have come
 * back without a single test noticing.
 */
describe("NoteEditor tag pills", () => {
  const pills = () =>
    Array.from(document.querySelectorAll(".tag")).map((el) =>
      el.textContent?.trim(),
    );

  it("labels each pill with the bare tag name", () => {
    renderEditor();

    expect(pills()).toEqual(["evaluation", "ambiguity"]);
  });

  it("carries no hash anywhere in the tag group", () => {
    renderEditor();

    const group = screen.getByRole("group", { name: "Tags" });

    expect(group.textContent).not.toContain("#");
  });

  /**
   * The hash was the only thing marking these as tags rather than loose words
   * sitting under the date, so the group's name is doing that job alone now.
   */
  it("keeps the group named so the pills are still identifiable as tags", () => {
    renderEditor();

    expect(screen.getByRole("group", { name: "Tags" })).toBeInTheDocument();
  });

  it("renders no tag group at all for a note without tags", () => {
    renderEditor(mkNote({ tags: [] }));

    expect(screen.queryByRole("group", { name: "Tags" })).toBeNull();
    expect(pills()).toEqual([]);
  });
});
