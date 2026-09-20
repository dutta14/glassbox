import { describe, expect, it, beforeEach } from "vitest";
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

/** Drives the whole flow: row menu, modal, new book, note added. */
const addNoteToNewBook = async (
  user: ReturnType<typeof userEvent.setup>,
  noteTitle: string,
  bookTitle: string,
): Promise<void> => {
  await openRowMenu(user, noteTitle);
  await user.click(await screen.findByRole("menuitem", { name: /add to book/i }));
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

describe("books, end to end through the interface", () => {
  it("creates a book from a note's row menu and lists it in the rail", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");

    // Shown, and actually persisted holding that note. Either one alone
    // would pass with the other half of the wire cut.
    expect(await screen.findByRole("button", { name: /^Childhood/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(read()).toHaveLength(1);
      expect(read()[0].title).toBe("Childhood");
      expect(read()[0].chapterIds).toEqual(["n1"]);
    });
  });

  it("names the book on a note's row once it is added", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon"), makeNote("n2", "School")], store);

    const before = await railRow("Luncheon");
    expect(within(before).queryByText("Childhood")).not.toBeInTheDocument();

    await addNoteToNewBook(user, "Luncheon", "Childhood");

    await waitFor(async () => {
      expect(
        within(await railRow("Luncheon")).getByText("Childhood"),
      ).toBeInTheDocument();
    });
    // The note that was never added must stay unnamed, or the label is just
    // always on and proves nothing.
    expect(
      within(await railRow("School")).queryByText("Childhood"),
    ).not.toBeInTheDocument();
  });

  it("opens the book and reads its chapters when its rail row is clicked", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Lunch is ready")).toBeInTheDocument();
  });

  it("reads chapters in the book's order rather than the library's", async () => {
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
      await screen.findByRole("menuitem", { name: /add to book/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Childhood/ }));
    await waitFor(() => expect(read()[0].chapterIds).toEqual(["n2", "n1"]));

    await user.click(await screen.findByRole("button", { name: /^Childhood/ }));

    const main = await screen.findByRole("main");
    await within(main).findByText("second written");
    const shown = within(main).getAllByText(/written$/).map((n) => n.textContent);
    expect(shown).toEqual(["second written", "first written"]);
  });

  it("keeps every note in the library after its book is deleted", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openRowMenu(user, "Childhood");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(
      await screen.findByRole("button", { name: /delete book/i }),
    );

    await waitFor(() => expect(read()).toHaveLength(0));
    expect(
      screen.queryByRole("button", { name: /^Childhood/ }),
    ).not.toBeInTheDocument();
    // The whole point of the confirm copy. The note outlives the book.
    expect(await railRow("Luncheon")).toBeInTheDocument();
  });

  it("drops a deleted note out of the book that held it", async () => {
    const user = userEvent.setup();
    const { store, read } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon"), makeNote("n2", "School")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await waitFor(() => expect(read()[0].chapterIds).toEqual(["n1"]));

    await openRowMenu(user, "Luncheon");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    const noteConfirm = await screen.findByRole("alertdialog");
    await user.click(within(noteConfirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(read()[0].chapterIds).toEqual([]));
  });

  it("offers a book that already holds the note as unavailable rather than hiding it", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to book/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /^Childhood/ }),
    ).toBeDisabled();
  });

  /* The move is the surprising part of the rule, so it is said before the
     choice is made rather than reported after it. */
  it("warns that choosing another book will move the note", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to book/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/is in Childhood\. Choosing another book moves it/),
    ).toBeInTheDocument();
  });

  it("asks to add rather than to move when the note is in no book", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await openRowMenu(user, "Luncheon");
    await user.click(
      await screen.findByRole("menuitem", { name: /add to book/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Add to book" }),
    ).toBeInTheDocument();
  });

  it("names the book under the note's title, linked to that book", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await user.click(within(await railRow("Luncheon")).getByRole("button", {
      name: /^Luncheon/,
    }));

    const main = await screen.findByRole("main");
    expect(await within(main).findByText(/In the Book -/)).toBeInTheDocument();

    // Following it must actually arrive at the book, so the chapter shows.
    await user.click(within(main).getByRole("link", { name: "Childhood" }));
    expect(await within(main).findByText("Lunch is ready")).toBeInTheDocument();
    expect(within(main).queryByText(/In the Book/)).not.toBeInTheDocument();
  });

  it("says nothing about books on a note that is in none", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await user.click(within(await railRow("Luncheon")).getByRole("button", {
      name: /^Luncheon/,
    }));

    const main = await screen.findByRole("main");
    await within(main).findByRole("textbox", { name: /note title/i });
    expect(within(main).queryByText(/In the Book/i)).not.toBeInTheDocument();
  });

  /**
   * A note belongs to one book, so adding it to a second takes it out of the
   * first. This goes through the interface end to end because the removal
   * happens to a book the user is not looking at, which is exactly the kind
   * of change that can be wired up in the hook and never reach the screen.
   */
  it("moves the note out of its old book when it is added to another", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await addNoteToNewBook(user, "Luncheon", "Summers");
    await user.click(within(await railRow("Luncheon")).getByRole("button", {
      name: /^Luncheon/,
    }));

    const main = await screen.findByRole("main");
    expect(await within(main).findByText(/In the Book -/)).toBeInTheDocument();
    expect(
      within(main).getByRole("link", { name: "Summers" }),
    ).toBeInTheDocument();
    expect(
      within(main).queryByRole("link", { name: "Childhood" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the old book empty after the note moves out of it", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon", "Lunch is ready")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");
    await addNoteToNewBook(user, "Luncheon", "Summers");

    expect(
      await screen.findByRole("button", { name: /^Childhood\s*Empty/ }),
    ).toBeInTheDocument();
  });

  it("names the note's book on its rail row", async () => {
    const user = userEvent.setup();
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store);

    await addNoteToNewBook(user, "Luncheon", "Childhood");

    const noteRow = await railRow("Luncheon");
    expect(within(noteRow).getByText("Childhood")).toBeInTheDocument();
  });

  it("shows a calm message for a book id that does not exist", async () => {
    const { store } = makeBookStore();
    renderApp([makeNote("n1", "Luncheon")], store, ["/book/nope"]);

    expect(
      await screen.findByText(/That book doesn’t exist/),
    ).toBeInTheDocument();
  });
});
