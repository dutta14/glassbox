import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import { COPY } from "../engine/copy";
import type { Book, Note } from "../types";

/**
 * What the two organize modes actually do to the rail. The menu that picks
 * between them is covered in OrganizeMenu.test.tsx; this file is about the
 * consequences.
 *
 * The invariant underneath all of it: no mode may make a note unreachable.
 * Book mode takes a note out of the Notes list only because the book it is in
 * now shows it.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  body: "body",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const notes = [
  mkNote("c1", "#1 \u2013 The Drizzle"),
  mkNote("c2", "Chapter 2: Abdul's Shop"),
  mkNote("n9", "Not in the book"),
];

const books: Book[] = [
  {
    id: "b1",
    title: "Autumn",
    chapterIds: ["c1", "c2"],
    unnumberedIds: [],
    createdAt: iso,
    updatedAt: iso,
  },
];

const bookNames = new Map([
  ["c1", "Autumn"],
  ["c2", "Autumn"],
]);

const renderRail = (
  overrides: {
    notes?: Note[];
    books?: Book[];
    organizeMode?: "list" | "book";
    bookNameByNoteId?: Map<string, string>;
    selectedNoteId?: string | null;
    onOpenBooks?: () => void;
  } = {},
) => {
  const onSelect = vi.fn();
  const onOpenChapter = vi.fn();
  const props = (mode: "list" | "book") => (
    <NotesRail
      notes={overrides.notes ?? notes}
      selectedNoteId={overrides.selectedNoteId ?? null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={onSelect}
      onCreate={vi.fn()}
      onDeleteNote={vi.fn()}
      onToggleNoteFormat={vi.fn()}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      books={overrides.books ?? books}
      selectedBookId={null}
      bookNameByNoteId={overrides.bookNameByNoteId ?? bookNames}
      onSelectBook={vi.fn()}
      onOpenBooks={overrides.onOpenBooks ?? vi.fn()}
      onOpenChapter={onOpenChapter}
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
      organizeMode={mode}
      onOrganizeChange={vi.fn()}
    />
  );
  const mode = overrides.organizeMode ?? "book";
  const { rerender } = render(props(mode));
  return {
    onSelect,
    onOpenChapter,
    setMode: (next: "list" | "book") => rerender(props(next)),
  };
};

/** Scoped to the Notes nav, so a chapter row under a book cannot be mistaken
    for the same note still sitting in the Notes list. */
const notesList = () => {
  const nav = document.getElementById("rail-notes-list");
  expect(nav).not.toBeNull();
  return within(nav as HTMLElement);
};

/* Arranged by book the section heading is a button named "Books" too, so the
   name alone cannot tell the top-level entry from the heading. */
const booksEntry = () =>
  screen
    .queryAllByRole("button", { name: "Books" })
    .find((b) => b.classList.contains("notes-rail__entry"));

describe("NotesRail organize modes", () => {
  it("lists every note, booked or not, in list mode", () => {
    renderRail({ organizeMode: "list" });
    const list = notesList();

    expect(
      list.getByRole("button", { name: /^#1 \u2013 The Drizzle/ }),
    ).toBeTruthy();
    expect(list.getByRole("button", { name: /^Not in the book/ })).toBeTruthy();
  });

  it("leaves booked notes out of the Notes list in book mode", () => {
    renderRail({ organizeMode: "book" });
    const list = notesList();

    expect(
      list.queryByRole("button", { name: /^#1 \u2013 The Drizzle/ }),
    ).toBeNull();
    expect(list.getByRole("button", { name: /^Not in the book/ })).toBeTruthy();
  });

  /* In one list the shelf is somewhere to go, so it sits with New chat and
     New note. Heading a section of its own would have implied the sidebar was
     about to list the books, which in this arrangement it never does. */
  it("offers Books alongside New chat in list mode, with no section of its own", () => {
    renderRail({ organizeMode: "list" });

    expect(booksEntry()).toBeTruthy();
    expect(document.getElementById("rail-books-heading")).toBeNull();
    expect(document.getElementById("rail-books-list")?.hidden).toBe(true);
    expect(screen.queryByRole("button", { name: /^Autumn/ })).toBeNull();
  });

  /* The page is what the count is for. Carrying it up here would say the same
     thing twice, less well. */
  it("puts no book count on the Books entry", () => {
    renderRail({ organizeMode: "list" });

    expect(booksEntry()?.textContent?.trim()).toBe("Books");
  });

  it("opens the Books page from that entry", async () => {
    const onOpenBooks = vi.fn();
    renderRail({ organizeMode: "list", onOpenBooks });
    await userEvent.click(booksEntry()!);

    expect(onOpenBooks).toHaveBeenCalled();
  });

  /* The entry is the way to make a first book, so it cannot wait for one to
     exist. */
  it("keeps the Books entry with no books at all", () => {
    renderRail({ organizeMode: "list", books: [] });

    expect(booksEntry()).toBeTruthy();
  });

  /* Arranged by book the sidebar does list them, so the entry would be a
     second door to the same place. */
  it("drops the Books entry in book mode and lists the books instead", () => {
    renderRail({ organizeMode: "book" });

    expect(booksEntry()).toBeUndefined();
    expect(
      within(document.getElementById("rail-books-list")!).getByRole("button", {
        name: /^Autumn/,
      }),
    ).toBeTruthy();
  });

  it("gives book rows no expander in list mode, where a book only opens", () => {
    renderRail({ organizeMode: "list" });

    expect(screen.queryByRole("button", { name: "Expand Autumn" })).toBeNull();
  });

  it("keeps a book's chapters hidden until its row is expanded", () => {
    renderRail({ organizeMode: "book" });

    expect(
      screen.queryByRole("list", { name: "Chapters in Autumn" }),
    ).toBeNull();
  });

  it("shows the chapters under the book once expanded", async () => {
    renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );

    const chapters = within(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    );
    expect(
      chapters.getByRole("button", { name: "#1 \u2013 The Drizzle" }),
    ).toBeTruthy();
    expect(
      chapters.getByRole("button", { name: "Chapter 2: Abdul's Shop" }),
    ).toBeTruthy();
  });

  it("collapses the book again on a second click", async () => {
    renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse Autumn" }),
    );

    expect(
      screen.queryByRole("list", { name: "Chapters in Autumn" }),
    ).toBeNull();
  });

  /* The whole point of book mode: a note taken out of the Notes list is still
     one click away, so nothing is lost by switching. It opens in the book it
     belongs to, which is the thing the chapter is a chapter of. */
  it("opens the book at the chapter whose row was clicked", async () => {
    const { onOpenChapter } = renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Chapter 2: Abdul's Shop" }),
    );

    expect(onOpenChapter).toHaveBeenCalledWith("b1", "c2");
  });

  /* Opening the note on its own would strand the reader outside the book
     they were browsing, with no sign of how they got there. */
  it("does not open the note on its own from a chapter row", async () => {
    const { onSelect } = renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Chapter 2: Abdul's Shop" }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lets two books stand open at once", async () => {
    const second: Book = {
      id: "b2",
      title: "Return",
      chapterIds: ["n9"],
      unnumberedIds: [],
      createdAt: iso,
      updatedAt: iso,
    };
    renderRail({
      organizeMode: "book",
      books: [...books, second],
      bookNameByNoteId: new Map([...bookNames, ["n9", "Return"]]),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Return" }),
    );

    expect(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Chapters in Return" }),
    ).toBeTruthy();
  });

  it("drops chapters whose note has been deleted rather than showing a dead row", async () => {
    renderRail({
      organizeMode: "book",
      notes: [
        mkNote("c1", "#1 \u2013 The Drizzle"),
        mkNote("n9", "Not in the book"),
      ],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );

    const chapters = within(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    );
    expect(chapters.getAllByRole("listitem")).toHaveLength(1);
    expect(
      chapters.getByRole("button", { name: "#1 \u2013 The Drizzle" }),
    ).toBeTruthy();
    expect(chapters.queryByRole("button", { name: /Abdul/ })).toBeNull();
  });

  it("says every note is shelved when book mode empties the Notes list", () => {
    renderRail({
      organizeMode: "book",
      notes: [mkNote("c1", "#1 \u2013 The Drizzle")],
    });

    expect(screen.getByText(COPY.emptyNotesAllBooked)).toBeTruthy();
    expect(screen.queryByText(COPY.emptyNotesSidebar)).toBeNull();
  });

  /* An empty library is not the same as a full one that is all shelved, and
     telling someone with no notes that they are all in books is nonsense. */
  it("still asks for a first note when there are no notes at all", () => {
    renderRail({
      organizeMode: "book",
      notes: [],
      bookNameByNoteId: new Map(),
    });

    expect(screen.getByText(COPY.emptyNotesSidebar)).toBeTruthy();
    expect(screen.queryByText(COPY.emptyNotesAllBooked)).toBeNull();
  });

  /* The collapsed rail is a second rendering of the same lists. It was the
     one place book mode was not applied, and nothing above catches it: a note
     hidden from the wide rail but listed in the narrow one would reappear by
     dragging the sidebar shut. */
  it("keeps booked notes out of the collapsed rail's Notes flyout too", async () => {
    renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Notes" }));

    expect(
      screen.getByRole("button", { name: /^Not in the book/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^#1 \u2013 The Drizzle/ }),
    ).toBeNull();
  });

  /* Which books are open outlives the mode, so the mode has to be checked
     where the chapters are rendered and not only where the expander is. A
     book expanded in book mode was still showing its chapters after a switch
     back to one list, under a book row that no longer had a control to shut
     it with. */
  it("puts a book's chapters away when the mode switches back to one list", async () => {
    const { setMode } = renderRail({ organizeMode: "book" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );
    expect(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    ).toBeTruthy();

    setMode("list");

    expect(
      screen.queryByRole("list", { name: "Chapters in Autumn" }),
    ).toBeNull();
  });

  /* The expander and the list it opens sit in different rows now, so nothing
     but aria-controls connects them. */
  it("points the expander at the chapter list it opens", async () => {
    renderRail({ organizeMode: "book" });
    const expander = screen.getByRole("button", { name: "Expand Autumn" });
    await userEvent.click(expander);

    const listId = expander.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId!)).toBe(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    );
  });

  it("marks the open note as current in the chapter list", async () => {
    renderRail({ organizeMode: "book", selectedNoteId: "c2" });
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Autumn" }),
    );

    const chapters = within(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    );
    expect(
      chapters
        .getByRole("button", { name: "Chapter 2: Abdul's Shop" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
});
