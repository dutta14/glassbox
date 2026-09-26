import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import type { Book, Conversation, Note } from "../types";

/**
 * Wiring between the rail's search glyph and NoteSearchModal only. The modal's
 * own behaviour (matching, keyboard navigation, empty states) is covered
 * directly in NoteSearchModal.test.tsx.
 *
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

const renderRail = (
  overrides: {
    notes?: Note[];
    conversations?: Conversation[];
    books?: Book[];
    organizeMode?: "list" | "book";
  } = {},
) => {
  const onCreate = vi.fn();
  const onSelect = vi.fn();
  render(
    <NotesRail
      notes={overrides.notes ?? notes}
      selectedNoteId={null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={onSelect}
      onCreate={onCreate}
      onDeleteNote={vi.fn()}
      onToggleNoteFormat={vi.fn()}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      books={overrides.books ?? []}
      selectedBookId={null}
      bookNameByNoteId={new Map<string, string>()}
      onSelectBook={vi.fn()}
      onOpenBooks={vi.fn()}
      onOpenChapter={vi.fn()}
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
      organizeMode={overrides.organizeMode ?? "list"}
      onOrganizeChange={vi.fn()}
    />,
  );
  return { onCreate, onSelect };
};

const glyph = () => screen.getByRole("button", { name: "Search notes" });
const dialog = () => screen.getByRole("dialog");

describe("NotesRail search wiring", () => {
  /**
   * The glyph used to sit beside the "Notes" label. Role-based queries find it
   * wherever it lives, so its position needs asserting separately.
   */
  it("puts the search glyph in the top row beside the brand", () => {
    renderRail();
    const topRow = document.querySelector(".notes-rail__top-row");

    expect(topRow).not.toBeNull();
    expect(topRow!.contains(glyph())).toBe(true);
    expect(topRow!.textContent).toContain("Glassbox");
  });

  /* There are two section headers now, Chats and Notes. Targeting the
     heading and walking up means this keeps testing the Notes header rather
     than whichever one happens to come first in the DOM. */
  it("no longer keeps a search control beside the Notes heading", () => {
    renderRail();
    const section = screen
      .getByRole("heading", { name: "Notes" })
      .closest(".notes-rail__section");

    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("Notes");
    // The heading owns two buttons now: the accordion toggle and the organize
    // menu. Naming both, rather than counting them, keeps the claim about
    // search while leaving room for controls that are not search.
    const toggle = section!.querySelector("button[aria-expanded]");
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toContain("Notes");
    expect(
      section!.querySelector('[aria-label="Organize notes"]'),
    ).not.toBeNull();
    expect(section!.querySelector('[aria-label="Search notes"]')).toBeNull();
  });

  it("keeps the modal closed until the glyph is used", () => {
    renderRail();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(glyph()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the modal from the glyph and reflects that on the button", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(dialog()).toBeInTheDocument();
    expect(glyph()).toHaveAttribute("aria-expanded", "true");
  });

  it("announces the glyph as opening a dialog", () => {
    renderRail();

    expect(glyph()).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("hands the rail's notes to the modal", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(within(dialog()).getAllByRole("option")).toHaveLength(notes.length);
  });

  /** Dismissing must not drop focus onto the body; it goes back to the glyph. */
  it("returns focus to the glyph when the modal closes", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(glyph()).toHaveFocus();
  });

  it("passes a chosen note through to the rail's own onSelect", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderRail();

    await user.click(glyph());
    await user.click(within(dialog()).getByText("Sourdough"));

    expect(onSelect).toHaveBeenCalledWith("n2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * Search lives entirely in the modal. The rail list behind it must keep
   * showing every note, since filtering something the modal covers is invisible.
   */
  it("leaves the rail list unfiltered while the modal narrows its own results", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(
      screen.getByRole("combobox", { name: "Search notes" }),
      "sourdough",
    );

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
    expect(button).toHaveClass("notes-rail__new");
    expect(document.querySelectorAll(".notes-rail__new")).toHaveLength(1);
  });

  /**
   * The empty state used to carry its own blue call to action directly beneath
   * the new-note item, which meant two controls doing the same job a few
   * pixels apart. The rail's own item is the only one now.
   */
  it("leaves the empty state without a second create control", () => {
    renderRail({ notes: [] });

    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());

    expect(buttons).toContain("New note");
    expect(buttons).not.toContain("Create your first note");
    expect(document.querySelector(".notes-rail__empty-action")).toBeNull();
  });

  /**
   * Three sections share one rail, so an empty list has to say which list it
   * is by its copy alone. The headings that used to do that were removed
   * because an empty section was taller than a full one; the wording now
   * carries the whole job, and identical wording in two sections would leave
   * the reader unable to tell chats from books from notes.
   */
  it("gives each empty section wording that no other section repeats", () => {
    /* Arranged by book, because that is the only arrangement in which both
       sections can be empty at once. In one list the Books section is a
       single row into the Books page and has no empty state to read. */
    renderRail({
      notes: [],
      books: [],
      organizeMode: "book",
    });

    const bodyOf = (listId: string): string => {
      const list = document.getElementById(listId);
      if (!list) throw new Error(`no list ${listId}`);
      const body = list.querySelector(".notes-rail__empty-body");
      if (!body) throw new Error(`no empty state in ${listId}`);
      return body.textContent?.trim() ?? "";
    };

    const books = bodyOf("rail-books-list");
    const notes = bodyOf("rail-notes-list");

    expect(books).toBeTruthy();
    expect(notes).toBeTruthy();
    expect(new Set([books, notes]).size).toBe(2);
  });

  /* The heading was a second, larger copy of the same message stacked above
     the body, which is what made an empty section outgrow a full one. */
  it("renders an empty section as body copy alone, with no heading above it", () => {
    renderRail({ notes: [], books: [] });

    expect(document.querySelector(".notes-rail__empty-title")).toBeNull();
    expect(screen.queryByText("No notes yet")).toBeNull();
  });
});
