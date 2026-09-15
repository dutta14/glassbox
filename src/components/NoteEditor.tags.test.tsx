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
 * The hash stays on the pill. It was dropped once on the grounds that it is
 * body syntax rather than part of the name, which is true but beside the
 * point: stripped of it the pills read as loose words sitting under the date,
 * with nothing but a faint background to say what they are. The group's
 * accessible name covers a screen reader; the hash is what covers everyone
 * else. Nothing tested this text before, which is how it came off in the
 * first place.
 */
describe("NoteEditor tag pills", () => {
  const pills = () =>
    Array.from(document.querySelectorAll(".tag")).map((el) =>
      el.textContent?.trim(),
    );

  it("prefixes each pill with the hash that marks it as a tag", () => {
    renderEditor();

    expect(pills()).toEqual(["#evaluation", "#ambiguity"]);
  });

  it("shows one hash per pill rather than doubling the one in the body", () => {
    renderEditor(mkNote({ tags: ["evaluation"], body: "about #evaluation" }));

    expect(pills()).toEqual(["#evaluation"]);
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
