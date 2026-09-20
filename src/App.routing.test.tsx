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
  ConversationListResult,
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

interface DeferredConversationStore extends ConversationStore {
  resolveList: (result: ConversationListResult) => void;
}

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

/** A conversation store whose first list() hangs until the test releases it. */
const makeDeferredConversationStore = (): DeferredConversationStore => {
  const disk = new Map<string, Conversation>();
  let release!: (result: ConversationListResult) => void;
  const gate = new Promise<ConversationListResult>((res) => {
    release = res;
  });
  return {
    kind: "local",
    async list() {
      const result = await gate;
      for (const c of result.conversations) disk.set(c.id, c);
      return result;
    },
    async put(conversation) {
      disk.set(conversation.id, conversation);
    },
    async remove(id) {
      disk.delete(id);
    },
    resolveList: release,
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
  // Skip sample seeding so each test controls exactly which notes exist.
  markSeeded();
  testNavigate = null;
});

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

  it("opens the conversation named in /chat/<id> on first load", async () => {
    renderApp(["/chat/c1"], {
      conversations: [makeConversation("c1", "My chat", "hello there")],
    });
    expect(await screen.findByText("hello there")).toBeInTheDocument();
  });

  it("opens a new chat draft at / with nothing selected", async () => {
    renderApp(["/"], { notes: [makeNote("n1", ISO, "First note")] });
    expect(
      await screen.findByRole("heading", { name: COPY.askTitle }),
    ).toBeInTheDocument();
  });
});

describe("selecting from the rail sets the URL and adds one history entry (AC 2, 3, 4, 14)", () => {
  it("selecting a note navigates to /note/<id> and back returns to where you were", async () => {
    renderApp(["/"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "Alpha note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n1"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/"));
  });

  it("selecting a chat navigates to /chat/<id> and back returns to where you were", async () => {
    renderApp(["/"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
      conversations: [makeConversation("c1", "Chat one", "question one")],
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "Chat one" }));
    await waitFor(() => expect(pathname()).toBe("/chat/c1"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/"));
  });

  it("Ask from a note navigates to / and back returns to the note", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
    });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Note editor" });

    await user.click(screen.getByRole("button", { name: COPY.askRow }));
    await waitFor(() => expect(pathname()).toBe("/"));

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/note/n1"));
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
    renderApp(["/"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "New note" }));

    await waitFor(() => expect(pathname()).toMatch(/^\/note\/.+/));
    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(within(editor).getByLabelText("Note title")).toHaveValue("");
  });

  it("New note still opens a prose note, so the default did not move", async () => {
    renderApp(["/"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "New note" }));

    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(editor.querySelector(".editor__bodywrap--verse")).toBeNull();
  });

  it("New note options then Verse opens a note that is laid out as verse (AC 5)", async () => {
    // The end-to-end proof, and the only test that would catch the format
    // being dropped somewhere between the menu and the created note. The
    // component test can only show the right argument leaving the menu.
    renderApp(["/"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "New note options" }));
    await user.click(screen.getByRole("menuitem", { name: "Verse" }));

    await waitFor(() => expect(pathname()).toMatch(/^\/note\/.+/));
    const editor = await screen.findByRole("region", { name: "Note editor" });
    expect(editor.querySelector(".editor__bodywrap--verse")).not.toBeNull();
  });
});

describe("the first message in a draft replaces / with /chat/<id> (AC 7)", () => {
  it("submitting a prompt on the draft swaps the URL and keeps the thread when going back", async () => {
    renderApp(["/"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    const input = screen.getByRole("textbox", { name: "Ask a question" });
    await user.type(input, "what did I write about bread");
    await user.keyboard("{Enter}");

    // The draft became a real conversation with its own URL.
    await waitFor(() => expect(pathname()).toMatch(/^\/chat\/.+/));
    const chatUrl = pathname();
    const transcript = screen.getByRole("list", { name: "Conversation" });
    expect(
      within(transcript).getByText("what did I write about bread"),
    ).toBeInTheDocument();

    // Because the swap was a replace, back does not return to an empty draft;
    // it leaves the fresh conversation URL in place.
    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe(chatUrl));
    expect(
      within(screen.getByRole("list", { name: "Conversation" })).getByText(
        "what did I write about bread",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the first answer's reasoning panel auto-expanded through the draft-to-chat swap", async () => {
    // Regression guard. The draft submit sets activeId and navigates in two
    // separate commits, so there is a render where the route still reads '/'
    // while a real conversation is active. If the route-to-state sync resets
    // that transient to a draft, it wipes the conversation and the one-time
    // reasoning expansion append had set, and the panel mounts collapsed. This
    // asserts the expansion survives, which only holds while the fresh-id guard
    // in the sync effect is intact.
    renderApp(["/"], { notes: [makeNote("n1", ISO, "Alpha note")] });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    const input = screen.getByRole("textbox", { name: "Ask a question" });
    await user.type(input, "what did I write about bread");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(pathname()).toMatch(/^\/chat\/.+/));
    const transcript = screen.getByRole("list", { name: "Conversation" });
    const panel = within(transcript)
      .getAllByRole("button")
      .find((b) => /confidence|No match/i.test(b.textContent ?? ""));
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the composer survives the draft/chat transition (remount regression)", () => {
  it("keeps text typed into the composer when Ask flips the route from a chat to the draft", async () => {
    // The '/' and '/chat/:id' routes must render the same component type so the
    // outlet preserves one ChatPanel instance across the flip. When they did
    // not, "New chat" remounted the composer and dropped whatever the user was
    // mid-typing, so the very next Enter submitted an empty prompt and started
    // no new conversation. This types, navigates, and asserts the draft is
    // reached with the text intact, which can only hold if the input was never
    // torn down.
    renderApp(["/chat/c1"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
      conversations: [makeConversation("c1", "Bread", "hello there")],
    });
    const user = userEvent.setup();
    await screen.findByText("hello there");

    const input = screen.getByRole("textbox", { name: "Ask a question" });
    await user.type(input, "six hours");

    await user.click(screen.getByRole("button", { name: COPY.askRow }));

    await waitFor(() => expect(pathname()).toBe("/"));
    expect(
      screen.getByRole("textbox", { name: "Ask a question" }),
    ).toHaveValue("six hours");
  });
});

describe("deleting the open thread replaces the URL (AC 8)", () => {
  it("deleting the open conversation replaces the URL with the neighbour", async () => {
    renderApp(["/chat/c1"], {
      conversations: [
        makeConversation("c1", "Chat one", "question one"),
        makeConversation("c2", "Chat two", "question two"),
      ],
    });
    const user = userEvent.setup();
    await screen.findByText("question one");

    await user.click(
      screen.getByRole("button", { name: "More actions for Chat one" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    // c1 is gone; the URL moved to the neighbour rather than staying dead.
    await waitFor(() => expect(pathname()).toBe("/chat/c2"));

    // The replace means back does not return to the deleted /chat/c1.
    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).not.toBe("/chat/c1"));
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

  it("a /chat/<id> that does not exist shows the chat not-found message", async () => {
    renderApp(["/chat/missing"], {
      conversations: [makeConversation("c1", "Chat one", "question one")],
    });
    expect(
      await screen.findByText(/That chat doesn.t exist/i),
    ).toBeInTheDocument();
  });

  it("a path that matches no route redirects home to the draft rather than erroring", async () => {
    renderApp(["/totally-made-up"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
    });
    // The catch-all <Navigate to="/" replace /> sends an unrecognised path home,
    // matching the finance app. A dead /note/<id> or /chat/<id> still resolves
    // to a calm not-found inside its own route; only truly unmatched shapes
    // land here.
    await waitFor(() => expect(pathname()).toBe("/"));
    expect(
      await screen.findByRole("heading", { name: COPY.askTitle }),
    ).toBeInTheDocument();
  });
});

describe("route validation waits for loading before judging a deep link (AC 11)", () => {
  it("holds on a loading state for /chat/<id> until conversations finish loading, then opens it", async () => {
    const store = makeDeferredConversationStore();
    renderApp(["/chat/c1"], {
      notes: [makeNote("n1", ISO, "Alpha note")],
      conversationStore: store,
    });

    // Notes are ready but conversations are still loading, so the deep link
    // must not have bounced to a not-found yet.
    expect(await screen.findByText("Loading your chats…")).toBeInTheDocument();
    expect(screen.queryByText(/That chat doesn.t exist/i)).toBeNull();
    expect(pathname()).toBe("/chat/c1");

    act(() => {
      store.resolveList({
        conversations: [makeConversation("c1", "Chat one", "question one")],
        skipped: 0,
      });
    });

    expect(await screen.findByText("question one")).toBeInTheDocument();
    expect(pathname()).toBe("/chat/c1");
  });
});

describe("editing a note does not touch history (AC 12)", () => {
  it("typing in the note body leaves the URL untouched so back still exits the note", async () => {
    renderApp(["/"], {
      notes: [makeNote("n1", ISO, "Alpha note", "")],
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: COPY.askTitle });

    await user.click(screen.getByRole("button", { name: "Alpha note" }));
    await waitFor(() => expect(pathname()).toBe("/note/n1"));

    const body = screen.getByLabelText("Note body");
    await user.type(body, "some new words");
    expect(pathname()).toBe("/note/n1");

    act(() => {
      testNavigate?.(-1);
    });
    await waitFor(() => expect(pathname()).toBe("/"));
  });
});

describe("the document title reflects what is open (AC 15)", () => {
  it("shows the note title, the chat title, and falls back to Glassbox on a draft", async () => {
    renderApp(["/note/n1"], {
      notes: [makeNote("n1", ISO, "Sourdough log")],
      conversations: [makeConversation("c1", "Bread questions", "why flat")],
    });
    await waitFor(() =>
      expect(document.title).toBe("Sourdough log · Glassbox"),
    );

    act(() => {
      testNavigate?.("/chat/c1");
    });
    await waitFor(() =>
      expect(document.title).toBe("Bread questions · Glassbox"),
    );

    act(() => {
      testNavigate?.("/");
    });
    await waitFor(() => expect(document.title).toBe("Glassbox"));
  });
});
