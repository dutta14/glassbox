import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NotesRail } from "./NotesRail";
import type { Book, Note } from "../types";

/* Local time, so the year and day hold in any timezone the suite runs in. */
const mk = (id: string, title: string, createdAt: string): Note => ({
  id,
  title,
  body: "",
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

const recent = mk("n1", "Postgres tuning", "2025-06-15T12:00:00");
const older = mk("n3", "Sourdough", "2023-03-02T12:00:00");
const chapter = mk("n2", "First frost", "2025-02-01T12:00:00");
const undated = mk("n4", "Scrap", "not a date");

const book: Book = {
  id: "b1",
  title: "Autumn",
  chapterIds: ["n2"],
  unnumberedIds: [],
  createdAt: "2025-01-01T12:00:00",
  updatedAt: "2025-01-01T12:00:00",
};

const props = (
  overrides: Partial<ComponentProps<typeof NotesRail>> = {},
): ComponentProps<typeof NotesRail> => ({
  notes: [recent, chapter, older, undated],
  selectedNoteId: null,
  hasSampleNotes: false,
  folderState: "unsupported",
  folderName: null,
  connectError: null,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  books: [book],
  selectedBookId: null,
  bookNameByNoteId: new Map([["n2", "Autumn"]]),
  onSelectBook: vi.fn(),
  onAddNoteToBook: vi.fn(),
  onDeleteBook: vi.fn(),
  onDeleteNote: vi.fn(),
  onToggleNoteFormat: vi.fn(),
  onDeleteSamples: vi.fn(),
  onConnectFolder: vi.fn(),
  onReconnectFolder: vi.fn(),
  onDisconnectFolder: vi.fn(),
  theme: "dark",
  onToggleTheme: vi.fn(),
  ...overrides,
});

const renderRail = (
  overrides: Partial<ComponentProps<typeof NotesRail>> = {},
) => render(<NotesRail {...props(overrides)} />);

const yearToggle = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("NotesRail tabs", () => {
  it("offers Posts and Collections as tabs, with Posts open on a first visit", () => {
    renderRail();

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(tab("Posts")).toHaveAttribute("aria-selected", "true");
    expect(tab("Collections")).toHaveAttribute("aria-selected", "false");
  });

  it("no longer carries a separate Collections link in the action links", () => {
    renderRail();

    const links = document.querySelector<HTMLElement>(".notes-rail__links")!;
    expect(within(links).queryByText("Collections")).not.toBeInTheDocument();
  });

  it("labels the one tabpanel by the open tab", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(screen.getByRole("tabpanel", { name: "Posts" })).toBeInTheDocument();
    await user.click(tab("Collections"));
    expect(
      screen.getByRole("tabpanel", { name: "Collections" }),
    ).toBeInTheDocument();
  });

  it("moves between the tabs with the arrow keys, wrapping", async () => {
    const user = userEvent.setup();
    renderRail();

    tab("Posts").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Collections")).toHaveFocus();
    expect(tab("Collections")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(tab("Posts")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("Collections")).toHaveFocus();
  });

  it("only puts the open tab in the tab order", () => {
    renderRail();

    expect(tab("Posts")).toHaveAttribute("tabindex", "0");
    expect(tab("Collections")).toHaveAttribute("tabindex", "-1");
  });

  it("remembers the open tab across a remount", async () => {
    const user = userEvent.setup();
    const first = renderRail();

    await user.click(tab("Collections"));
    first.unmount();
    renderRail();

    expect(tab("Collections")).toHaveAttribute("aria-selected", "true");
    expect(localStorage.getItem("glassbox.railTab.v1")).toBe("collections");
  });

  it("falls back to Posts when the stored tab is not one it knows", () => {
    localStorage.setItem("glassbox.railTab.v1", "elsewhere");
    renderRail();

    expect(tab("Posts")).toHaveAttribute("aria-selected", "true");
  });

  it("still switches tabs when localStorage throws on write", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderRail();

    await user.click(tab("Collections"));

    expect(tab("Collections")).toHaveAttribute("aria-selected", "true");
  });
});

describe("NotesRail Posts tab", () => {
  it("groups posts under year headings, newest year first, undated last", () => {
    renderRail();

    const labels = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.querySelector(".notes-rail__title-label")?.textContent);

    expect(labels).toEqual(["2025", "2023", "Undated"]);
  });

  it("keeps a post that is in a collection out of Posts", () => {
    renderRail();

    expect(
      screen.getByRole("button", { name: "Postgres tuning" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /First frost/ }),
    ).not.toBeInTheDocument();
    // Its year does not count it either: 2025 holds one post, not two.
    expect(
      yearToggle("2025").querySelector(".notes-rail__title-count"),
    ).toHaveTextContent("1");
  });

  it("shows the month and day under a post, without the year", () => {
    renderRail();

    const row = screen
      .getByRole("button", { name: "Postgres tuning" })
      .closest("li")!;
    expect(row).toHaveTextContent("June 15");
    expect(row).not.toHaveTextContent("2025");
  });

  it("gives an undated post no date line", () => {
    renderRail();

    const row = screen.getByRole("button", { name: "Scrap" }).closest("li")!;
    expect(row.querySelector(".note-item__meta")).toBeNull();
  });

  it("folds and reopens a year from its heading", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(yearToggle("2023")).toHaveAttribute("aria-expanded", "true");
    await user.click(yearToggle("2023"));

    expect(yearToggle("2023")).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Sourdough" }),
    ).not.toBeInTheDocument();
    // The other year is untouched.
    expect(
      screen.getByRole("button", { name: "Postgres tuning" }),
    ).toBeInTheDocument();

    await user.click(yearToggle("2023"));
    expect(
      screen.getByRole("button", { name: "Sourdough" }),
    ).toBeInTheDocument();
  });

  it("points each heading at the list it controls, and labels the list by it", () => {
    renderRail();

    const list = document.getElementById(
      yearToggle("2025").getAttribute("aria-controls")!,
    )!;

    expect(list.tagName).toBe("UL");
    expect(list).toHaveAccessibleName(/^2025/);
  });

  it("forces open the year holding the open post even when it is folded", async () => {
    const user = userEvent.setup();
    const view = renderRail();

    await user.click(yearToggle("2023"));
    view.rerender(<NotesRail {...props({ selectedNoteId: "n3" })} />);

    expect(yearToggle("2023")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Sourdough" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows the sample banner above the first year", () => {
    renderRail({ hasSampleNotes: true });

    expect(
      screen.getByRole("button", { name: "Delete all samples" }),
    ).toBeInTheDocument();
  });

  it("says so when every note is in a collection", () => {
    renderRail({ notes: [chapter] });

    expect(
      screen.getByText("Every note is in a collection."),
    ).toBeInTheDocument();
  });

  it("says to start one when there are no notes at all", () => {
    renderRail({ notes: [], books: [], bookNameByNoteId: new Map() });

    expect(screen.getByText("Use New note to start one.")).toBeInTheDocument();
  });
});

describe("NotesRail Collections tab", () => {
  it("lists the collections, and no posts or headings, under the tab", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(tab("Collections"));

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("button", { name: /^Autumn/ }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Postgres tuning" }),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByRole("heading")).not.toBeInTheDocument();
  });

  it("says so when there are no collections", async () => {
    const user = userEvent.setup();
    renderRail({ books: [] });

    await user.click(tab("Collections"));

    expect(
      screen.getByText("Add a note to a collection to start one."),
    ).toBeInTheDocument();
  });
});
