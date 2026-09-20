import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { NoteEditor } from "./NoteEditor";
import { NotesRail } from "./NotesRail";
import type { Conversation, Note } from "../types";
import { COPY } from "../engine/copy";

/**
 * The Chat/Editor tablist above the stage is gone and the rail is now the only
 * way back into the chat. Nothing covered the tablist, so nothing would have
 * noticed either its removal or the two things its removal broke: a rail with
 * no route back to chat, and two panels whose aria-labelledby pointed at tab
 * ids that no longer exist, leaving both landmarks unnamed.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string, body = ""): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const mkConversation = (id: string, title: string): Conversation => ({
  id,
  title,
  messages: [],
  createdAt: iso,
  updatedAt: iso,
});

const renderRail = (
  overrides: {
    chatActive?: boolean;
    selectedNoteId?: string | null;
    conversations?: Conversation[];
    activeConversationId?: string | null;
  } = {},
) => {
  const onNewChat = vi.fn();
  const onCreate = vi.fn();
  render(
    <NotesRail
      notes={[mkNote("n1", "Postgres tuning")]}
      selectedNoteId={overrides.selectedNoteId ?? null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={vi.fn()}
      onCreate={onCreate}
      conversations={overrides.conversations ?? []}
      activeConversationId={overrides.activeConversationId ?? null}
      onNewChat={onNewChat}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      chatActive={overrides.chatActive ?? false}
      onDeleteNote={vi.fn()}
      onToggleNoteFormat={vi.fn()}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      books={[]}
      selectedBookId={null}
      bookNameByNoteId={new Map<string, string>()}
      onSelectBook={vi.fn()}
      onOpenBooks={vi.fn()}
      onOpenChapter={vi.fn()}
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
      organizeMode="list"
      onOrganizeChange={vi.fn()}
    />,
  );
  return { onNewChat, onCreate };
};

const chatEntry = () => screen.getByRole("button", { name: COPY.askRow });
const newNote = () => screen.getByRole("button", { name: "New note" });

describe("rail Ask entry", () => {
  it("places the Ask entry directly above the new-note item", () => {
    renderRail();

    const position = chatEntry().compareDocumentPosition(newNote());

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // New note is wrapped now, because it shares a row with the caret that
    // opens Note/Verse. Adjacency is asserted through that wrapper rather
    // than being dropped, so the two entries still cannot drift apart.
    expect(chatEntry().nextElementSibling).toContainElement(newNote());
  });

  it("starts a new question when the entry is pressed", async () => {
    const { onNewChat, onCreate } = renderRail();

    await userEvent.click(chatEntry());

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("marks the Ask entry as current while an unsent draft is showing", () => {
    renderRail({ chatActive: true });

    expect(chatEntry()).toHaveAttribute("aria-current", "true");
    // The class is what actually makes the state visible, and no role-based
    // query can see it.
    expect(chatEntry()).toHaveClass("notes-rail__entry--active");
  });

  it("drops the current marker once another view is showing", () => {
    renderRail({ chatActive: false });

    expect(chatEntry()).not.toHaveAttribute("aria-current");
    expect(chatEntry()).not.toHaveClass("notes-rail__entry--active");
  });

  /**
   * Opening the chat does not clear the selected note in App, so without this
   * the rail marked two rows current at once: the chat entry and whichever
   * note was open behind it.
   */
  it("stops marking the last opened note as current once the chat is showing", () => {
    renderRail({ chatActive: true, selectedNoteId: "n1" });

    const row = screen.getByRole("button", { name: "Postgres tuning" });

    expect(row).not.toHaveAttribute("aria-current");
    expect(chatEntry()).toHaveAttribute("aria-current", "true");
  });

  it("marks the open note as current again once the chat is not showing", () => {
    renderRail({ chatActive: false, selectedNoteId: "n1" });

    expect(
      screen.getByRole("button", { name: "Postgres tuning" }),
    ).toHaveAttribute("aria-current", "true");
  });

  /**
   * Three things can be current now: an unsent draft, a saved conversation,
   * and a note. Exactly one of them may say so. These are the pairs that a
   * naive implementation marks twice.
   */
  it("drops the current marker from the Ask entry once a saved question is open", () => {
    renderRail({
      chatActive: true,
      conversations: [mkConversation("c1", "why is the fog grading?")],
      activeConversationId: "c1",
    });

    expect(chatEntry()).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("button", { name: "why is the fog grading?" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("marks exactly one row current when a saved chat is open", () => {
    renderRail({
      chatActive: true,
      selectedNoteId: "n1",
      conversations: [
        mkConversation("c1", "first chat"),
        mkConversation("c2", "second chat"),
      ],
      activeConversationId: "c2",
    });

    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it("marks no conversation current while a note is open", () => {
    renderRail({
      chatActive: false,
      selectedNoteId: "n1",
      conversations: [mkConversation("c1", "first chat")],
      activeConversationId: "c1",
    });

    expect(
      screen.getByRole("button", { name: "first chat" }),
    ).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it("shows the chats empty state when there are no conversations", () => {
    renderRail();

    expect(
      document
        .getElementById("rail-chats-list")
        ?.querySelector(".notes-rail__empty-body")?.textContent,
    ).toBe(COPY.emptyChatsSidebar);
  });

  it("lists the Questions section above the Notes section", () => {
    renderRail({ conversations: [mkConversation("c1", "a chat")] });

    const chats = screen.getByRole("heading", { name: COPY.questionsHeading });
    const notes = screen.getByRole("heading", { name: "Notes" });

    expect(
      chats.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /* One scroll area, not two. Two would run out of room independently and
     strand one list while the other still had space. */
  it("puts both lists inside the same scrolling element", () => {
    renderRail({ conversations: [mkConversation("c1", "a chat")] });

    const scroller = document.querySelector(".notes-rail__list");

    expect(
      scroller?.contains(screen.getByRole("button", { name: "a chat" })),
    ).toBe(true);
    expect(
      scroller?.contains(
        screen.getByRole("button", { name: "Postgres tuning" }),
      ),
    ).toBe(true);
  });

  it("no longer renders a tablist anywhere in the rail", () => {
    renderRail();

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("panels left without their tabs", () => {
  /**
   * getByRole with a name only matches once the name actually resolves, so a
   * dangling aria-labelledby fails this rather than passing quietly.
   */
  it("names the chat panel without leaning on the removed chat tab", () => {
    render(
      <ChatPanel
        messages={[]}
        notes={[mkNote("n1", "Postgres tuning")]}
        onSubmit={vi.fn()}
        onJumpToNote={vi.fn()}
        onExamplePrompt={vi.fn()}
        isFirstAssistantMessage={() => false}
      />,
    );

    expect(screen.getByRole("region", { name: COPY.chatRegion })).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });

  it("names the editor panel without leaning on the removed editor tab", () => {
    render(
      <NoteEditor
        readAsset={async () => null}
        note={mkNote("n1", "A title", "body")}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onScrollHandled={vi.fn()}
        previousNote={null}
        nextNote={null}
        onSelectNote={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Note editor" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });
});
