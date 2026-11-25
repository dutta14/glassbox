import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import type { Book, Conversation, Note } from "../types";

/**
 * Inline search in the rail: the field, the flat result list, highlighting and
 * how it opens and closes. The matcher itself is covered in
 * utils/searchNotes.test.ts.
 *
 * Nothing covered NotesRail before this file, which is how a stale
 * `.notes-rail__new` selector in App.tsx survived a rename with a green build
 * and a green suite.
 */

// Noon, so the year and day hold in any timezone.
const iso = "2026-01-01T12:00:00.000Z";

const mkNote = (
  id: string,
  title: string,
  body: string,
  tags: string[] = [],
  createdAt = iso,
): Note => ({
  id,
  title,
  body,
  tags,
  createdAt,
  updatedAt: createdAt,
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
    bookNames?: Map<string, string>;
    selectedNoteId?: string | null;
  } = {},
) => {
  const onCreate = vi.fn();
  const onSelect = vi.fn();
  render(
    <NotesRail
      notes={overrides.notes ?? notes}
      selectedNoteId={overrides.selectedNoteId ?? null}
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
      bookNameByNoteId={overrides.bookNames ?? new Map<string, string>()}
      onSelectBook={vi.fn()}
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
    />,
  );
  return { onCreate, onSelect };
};

const glyph = () => screen.getByRole("button", { name: "Search notes" });
const field = () => screen.getByRole("searchbox", { name: "Search notes" });
const results = () => screen.getByRole("region", { name: "Search results" });
const rowTitles = () =>
  within(results())
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".note-item__title")?.textContent);

describe("NotesRail search wiring", () => {
  /**
   * The glyph used to sit beside the "Notes" label, then in the masthead row.
   * Role-based queries find it wherever it lives, so its position needs
   * asserting separately.
   */
  it("puts Search in the links row, under the masthead", () => {
    renderRail();
    const mast = document.querySelector(".notes-rail__mast");
    const links = document.querySelector(".notes-rail__links");

    expect(mast).not.toBeNull();
    expect(links).not.toBeNull();
    expect(mast!.textContent).toContain("Glassbox");
    expect(links!.contains(glyph())).toBe(true);
    expect(glyph()).toHaveTextContent("Search");
  });

  it("keeps the search control out of the year headings", () => {
    renderRail();
    const headings = screen.getAllByRole("heading", { level: 3 });

    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      expect(heading.querySelector('[aria-label="Search notes"]')).toBeNull();
    }
  });

  it("keeps the field closed and the tabs shown until Search is used", () => {
    renderRail();

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("swaps New and Search for the field, and hides the tabs, when Search is used", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(field()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "New note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search notes" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for a query before showing anything", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());

    expect(
      within(results()).getByText("Search every post and collection."),
    ).toBeInTheDocument();
    expect(within(results()).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows a flat list of matches with a polite count", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "o");

    expect(rowTitles()).toEqual(["Postgres tuning", "Sourdough"]);
    expect(within(results()).queryAllByRole("heading")).toHaveLength(0);
    const count = within(results()).getByText("2 results");
    expect(count.parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("uses the singular for one result", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "sourdough");

    expect(within(results()).getByText("1 result")).toBeInTheDocument();
  });

  it("names the query when nothing matches", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "zzz");

    expect(
      within(results()).getByText("Nothing matches “zzz”."),
    ).toBeInTheDocument();
  });

  it("searches notes inside collections too and names the collection", async () => {
    const user = userEvent.setup();
    renderRail({
      bookNames: new Map([["n2", "Bread"]]),
    });

    await user.click(glyph());
    await user.type(field(), "sourdough");

    const row = within(results()).getByRole("button", { name: /^Sourdough/ });
    expect(row).toHaveAccessibleName("Sourdough, in Bread");
    expect(row.querySelector(".note-item__meta")?.textContent).toMatch(
      /January 1, 2026 · Bread$/,
    );
  });

  it("lists matches newest first across years, with the year on each date line", async () => {
    const user = userEvent.setup();
    renderRail({
      notes: [
        mkNote("old", "Pool old", "", [], "2019-05-03T12:00:00.000Z"),
        mkNote("new", "Pool new", "", [], "2024-11-20T12:00:00.000Z"),
        mkNote("mid", "Pool mid", "", [], "2022-02-14T12:00:00.000Z"),
      ],
    });

    await user.click(glyph());
    await user.type(field(), "pool");

    expect(rowTitles()).toEqual(["Pool new", "Pool mid", "Pool old"]);
    const meta = within(results())
      .getAllByRole("listitem")
      .map((li) => li.querySelector(".note-item__meta")?.textContent);
    expect(meta).toEqual([
      expect.stringMatching(/2024$/),
      expect.stringMatching(/2022$/),
      expect.stringMatching(/2019$/),
    ]);
  });

  it("marks every occurrence of the query in a title", async () => {
    const user = userEvent.setup();
    renderRail({ notes: [mkNote("n1", "Ship it, then ship again", "")] });

    await user.click(glyph());
    await user.type(field(), "ship");

    const marks = results().querySelectorAll(".note-item__title mark");
    expect(Array.from(marks).map((m) => m.textContent)).toEqual([
      "Ship",
      "ship",
    ]);
    expect(results().querySelector(".note-item__snippet")).toBeNull();
  });

  it("shows one marked body line when only the body matches", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "underfed");

    const snippet = results().querySelector(".note-item__snippet");
    expect(snippet).toHaveTextContent("the starter was underfed");
    expect(snippet!.querySelector("mark")).toHaveTextContent("underfed");
    expect(results().querySelector(".note-item__title mark")).toBeNull();
  });

  it("matches on tags without inventing a snippet", async () => {
    const user = userEvent.setup();
    renderRail({
      notes: [mkNote("n1", "Sourdough", "the starter", ["baking"])],
    });

    await user.click(glyph());
    await user.type(field(), "baking");

    expect(rowTitles()).toEqual(["Sourdough"]);
    expect(results().querySelector(".note-item__snippet")).toBeNull();
  });

  it("leaves the accessible name of a row as the title, marks or not", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "underfed");

    expect(
      within(results()).getByRole("button", { name: "Sourdough" }),
    ).toBeInTheDocument();
  });

  it("opens a chosen note and keeps the search open", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderRail();

    await user.click(glyph());
    await user.type(field(), "sourdough");
    await user.click(
      within(results()).getByRole("button", { name: /^Sourdough/ }),
    );

    expect(onSelect).toHaveBeenCalledWith("n2");
    expect(field()).toHaveValue("sourdough");
  });

  it("closes on Escape, brings the tabs back and returns focus to Search", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "sour");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(glyph()).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("closes from the esc button and clears the query for next time", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(glyph());
    await user.type(field(), "sour");
    await user.click(screen.getByRole("button", { name: "Close search" }));
    await user.click(glyph());

    expect(field()).toHaveValue("");
    expect(
      within(results()).getByText("Search every post and collection."),
    ).toBeInTheDocument();
  });

  it("restores the previous tab and folded years after search closes", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    renderRail({ notes: [mkNote("a", "Alpha", "")] });

    await user.click(screen.getByRole("button", { name: /2026/ }));
    await user.click(screen.getByRole("tab", { name: "Collections" }));
    await user.click(glyph());
    await user.type(field(), "alpha");
    await user.keyboard("{Escape}");

    expect(screen.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "Posts" }));
    expect(screen.getByRole("button", { name: /2026/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    localStorage.clear();
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

    expect(buttons).toContain("New");
    expect(buttons).not.toContain("Create your first note");
    expect(document.querySelector(".notes-rail__empty-action")).toBeNull();
  });

  /**
   * Posts and Collections share one rail, so an empty list has to say which
   * list it is by its copy alone.
   */
  it("gives each empty tab wording that the other does not repeat", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    renderRail({ notes: [], books: [] });

    const bodyOf = (): string =>
      screen.getByRole("tabpanel").querySelector(".notes-rail__empty-body")
        ?.textContent ?? "";

    const posts = bodyOf();
    await user.click(screen.getByRole("tab", { name: "Collections" }));
    const collections = bodyOf();

    expect(posts).toBeTruthy();
    expect(collections).toBeTruthy();
    expect(posts).not.toBe(collections);
    localStorage.clear();
  });

  /* The heading was a second, larger copy of the same message stacked above
     the body, which is what made an empty section outgrow a full one. */
  it("renders an empty section as body copy alone, with no heading above it", () => {
    renderRail({ notes: [], books: [] });

    expect(document.querySelector(".notes-rail__empty-title")).toBeNull();
    expect(screen.queryByText("No notes yet")).toBeNull();
  });
});
