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
      previousNote={null}
      nextNote={null}
      onSelectNote={vi.fn()}
    />,
  );

/**
 * The hash stays on the pill. It was dropped once on the grounds that it is
 * body syntax rather than part of the name, which is true but beside the
 * point: the hash is how you *write* a tag in the body, not what a tag *is*.
 * Repeating it on the pill labels the mechanism rather than the thing, and
 * doubles up for anyone whose note already spells the tag out inline. The
 * pill's background and the group's accessible name carry the meaning.
 * These tests previously pinned the opposite; they are inverted, not deleted,
 * so the old behaviour cannot quietly return.
 */
describe("NoteEditor tag pills", () => {
  const pills = () =>
    Array.from(document.querySelectorAll(".tag")).map((el) =>
      el.textContent?.trim(),
    );

  it("renders each tag as a bare word with no hash in front of it", () => {
    renderEditor();

    expect(pills()).toEqual(["evaluation", "ambiguity"]);
  });

  it("keeps the hash out of the pill even when the body writes one", () => {
    renderEditor(mkNote({ tags: ["evaluation"], body: "about #evaluation" }));

    expect(pills()).toEqual(["evaluation"]);
    expect(document.querySelector(".editor__tags")?.textContent).not.toContain(
      "#",
    );
  });

  /**
   * Belt and braces: the hash is the visual marker, the group name is the
   * spoken one. Both should survive.
   */
  it("keeps the group named for readers who cannot see the hash", () => {
    renderEditor();

    expect(screen.getByRole("group", { name: "Tags" })).toBeInTheDocument();
  });

  it("renders no tag group at all for a note without tags", () => {
    renderEditor(mkNote({ tags: [] }));

    expect(screen.queryByRole("group", { name: "Tags" })).toBeNull();
    expect(pills()).toEqual([]);
  });
});
