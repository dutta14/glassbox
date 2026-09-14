import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import type { Note } from "../types";

/**
 * The search glyph opens a modal note picker rather than an inline field.
 * Nothing covered NotesRail before this file, which is how a stale
 * `.notes-rail__new` selector in App.tsx survived a rename with a green build
 * and a green suite.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string, body: string): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const notes = [
  mkNote("n1", "Postgres tuning", "shared_buffers should be 25% of RAM"),
  mkNote("n2", "Sourdough", "the starter was underfed"),
];

const renderRail = (override: { notes?: Note[] } = {}) => {
  const onCreate = vi.fn();
  const onSelect = vi.fn();
  render(
    <NotesRail
      notes={override.notes ?? notes}
      selectedNoteId={null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={onSelect}
      onCreate={onCreate}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
    />,
  );
  return { onCreate, onSelect };
};

const glyph = () => screen.getByRole("button", { name: "Search notes" });
const dialog = () => screen.getByRole("dialog");
const field = () => screen.getByRole("combobox", { name: "Search notes" });
const options = () => within(dialog()).getAllByRole("option");

describe("NotesRail search modal", () => {
  it("keeps the modal closed until the glyph is used", () => {
    renderRail();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(glyph()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the modal and moves focus into the search field", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(dialog()).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(glyph()).toHaveAttribute("aria-expanded", "true");
  });

  /** The modal is a note picker first and a search box second. */
  it("lists every note when it opens, before anything is typed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(options()).toHaveLength(2);
    expect(within(dialog()).getByText("Postgres tuning")).toBeInTheDocument();
    expect(within(dialog()).getByText("Sourdough")).toBeInTheDocument();
  });

  it("narrows the list to matches as the user types", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "sourdough");

    expect(options()).toHaveLength(1);
    expect(within(dialog()).getByText("Sourdough")).toBeInTheDocument();
  });

  it("matches on body text, not only on the title", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "shared_buffers");

    expect(options()).toHaveLength(1);
    expect(within(dialog()).getByText("Postgres tuning")).toBeInTheDocument();
  });

  it("explains an empty result instead of showing a blank list", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "kubernetes");

    expect(within(dialog()).queryAllByRole("option")).toHaveLength(0);
    expect(within(dialog()).getByText("No matches")).toBeInTheDocument();
  });

  it("opens the clicked note and closes the modal", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderRail();

    await user.click(glyph());
    await user.click(within(dialog()).getByText("Sourdough"));

    expect(onSelect).toHaveBeenCalledWith("n2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** Focus stays in the input so typing keeps working while arrows move down. */
  it("moves the highlight with arrow keys and opens the highlighted note on Enter", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderRail();

    await user.click(glyph());
    await user.keyboard("{ArrowDown}");

    expect(options()[1]).toHaveAttribute("aria-selected", "true");
    expect(field()).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("n2");
  });

  it("wraps the highlight from the last note back to the first", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.keyboard("{ArrowDown}{ArrowDown}");

    expect(options()[0]).toHaveAttribute("aria-selected", "true");
  });

  /**
   * A query that shrinks the list must not leave the highlight pointing past
   * the end, which would make Enter a no-op.
   */
  it("pulls the highlight back into range when the result set shrinks", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderRail();

    await user.click(glyph());
    await user.keyboard("{ArrowDown}");
    await user.type(field(), "postgres");

    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("n1");
  });

  it("closes on Escape and returns focus to the glyph", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(glyph()).toHaveFocus();
  });

  it("closes when the backdrop behind the modal is clicked", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    const backdrop = document.querySelector(".note-search__backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks itself as a dialog opener so the glyph announces what it does", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(glyph()).toHaveAttribute("aria-haspopup", "dialog");

    await user.click(glyph());
    expect(dialog()).toHaveAttribute("aria-modal", "true");
  });

  it("leaves the rail list unfiltered while the modal narrows its own results", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "sourdough");

    const rail = screen.getByRole("navigation", { name: "Note list" });
    expect(within(rail).getByText("Postgres tuning")).toBeInTheDocument();
    expect(within(rail).getByText("Sourdough")).toBeInTheDocument();
  });

  it("still exposes the new-note button as a separate control", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRail();

    await user.click(screen.getByRole("button", { name: "New note" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  /**
   * App.tsx reconciles focus after a delete by querying this class. Renaming
   * it without updating App.tsx drops focus to the body, which is the failure
   * mode a11y finding B3 described.
   */
  it("marks the new-note button with the class App.tsx uses to restore focus", () => {
    renderRail();

    const button = screen.getByRole("button", { name: "New note" });
    expect(button).toHaveClass("notes-rail__action--new");
    expect(document.querySelectorAll(".notes-rail__action--new")).toHaveLength(
      1,
    );
  });
});
