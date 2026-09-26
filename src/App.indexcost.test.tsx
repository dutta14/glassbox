import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { markSeeded } from "./storage/notes";
import { COPY } from "./engine/copy";
import type { Note } from "./types";
import type {
  BookStore,
  ConversationStore,
  NotesStore,
} from "./storage/types";

/**
 * The retrieval index is expensive and has exactly one reader: the route()
 * call made when a question is submitted. It used to be built in a useMemo
 * keyed on the notes array, and useNotes replaces that array on every edit,
 * which the editor fires per keystroke. On the library this was built for
 * that measured at 80ms of rebuilding between one character and the next,
 * for a value nothing reads until the reader asks something.
 *
 * Nothing about that was visible in the suite, because the cost only shows up
 * at hundreds of notes while the fixtures use a handful. These tests watch the
 * number of builds rather than the clock, so they fail on the mistake itself
 * rather than on a machine being slow.
 */
const spy = vi.hoisted(() => ({ builds: 0 }));

vi.mock("./engine/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./engine/router")>();
  return {
    ...actual,
    createIndex: (notes: Note[]) => {
      spy.builds += 1;
      return actual.createIndex(notes);
    },
  };
});

const { AppReady } = await import("./App");

const mkNote = (i: number): Note => ({
  id: `n${i}`,
  title: `Note ${i}`,
  body: `Body number ${i}, concerning postgres and sourdough bread.`,
  tags: [],
  createdAt: "2020-01-01T12:00:00.000Z",
  updatedAt: "2020-01-01T12:00:00.000Z",
});

const notesStore = (notes: Note[]): NotesStore => ({
  kind: "local",
  label: "Test",
  isAvailable: () => true,
  async list() {
    return notes;
  },
  async put() {},
  async remove() {},
});

const conversationStore: ConversationStore = {
  kind: "local",
  async list() {
    return { conversations: [], skipped: 0 };
  },
  async put() {},
  async remove() {},
};

const bookStore: BookStore = {
  kind: "local",
  async list() {
    return { books: [], skipped: 0 };
  },
  async put() {},
  async remove() {},
};

const renderApp = (at: string, notes: Note[]) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <AppReady
        store={notesStore(notes)}
        conversationStore={conversationStore}
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

const threeNotes = () => [mkNote(0), mkNote(1), mkNote(2)];

/* Ask lives in a pane that starts closed, so asking begins by opening it. The
   helper does that only when the button is there, which keeps it usable for a
   second question in the same test without stacking opens. */
/* Ask lives in a pane that starts closed, so every question begins by opening
   it. Waiting for the button rather than assuming it is there is what makes
   this survive the app's load: the stage renders nothing until the notes
   resolve. */
const openAsk = async (user: ReturnType<typeof userEvent.setup>) => {
  const opener = await screen.findByRole("button", { name: COPY.askOpen });
  await user.click(opener);
  return screen.findByRole("textbox", { name: /ask/i });
};

const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const composer = await screen.findByRole("textbox", { name: /ask/i });
  await user.type(composer, text);
  await user.keyboard("{Enter}");
};

describe("the retrieval index is built only when it is read", () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
    spy.builds = 0;
  });

  it("does not build the index while a note is being typed into", async () => {
    const user = userEvent.setup();
    renderApp("/note/n0", threeNotes());
    const body = await screen.findByRole("textbox", { name: /body/i });

    spy.builds = 0;
    await user.type(body, "hello");

    /* Five characters. This was five full passes over the corpus before the
       index was made lazy, and the editor is the one place in the app where a
       handler runs on every keypress. */
    expect(spy.builds).toBe(0);
  });

  it("does not build the index merely because the app opened", async () => {
    const user = userEvent.setup();
    renderApp("/", threeNotes());
    /* Opening the pane is not asking. The composer is on screen and the index
       still has not been built, which is the whole point of making it lazy. */
    await openAsk(user);

    expect(spy.builds).toBe(0);
  });

  it("builds the index when a question is actually asked", async () => {
    const user = userEvent.setup();
    renderApp("/", threeNotes());
    await openAsk(user);

    spy.builds = 0;
    await ask(user, "what did I write about postgres");

    expect(spy.builds).toBe(1);
  });

  it("reuses the index for a second question when no note has changed", async () => {
    const user = userEvent.setup();
    renderApp("/", threeNotes());
    await openAsk(user);

    spy.builds = 0;
    await ask(user, "what did I write about postgres");
    await ask(user, "what did I write about bread");

    /* Asking again costs nothing. The corpus did not move between the two, so
       rebuilding would be the same work for the same answer. */
    expect(spy.builds).toBe(1);
  });

  it("rebuilds once on the next question after a note is edited", async () => {
    const user = userEvent.setup();
    renderApp("/", threeNotes());
    await openAsk(user);

    spy.builds = 0;
    await ask(user, "what did I write about postgres");
    expect(spy.builds).toBe(1);

    /* Add a note, which is the cheapest way to move the corpus. The pane
       opens over the editor rather than replacing it, so the note stays put
       while the question is asked. */
    await user.click(screen.getByRole("button", { name: "New note" }));
    const body = await screen.findByRole("textbox", { name: /body/i });
    await user.type(body, "rye starter notes");
    /* Still nothing: the corpus moved, and moved again on every one of those
       seventeen characters, but nobody has asked. */
    expect(spy.builds).toBe(1);

    await ask(user, "what did I write about rye");
    /* Exactly one more. The cache noticed the corpus moved and rebuilt once,
       rather than once per keystroke or not at all. */
    expect(spy.builds).toBe(2);
  });
});
