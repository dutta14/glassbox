import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NotesRail } from "./NotesRail";
import type { Book, Note } from "../types";

const mkBook = (
  id: string,
  title: string,
  chapterIds: string[],
  updatedAt: string,
): Book => ({
  id,
  title,
  chapterIds,
  unnumberedIds: [],
  createdAt: updatedAt,
  updatedAt,
});

const note: Note = {
  id: "n1",
  title: "Postgres tuning",
  body: "",
  tags: [],
  createdAt: "2025-06-15T12:00:00",
  updatedAt: "2025-06-15T12:00:00",
};

/* Already in newest-updated-first order, as useBooks hands them over. */
const BOOKS = [
  mkBook("b1", "Winter drafts", [], "2025-03-01T12:00:00"),
  mkBook("b2", "Autumn", ["c1"], "2024-11-01T12:00:00"),
  mkBook("b3", "Spring", ["c2", "c3", "c4"], "2023-04-01T12:00:00"),
];

const props = (
  overrides: Partial<ComponentProps<typeof NotesRail>> = {},
): ComponentProps<typeof NotesRail> => ({
  notes: [note],
  selectedNoteId: null,
  hasSampleNotes: false,
  folderState: "unsupported",
  folderName: null,
  connectError: null,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  books: BOOKS,
  selectedBookId: null,
  bookNameByNoteId: new Map(),
  onSelectBook: vi.fn(),
  onAddNoteToBook: vi.fn(),
  onDeleteBook: vi.fn(),
  onCreateBook: vi.fn(),
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
) => {
  const p = props(overrides);
  return { ...render(<NotesRail {...p} />), p };
};

const openCollections = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("tab", { name: "Collections" }));

const newLink = () => screen.getByRole("button", { name: "New collection" });
const nameField = () =>
  screen.getByRole("textbox", { name: "Collection name" });

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("NotesRail Collections list", () => {
  it("lists collections flat, in the order given, each with its chapter count", async () => {
    const user = userEvent.setup();
    renderRail();
    await openCollections(user);

    const panel = screen.getByRole("tabpanel");
    const rows = within(panel).getAllByRole("listitem");

    expect(
      rows.map((r) => r.querySelector(".note-item__title")?.textContent),
    ).toEqual(["Winter drafts", "Autumn", "Spring"]);
    expect(
      rows.map((r) => r.querySelector(".note-item__meta")?.textContent),
    ).toEqual(["Empty", "1 chapter", "3 chapters"]);
    expect(within(panel).queryByRole("heading")).not.toBeInTheDocument();
    // No expander and no chapter rows underneath.
    expect(
      within(panel).queryByRole("button", { name: /^(Expand|Collapse)/ }),
    ).not.toBeInTheDocument();
    expect(within(panel).getAllByRole("list")).toHaveLength(1);
  });

  it("marks only the open collection and opens one on click", async () => {
    const user = userEvent.setup();
    const { p } = renderRail({ selectedBookId: "b2" });
    await openCollections(user);

    expect(screen.getByRole("button", { name: /^Autumn/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Spring/ })).not.toHaveAttribute(
      "aria-current",
    );

    await user.click(screen.getByRole("button", { name: /^Spring/ }));
    expect(p.onSelectBook).toHaveBeenCalledWith("b3");
  });

  it("offers only Delete collection in a collection row's menu", async () => {
    const user = userEvent.setup();
    renderRail();
    await openCollections(user);

    await user.click(
      screen.getByRole("button", { name: "More actions for Autumn" }),
    );

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Delete collection"]);
  });

  it("asks before deleting a collection, says its posts stay, and deletes on confirm", async () => {
    const user = userEvent.setup();
    const { p } = renderRail();
    await openCollections(user);

    await user.click(
      screen.getByRole("button", { name: "More actions for Autumn" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Delete collection" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Every post in it stays in your library/);
    expect(p.onDeleteBook).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete collection" }),
    );
    expect(p.onDeleteBook).toHaveBeenCalledWith("b2");
  });
});

describe("NotesRail New collection", () => {
  it("sits under the list and turns into a named field, focused", async () => {
    const user = userEvent.setup();
    renderRail();
    await openCollections(user);

    await user.click(newLink());

    expect(nameField()).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "New collection" }),
    ).not.toBeInTheDocument();
  });

  it("creates the collection on Enter with the trimmed name", async () => {
    const user = userEvent.setup();
    const { p } = renderRail();
    await openCollections(user);

    await user.click(newLink());
    await user.type(nameField(), "  Summer notes  {Enter}");

    expect(p.onCreateBook).toHaveBeenCalledExactlyOnceWith("Summer notes");
    expect(newLink()).toBeInTheDocument();
  });

  it("ignores an empty name and keeps the field open", async () => {
    const user = userEvent.setup();
    const { p } = renderRail();
    await openCollections(user);

    await user.click(newLink());
    await user.type(nameField(), "   {Enter}");

    expect(p.onCreateBook).not.toHaveBeenCalled();
    expect(nameField()).toBeInTheDocument();
  });

  it("cancels on Escape and hands focus back to the link", async () => {
    const user = userEvent.setup();
    const { p } = renderRail();
    await openCollections(user);

    await user.click(newLink());
    await user.type(nameField(), "Half typed{Escape}");

    expect(p.onCreateBook).not.toHaveBeenCalled();
    expect(newLink()).toHaveFocus();
  });

  it("cancels from the esc button", async () => {
    const user = userEvent.setup();
    const { p } = renderRail();
    await openCollections(user);

    await user.click(newLink());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(p.onCreateBook).not.toHaveBeenCalled();
    expect(newLink()).toBeInTheDocument();
  });

  it("shows the empty message and the link when there are no collections", async () => {
    const user = userEvent.setup();
    renderRail({ books: [] });
    await openCollections(user);

    expect(
      screen.getByText(
        "No collections yet. Add a post to a collection from its ⋯ menu.",
      ),
    ).toBeInTheDocument();
    expect(newLink()).toBeInTheDocument();
  });

  it("is not offered on the Posts tab", () => {
    renderRail();

    expect(
      screen.queryByRole("button", { name: "New collection" }),
    ).not.toBeInTheDocument();
  });
});
