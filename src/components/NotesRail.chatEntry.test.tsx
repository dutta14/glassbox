import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { NoteEditor } from "./NoteEditor";
import { NotesRail } from "./NotesRail";
import type { Note } from "../types";

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

const renderRail = (
  overrides: { chatActive?: boolean; selectedNoteId?: string | null } = {},
) => {
  const onOpenChat = vi.fn();
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
      onOpenChat={onOpenChat}
      chatActive={overrides.chatActive ?? false}
      onDeleteNote={vi.fn()}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
    />,
  );
  return { onOpenChat, onCreate };
};

const chatEntry = () => screen.getByRole("button", { name: "Chat" });
const newNote = () => screen.getByRole("button", { name: "New note" });

describe("rail chat entry", () => {
  it("places the chat entry directly above the new-note item", () => {
    renderRail();

    const position = chatEntry().compareDocumentPosition(newNote());

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chatEntry().nextElementSibling).toBe(newNote());
  });

  it("opens the chat when the entry is pressed", async () => {
    const { onOpenChat, onCreate } = renderRail();

    await userEvent.click(chatEntry());

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("marks the chat entry as current while the chat is showing", () => {
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
        onClear={vi.fn()}
        onSubmit={vi.fn()}
        onJumpToNote={vi.fn()}
        onExamplePrompt={vi.fn()}
        isFirstAssistantMessage={() => false}
      />,
    );

    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });

  it("names the editor panel without leaning on the removed editor tab", () => {
    render(
      <NoteEditor
        note={mkNote("n1", "A title", "body")}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Note editor" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });
});
