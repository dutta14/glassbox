import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteListItem } from "./NoteListItem";
import type { Note } from "../types";

/**
 * The rail row had no tests at all, so stripping its date, tags and excerpt
 * broke nothing and proved nothing. These lock in the single-line contract.
 */

const mkNote = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Postgres tuning",
  body: "shared_buffers should be 25% of RAM",
  tags: ["database", "performance"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const renderItem = (note: Note = mkNote(), isSelected = false) => {
  const onSelect = vi.fn();
  const onMenuOpenChange = vi.fn();
  const onRequestDelete = vi.fn();
  render(
    <NoteListItem
      note={note}
      isSelected={isSelected}
      menuOpen={false}
      onSelect={onSelect}
      onMenuOpenChange={onMenuOpenChange}
      onRequestDelete={onRequestDelete}
      onToggleFormat={vi.fn()}
    />,
    { wrapper: ({ children }) => <ul>{children}</ul> },
  );
  return { onSelect, onMenuOpenChange, onRequestDelete };
};

/** The row shares its list item with the actions menu trigger, so "the
    button" is no longer unambiguous. */
const row = () =>
  screen
    .getAllByRole("button")
    .find((b) => !b.hasAttribute("aria-haspopup")) as HTMLElement;

describe("NoteListItem", () => {
  it("renders the note title", () => {
    renderItem();

    expect(row()).toHaveTextContent("Postgres tuning");
  });

  it("falls back to Untitled when the title is only whitespace", () => {
    renderItem(mkNote({ title: "   " }));

    expect(row()).toHaveTextContent("Untitled");
  });

  describe("single-line contract", () => {
    /**
     * The row shows the title and nothing else, the way a chat app lists
     * conversations. Detail lives in the search modal instead.
     */
    it("renders the title as the row's entire content", () => {
      renderItem();

      expect(row().textContent).toBe("Postgres tuning");
    });

    it("renders no date", () => {
      renderItem();

      expect(row().querySelector("time")).toBeNull();
    });

    it("renders no tags, even though the note has them", () => {
      renderItem();

      expect(row().querySelector(".tag")).toBeNull();
      expect(row()).not.toHaveTextContent("database");
    });

    it("renders no body excerpt", () => {
      renderItem();

      expect(row()).not.toHaveTextContent("shared_buffers");
    });
  });

  it("marks the selected note with aria-current", () => {
    renderItem(mkNote(), true);

    expect(row()).toHaveAttribute("aria-current", "true");
  });

  it("leaves aria-current off an unselected note", () => {
    renderItem();

    expect(row()).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect when the row is clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderItem();

    await user.click(row());

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  /**
   * App.tsx restores focus after a delete by querying this attribute. Dropping
   * it would send focus to the body instead of the surviving note.
   */
  it("tags the row with the note id App.tsx uses to restore focus", () => {
    renderItem(mkNote({ id: "abc-123" }));

    expect(row()).toHaveAttribute("data-note-id", "abc-123");
  });
});
