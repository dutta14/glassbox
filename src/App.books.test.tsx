import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppReady } from "./App";
import { markSeeded } from "./storage/notes";
import type { Book, Conversation, Note } from "./types";
import type {
  BookStore,
  ConversationListResult,
  ConversationStore,
  NotesStore,
} from "./storage/types";

/**
 * The book feature was built as four pieces by four different hands: a store,
 * a rail section, a modal, and a reading view. Each was tested alone and each
 * passed. None of that proves they are connected, and the first thing a real
 * browser found was a prop that no call site passed.
 *
 * These tests only ever drive the app the way a person does, through the rail
 * and the menus, and only ever assert what the app shows back. Nothing here
 * reaches into a store or calls a hook, because a test that does can pass over
 * a broken wire.
 */

const ISO = "2026-01-01T00:00:00.000Z";

const makeNote = (id: string, title: string, body = "body text"): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: ISO,
  updatedAt: ISO,
});

const makeNotesStore = (initial: Note[]): NotesStore => {
  const disk = new Map(initial.map((n) => [n.id, n]));
  return {
    kind: "local",
    label: "test",
    isAvailable: () => true,
    async list() {
      return [...disk.values()];
    },
    async put(note) {
      disk.set(note.id, note);
    },
    async remove(id) {
      disk.delete(id);
    },
  };
};

const makeConversationStore = (): ConversationStore => ({
  kind: "local",
  async list(): Promise<ConversationListResult> {
    return { conversations: [] as Conversation[], skipped: 0 };
  },
  async put() {},
  async remove() {},
});

/* In memory, and handed back so a test can read what actually reached
   storage. The localStorage store would carry state between tests in a file
   that never clears it. */
const makeBookStore = () => {
  let books: Book[] = [];
  const store: BookStore = {
    kind: "local",
    async list() {
      return { books, skipped: 0 };
    },
    async put(book) {
      books = [...books.filter((b) => b.id !== book.id), book];
    },
    async remove(id) {
      books = books.filter((b) => b.id !== id);
    },
  };
  return { store, read: () => books };
};

const renderApp = (
  notes: Note[],
  bookStore: BookStore,
  initialEntries: string[] = ["/"],
) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppReady
        store={makeNotesStore(notes)}
        conversationStore={makeConversationStore()}
        bookStore={bookStore}
        folderState="disconnected"
        folderName={null}
        connectError={null}
        onConnect={() => {}}
        onReconnect={() => {}}
        onDisconnect={() => {}}
      />
    </MemoryRouter>,
  );

const railRow = async (title: string): Promise<HTMLElement> => {
  /* A row's accessible name carries more than its title: a book appends its
     chapter count, a note in a book appends its marker. Anchoring to the start
     keeps these helpers working as that trailing copy changes. */
  const button = await screen.findByRole("button", {
    name: new RegExp(`^${title}`),
  });
  const row = button.closest("li");
  if (!row) throw new Error(`no row for ${title}`);
  return row;
};

const openRowMenu = async (
  user: ReturnType<typeof userEvent.setup>,
  title: string,
): Promise<void> => {
  const row = await railRow(title);
  await user.click(
    within(row).getByRole("button", { name: `More actions for ${title}` }),
  );
};

/** Drives the whole flow: row menu, modal, new collection, note added. */
const addNoteToNewBook = async (
  user: ReturnType<typeof userEvent.setup>,
  noteTitle: string,
  bookTitle: string,
): Promise<void> => {
  await openRowMenu(user, noteTitle);
  await user.click(
    await screen.findByRole("menuitem", { name: /add to collection/i }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), bookTitle);
  await user.click(within(dialog).getByRole("button", { name: /create/i }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
};

beforeEach(() => {
  markSeeded();
  localStorage.clear();
});

/* A note added to a collection leaves Posts, so a collection's row is read from
   the Collections tab and a note's row from Posts. */
const openTab = async (
  user: ReturnType<typeof userEvent.setup>,
  name: "Posts" | "Collections",
) => user.click(screen.getByRole("tab", { name }));

describe("collections, end to end through the interface", () => {
  it("creates a collection from a note's row menu and lists it in the rail", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openTab(user, "Collections");

    // Shown, and actually persisted holding that note. Either one alone
    // would pass with the other half of the wire cut.
    expect(
      await screen.findByRole("button", { name: /^Childhood/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(read()).toHaveLength(1);
      expect(read()[0].title).toBe("Childhood");
      expect(read()[0].chapterIds).toEqual(["n1"]);
    });
  });

  it("takes the note out of Posts once it is added to a collection", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon"), makeNote("n2", "School")], store);

    await railRow("Luncheon");

    await addNoteToNewBook(user, "Luncheon", "Childhood");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^Luncheon/ }),
      ).not.toBeInTheDocument(),
    );
    // The note that was never added must stay, or the rail is just empty.
    expect(await railRow("School")).toBeInTheDocument();
  });

  it("opens the collection and reads its chapters when its rail row is clicked", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openTab(user, "Collections");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Lunch is ready")).toBeInTheDocument();
  });

  it("reads chapters in the collection's order rather than the library's", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp(
      [
        makeNote("n1", "Luncheon", "first written"),
        makeNote("n2", "School", "second written"),
      ],
      store,
    );

    // Added in reverse, so book order and library order disagree. If they
    // agreed, this test would pass on a bug.
    await addNoteToNewBook(user, "School", "Childhood");
    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to collection/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /^Childhood/ }),
    );
    await waitFor(() => expect(read()[0].chapterIds).toEqual(["n2", "n1"]));

    await openTab(user, "Collections");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));

    const main = await screen.findByRole("main");
    await within(main).findByText("second written");
    const shown = within(main)
      .getAllByText(/written$/)
      .map((n) => n.textContent);
    expect(shown).toEqual(["second written", "first written"]);
  });

  it("keeps every note in the library after its collection is deleted", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openTab(user, "Collections");
    await openRowMenu(user, "Childhood");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(
      await screen.findByRole("button", { name: /delete collection/i }),
    );

    await waitFor(() => expect(read()).toHaveLength(0));
    expect(
      screen.queryByRole("button", { name: /^Childhood/ }),
    ).not.toBeInTheDocument();
    // The whole point of the confirm copy. The note outlives the book and
    // returns to Posts.
    await openTab(user, "Posts");
    expect(await railRow("Luncheon")).toBeInTheDocument();
  });

  it("asks to add rather than to move when the note is in no collection", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to collection/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Add to collection" }),
    ).toBeInTheDocument();
  });

  it("names the collection under the note's title, linked to that collection", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    // Once shelved its row is gone from Posts, so it is reached by search.
    await user.click(screen.getByRole("button", { name: "Search notes" }));
    await user.type(screen.getByRole("searchbox"), "Luncheon");
    await user.click(await screen.findByRole("button", { name: /^Luncheon/ }));

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByText(/In the collection –/),
    ).toBeInTheDocument();

    // Following it must actually arrive at the book, so the chapter shows.
    await user.click(within(main).getByRole("link", { name: "Childhood" }));
    expect(await within(main).findByText("Lunch is ready")).toBeInTheDocument();
    expect(
      within(main).queryByText(/In the collection/),
    ).not.toBeInTheDocument();
  });

  it("says nothing about collections on a note that is in none", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await user.click(
      within(await railRow("Luncheon")).getByRole("button", {
        name: /^Luncheon/,
      }),
    );

    const main = await screen.findByRole("main");
    await within(main).findByRole("article", { name: "Luncheon" });
    expect(
      within(main).queryByText(/In the collection/i),
    ).not.toBeInTheDocument();
  });

  it("moves the open post to the one below it when it is added to a collection", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    const dated = (id: string, title: string, createdAt: string): Note => ({
      ...makeNote(id, title),
      createdAt,
      updatedAt: createdAt,
    });
    renderApp(
      [
        dated("n1", "Newest", "2026-03-01T12:00:00"),
        dated("n2", "Middle", "2026-02-01T12:00:00"),
        dated("n3", "Oldest", "2026-01-01T12:00:00"),
      ],
      store,
      ["/note/n2"],
    );

    await addNoteToNewBook(user, "Middle", "Childhood");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Oldest/ })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /^Oldest/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("moves the open post to the one above it when it was the last", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    const dated = (id: string, title: string, createdAt: string): Note => ({
      ...makeNote(id, title),
      createdAt,
      updatedAt: createdAt,
    });
    renderApp(
      [
        dated("n1", "Newest", "2026-03-01T12:00:00"),
        dated("n2", "Oldest", "2026-01-01T12:00:00"),
      ],
      store,
      ["/note/n2"],
    );

    await addNoteToNewBook(user, "Oldest", "Childhood");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Newest/ })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });

  it("creates an empty collection from the inline field and opens it", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await railRow("Luncheon");
    await openTab(user, "Collections");
    await user.click(
      await screen.findByRole("button", { name: "New collection" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Collection name" }),
      "Winter drafts{Enter}",
    );

    const row = await screen.findByRole("button", { name: /^Winter drafts/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toHaveTextContent("Empty");
    await waitFor(() => {
      expect(read()).toHaveLength(1);
      expect(read()[0].chapterIds).toEqual([]);
    });
  });

  it("shows a calm message for a book id that does not exist", async () => {
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store, ["/book/nope"]);

    expect(
      await screen.findByText(/That book doesn’t exist/),
    ).toBeInTheDocument();
  });
});

describe("a collection's own page", () => {
  /** Luncheon is the collection's second chapter, School its first. */
  const buildCollection = async (
    user: ReturnType<typeof userEvent.setup>,
    notes: Note[],
  ) => {
    const books = makeBookStore();
    renderApp(notes, books.store);
    await addNoteToNewBook(user, "School", "Childhood");
    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to collection/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /^Childhood/ }),
    );
    await waitFor(() =>
      expect(books.read()[0].chapterIds).toEqual(["n2", "n1"]),
    );
    return books;
  };

  const notes = () => [
    makeNote("n1", "Luncheon", "Lunch is ready"),
    makeNote("n2", "School", "Bells ring"),
    makeNote("n3", "Garden", "Roses"),
  ];

  /** The chapters the page asked the browser to bring into view. */
  const stubScroll = () => {
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    return {
      reached: () =>
        (spy.mock.contexts as HTMLElement[])
          .map((el) => el.dataset.chapterId)
          .filter(Boolean),
      restore: () => {
        Element.prototype.scrollIntoView = original;
      },
    };
  };

  it("opens at the chapter whose collection line was followed and marks the collection", async () => {
    const user = userEvent.setup();
    await buildCollection(user, notes());
    const scroll = stubScroll();
    try {
      await user.click(screen.getByRole("button", { name: "Search notes" }));
      await user.type(screen.getByRole("searchbox"), "Luncheon");
      await user.click(
        await screen.findByRole("button", { name: /^Luncheon/ }),
      );
      const main = await screen.findByRole("main");
      await user.click(
        await within(main).findByRole("link", { name: "Childhood" }),
      );

      expect(await within(main).findByText(/^2 chapters/)).toBeInTheDocument();
      expect(scroll.reached()).toContain("n1");
      expect(screen.getByRole("tab", { name: "Collections" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("button", { name: /^Childhood/ }),
      ).toHaveAttribute("aria-current", "true");
      // The results are over: the page has the pane, and the tabs are back.
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    } finally {
      scroll.restore();
    }
  });

  it("returns from editing a chapter to the page at that chapter on Escape", async () => {
    const user = userEvent.setup();
    await buildCollection(user, notes());
    await openTab(user, "Collections");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));
    const main = await screen.findByRole("main");
    await user.click(
      await within(main).findByRole("link", { name: "Edit Luncheon" }),
    );
    await screen.findByRole("textbox", { name: "Note title" });

    const scroll = stubScroll();
    try {
      await user.keyboard("{Escape}");
      expect(await within(main).findByText(/^2 chapters/)).toBeInTheDocument();
      await waitFor(() => expect(scroll.reached()).toContain("n1"));
    } finally {
      scroll.restore();
    }
  });

  it("takes a chapter out of the collection from the page and returns it to Posts", async () => {
    const user = userEvent.setup();
    const { read } = await buildCollection(user, notes());
    await openTab(user, "Collections");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));
    const main = await screen.findByRole("main");
    await user.click(
      await within(main).findByRole("button", {
        name: "Remove from collection: Luncheon",
      }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Remove from collection",
      }),
    );

    await waitFor(() => expect(read()[0].chapterIds).toEqual(["n2"]));
    expect(within(main).queryByText("Lunch is ready")).not.toBeInTheDocument();
    expect(within(main).getByText(/^1 chapter/)).toBeInTheDocument();
    await openTab(user, "Posts");
    expect(await railRow("Luncheon")).toBeInTheDocument();
  });

  it("opens a post in the feed when its Posts row is clicked from the page", async () => {
    const user = userEvent.setup();
    await buildCollection(user, notes());
    await openTab(user, "Collections");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));
    const main = await screen.findByRole("main");
    await within(main).findByText(/^2 chapters/);

    await openTab(user, "Posts");
    // Switching tabs leaves the pane alone.
    expect(within(main).getByText(/^2 chapters/)).toBeInTheDocument();
    await user.click(
      within(await railRow("Garden")).getByRole("button", { name: /^Garden/ }),
    );
    expect(
      await within(main).findByRole("article", { name: "Garden" }),
    ).toBeInTheDocument();
    expect(within(main).queryByText(/^2 chapters/)).not.toBeInTheDocument();
  });
});
