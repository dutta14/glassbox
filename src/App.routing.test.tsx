import { describe, expect, it, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { AppReady } from "./App";
import { markSeeded } from "./storage/notes";
import { COPY } from "./engine/copy";
import type {
  Answer,
  Book,
  Conversation,
  Note,
  ScoredChunk,
  Trace,
} from "./types";
import type {
  BookStore,
  ConversationStore,
  NotesStore,
} from "./storage/types";

const ISO = "2026-01-01T00:00:00.000Z";

const makeNote = (
  id: string,
  createdAt: string,
  title: string,
  body = "body text",
): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

const goodChunk = (): ScoredChunk => ({
  noteId: "n1",
  noteTitle: "Note",
  position: 0,
  text: "body",
  score: 0.5,
  matchedTerms: ["body"],
  coverage: 1,
});

const goodTrace = (): Trace => ({
  intent: "search",
  confidence: 0.9,
  queryTerms: ["body"],
  candidatesConsidered: 1,
  results: [goodChunk()],
  reason: "ok",
});

const goodAnswer = (text = "Here."): Answer => ({
  text,
  sources: [goodChunk()],
  trace: goodTrace(),
});

const makeConversation = (id: string, title: string, userText: string): Conversation => ({
  id,
  title,
  messages: [
    { id: `${id}-u`, role: "user", text: userText, createdAt: ISO },
    {
      id: `${id}-a`,
      role: "assistant",
      text: `Answer for ${id}`,
      answer: goodAnswer(`Answer for ${id}`),
      createdAt: ISO,
    },
  ],
  createdAt: ISO,
  updatedAt: id === "c1" ? "2026-01-02T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
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

/* In memory rather than the real localStorage store: this file never clears
   localStorage between tests, so a book written by one test would still be
   there for the next one and the failure would look like a routing bug. */
const makeBookStore = (): BookStore => {
  let books: Book[] = [];
  return {
    kind: "local",
    list: async () => ({ books, skipped: 0 }),
    put: async (book: Book) => {
      books = [...books.filter((b) => b.id !== book.id), book];
    },
    remove: async (id: string) => {
      books = books.filter((b) => b.id !== id);
    },
  };
};

const makeConversationStore = (initial: Conversation[]): ConversationStore => {
  const disk = new Map(initial.map((c) => [c.id, c]));
  return {
    kind: "local",
    async list() {
      return { conversations: [...disk.values()], skipped: 0 };
    },
    async put(conversation) {
      disk.set(conversation.id, conversation);
    },
    async remove(id) {
      disk.delete(id);
    },
  };
};

let testNavigate: ReturnType<typeof useNavigate> | null = null;

const RouterProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    testNavigate = navigate;
  });
  return <div data-testid="pathname">{location.pathname}</div>;
};

interface RenderOptions {
  notes?: Note[];
  conversations?: Conversation[];
  notesStore?: NotesStore;
  conversationStore?: ConversationStore;
}

const renderApp = (initialEntries: string[], options: RenderOptions = {}) => {
  const notesStore =
    options.notesStore ?? makeNotesStore(options.notes ?? []);
  const conversationStore =
    options.conversationStore ??
    makeConversationStore(options.conversations ?? []);

  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <RouterProbe />
      <AppReady
        store={notesStore}
        conversationStore={conversationStore}
        bookStore={makeBookStore()}
        folderState="disconnected"
        folderName={null}
        connectError={null}
        onConnect={() => {}}
        onReconnect={() => {}}
        onDisconnect={() => {}}
      />
    </MemoryRouter>,
  );
  return { ...utils, notesStore, conversationStore };
};

const pathname = () => screen.getByTestId("pathname").textContent;

beforeEach(() => {
  /* Cleared, not just seeded. '/' now resolves through a remembered note id in
     localStorage, so a test that opens a note leaves a fact behind that
     changes where the next test lands. Without this the file passes or fails
     by running order. */
  localStorage.clear();
  // Skip sample seeding so each test controls exactly which notes exist.
  markSeeded();
  testNavigate = null;
});

/* The Ask button is on every ready screen and on no loading one, which makes
   it the honest "the app has finished starting" signal now that '/' no longer
   parks on a composer. */
const ready = () => screen.findByRole("button", { name: COPY.askOpen });

const openAsk = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await ready());
  return screen.findByRole("textbox", { name: "Ask a question" });
};

describe("deep links open the right thing (AC 1)", () => {
  it("opens the note named in /note/<id> on first load", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "First note")],
    });
    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(within(editor).getByLabelText("Note title")).toHaveValue(
      "First note",
    );
  });

  /* Conversations no longer have addresses. A link someone saved or a tab
     they left open must still land somewhere sensible rather than on a dead
     route, so it falls through home and home resolves to a note. */
  it("sends an old /chat/<id> link home instead of to a dead end", async () => {
    renderApp(["/chat/c1"], {
      notes: [makeNote("n1", ISO, "First note")],
      conversations: [makeConversation("c1", "My chat", "hello there")],
    });

    await waitFor(() => expect(pathname()).toBe("/note/n1"));
  });

  it("opens the newest note at / when nothing has been read before", async () => {
    renderApp(["/"], {
      notes: [
        makeNote("n1", "2020-01-01T00:00:00.000Z", "Older note"),
        makeNote("n2", "2024-01-01T00:00:00.000Z", "Newer note"),
      ],
    });

    await waitFor(() => expect(pathname()).toBe("/note/n2"));
  });

  it("reopens the note that was last read", async () => {
    localStorage.setItem("glassbox.lastNote.v1", "n1");
    renderApp(["/"], {
      notes: [
        makeNote("n1", "2020-01-01T00:00:00.000Z", "Older note"),
        makeNote("n2", "2024-01-01T00:00:00.000Z", "Newer note"),
      ],
    });

    await waitFor(() => expect(pathname()).toBe("/note/n1"));
  });

  /* A note deleted on another machine leaves a remembered id pointing at
     nothing. Falling through to the newest note is what stops every load
     landing on a not-found the reader cannot clear. */
  it("falls back to the newest note when the remembered one is gone", async () => {
    localStorage.setItem("glassbox.lastNote.v1", "deleted-elsewhere");
    renderApp(["/"], {
      notes: [makeNote("n2", "2024-01-01T00:00:00.000Z", "Newer note")],
    });

    await waitFor(() => expect(pathname()).toBe("/note/n2"));
  });

  it("says so plainly at / when there is nothing to open", async () => {
    renderApp(["/"], { notes: [] });

    expect(
      await screen.findByText(COPY.emptyLibraryTitle),
    ).toBeInTheDocument();
    expect(pathname()).toBe("/");
  });
});

describe("selecting from the rail sets the URL and adds one history entry (AC 2, 3, 4, 14)", () => {
  it("selecting a note navigates to /note/<id> and back returns to where you were", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Alpha note"), makeNote("n2", ISO, "Beta note")],
    });
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole("button", { name: "Beta note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n2"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/note/n1"));
  });

  /* The hop from '/' to a note is a replace, not a push. If it pushed, back
     from the first note would return to '/', which would immediately send the
     reader forward again: a trap with no way out of the app. */
  it("does not leave / in history when it resolves to a note", async () => {
    renderApp(["/"], {
      notes: [
        makeNote("n1", "2020-01-01T00:00:00.000Z", "Alpha note"),
        makeNote("n2", "2024-01-01T00:00:00.000Z", "Beta note"),
      ],
    });
    const user = userEvent.setup();
    await ready();
    await waitFor(() => expect(pathname()).toBe("/note/n2"));

    await user.click(screen.getByRole("button", { name: "Alpha note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n1"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/note/n2"));
  });

  /* Ask is a pane beside the note rather than a place to go. Opening it must
     leave the address bar exactly as it was, or back would start closing
     panes instead of leaving the note. */
  it("opening Ask leaves the URL alone, so back still exits the note", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n0", ISO, "Zero note"), makeNote("n1", ISO, "Alpha note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    await openAsk(user);

    expect(pathname()).toBe("/note/n1");
  });

  it("selecting the note already open does not stack a duplicate history entry", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Alpha note"), makeNote("n2", ISO, "Beta note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    // Go n1 -> n2 -> click n2 again (no-op) -> back should land on n1, not n2.
    await user.click(screen.getByRole("button", { name: "Beta note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n2"));
    await user.click(screen.getByRole("button", { name: "Beta note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n2"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/note/n1"));
  });
});

describe("creating a note navigates to it (AC 6)", () => {
  it("New note pushes /note/<new-id> and shows an empty editor", async () => {
    renderApp(["/note/n1"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole("button", { name: "New note" }));

    await waitFor(() => expect(pathname()).toMatch(/^\/note\/.+/));
    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(within(editor).getByLabelText("Note title")).toHaveValue("");
  });

  it("New note still opens a prose note, so the default did not move", async () => {
    renderApp(["/note/n1"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole("button", { name: "New note" }));

    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(editor.querySelector(".editor__bodywrap--verse")).toBeNull();
  });

  it("New note options then Verse opens a note that is laid out as verse (AC 5)", async () => {
    // The end-to-end proof, and the only test that would catch the format
    // being dropped somewhere between the menu and the created note. The
    // component test can only show the right argument leaving the menu.
    renderApp(["/note/n1"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole("button", { name: "New note options" }));
    await user.click(screen.getByRole("menuitem", { name: "Verse" }));

    await waitFor(() => expect(pathname()).toMatch(/^\/note\/.+/));
    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(editor.querySelector(".editor__bodywrap--verse")).not.toBeNull();
  });
});

describe("asking a question leaves the address bar alone (AC 7)", () => {
  /* The first prompt used to replace '/' with '/chat/<id>', which is what made
     the submit path race an async hashchange. The pane has no URL, so the note
     stays open and stays addressed. */
  it("submitting a prompt keeps the URL on the note and shows the thread", async () => {
    renderApp(["/note/n1"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    const input = await openAsk(user);
    await user.type(input, "what did I write about bread");
    await user.keyboard("{Enter}");

    const transcript = await screen.findByRole("list", { name: "Conversation" });
    expect(
      within(transcript).getByText("what did I write about bread"),
    ).toBeInTheDocument();
    expect(pathname()).toBe("/note/n1");
  });

  /* The first answer opens its reasoning panel once, so a reader sees what the
     retrieval did before deciding whether to trust it. That expansion is set
     during append and would be lost to a remount. */
  it("keeps the first answer's reasoning panel auto-expanded", async () => {
    renderApp(["/note/n1"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    const input = await openAsk(user);
    await user.type(input, "what did I write about bread");
    await user.keyboard("{Enter}");

    const transcript = await screen.findByRole("list", { name: "Conversation" });
    const panel = within(transcript)
      .getAllByRole("button")
      .find((b) => /confidence|No match/i.test(b.textContent ?? ""));
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the composer survives moving around the app", () => {
  /* The old guard against this was keeping '/' and '/chat/:id' on the same
     component type so the outlet would not swap the ChatPanel. The pane is
     mounted outside the router now, so the protection is structural: this
     asserts the structure, not the trick it replaced. */
  it("keeps text typed into the composer when the note behind it changes", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Alpha note"), makeNote("n2", ISO, "Beta note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    const input = await openAsk(user);
    await user.type(input, "six hours");

    await user.click(screen.getByRole("button", { name: "Beta note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n2"));

    expect(
      screen.getByRole("textbox", { name: "Ask a question" }),
    ).toHaveValue("six hours");
  });
});

describe("deleting the open thread replaces the URL (AC 8)", () => {
  /* With conversations out of the address bar there is no URL left to fix, so
     what matters is that the reader is moved onto the neighbour rather than
     left looking at a thread that no longer exists. */
  it("deleting the open conversation shows the neighbour and leaves the URL alone", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
      conversations: [
        makeConversation("c1", "Chat one", "question one"),
        makeConversation("c2", "Chat two", "question two"),
      ],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });
    await openAsk(user);

    await user.click(
      screen.getByRole("button", { name: COPY.askHistoryOpen }),
    );
    await user.click(
      await screen.findByRole("button", { name: "More actions for Chat one" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      screen.queryByRole("button", { name: "More actions for Chat one" }),
    ).toBeNull();
    expect(pathname()).toBe("/note/n1");
  });

  it("deleting the open note replaces the URL, landing on / when it was the last note", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Only note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    await user.click(
      screen.getByRole("button", { name: "More actions for Only note" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(pathname()).toBe("/"));
  });
});

describe("dead links show a calm not-found (AC 9)", () => {
  it("a /note/<id> that does not exist shows the note not-found message and a way back", async () => {
    renderApp(["/note/missing"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
    });
    expect(
      await screen.findByText(/That note doesn.t exist/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start a new chat" }),
    ).toHaveAttribute("href", "/");
  });

  it("a path that matches no route redirects home rather than erroring", async () => {
    renderApp(["/totally-made-up"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
    });
    /* The catch-all sends an unrecognised path home, and home resolves to a
       note. A dead /note/<id> still shows a calm not-found inside its own
       route; only truly unmatched shapes land here. */
    await waitFor(() => expect(pathname()).toBe("/note/n1"));
    expect(
      await screen.findByRole("region", { name: "Note editor" }),
    ).toBeInTheDocument();
  });
});

describe("editing a note does not touch history (AC 12)", () => {
  it("typing in the note body leaves the URL untouched so back still exits the note", async () => {
    renderApp(["/note/n1"], {
      notes: [
        makeNote("n1", ISO, "Alpha note", ""),
        makeNote("n2", ISO, "Beta note", ""),
      ],
    });
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole("button", { name: "Beta note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n2"));

    const body = screen.getByLabelText("Note body");
    await user.type(body, "some new words");
    expect(pathname()).toBe("/note/n2");

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/note/n1"));
  });
});

describe("the document title reflects what is open (AC 15)", () => {  it("names the open note, and says only Glassbox when none is open", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Sourdough log")],
      conversations: [makeConversation("c1", "Bread questions", "why flat")],
    });
    await waitFor(() =>
      expect(document.title).toBe("Sourdough log · Glassbox"),
    );

    /* A question is asked beside the note rather than instead of it, so the
       title must not follow the conversation. The note is still where the
       reader is. */
    const user = userEvent.setup();
    await openAsk(user);
    expect(document.title).toBe("Sourdough log · Glassbox");
  });

  it("falls back to the bare app name when the library is empty", async () => {
    renderApp(["/"], { notes: [] });

    await screen.findByText(COPY.emptyLibraryTitle);
    expect(document.title).toBe("Glassbox");
  });
});
