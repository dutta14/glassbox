import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatInput } from "./ChatInput";
import { ChatPanel } from "./ChatPanel";
import { NoteEditor } from "./NoteEditor";
import { NotesRail } from "./NotesRail";
import type { ChatMessage, Note } from "../types";

/**
 * useScrollFades is covered on its own. What is covered here is the wiring:
 * that the `scroll-fades` class sits on the element the CSS actually makes
 * scrollable, in each of the three panes.
 *
 * This needs its own assertions because nothing else can catch it. The class
 * is invisible to role-based queries, the suite never evaluates CSS
 * (`css: false` in vite.config.ts), and the hook writes to whatever element it
 * is handed without caring whether that element scrolls. The first attempt put
 * the editor's fades on the section, which does not overflow, and the build
 * and all 405 tests stayed green while nothing faded on screen.
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

const fades = (el: Element | null | undefined) =>
  el?.classList.contains("scroll-fades") ?? false;

describe("scroll fade wiring", () => {
  it("fades the rail list, which is the element that scrolls the notes", () => {
    render(
      <NotesRail
        notes={[mkNote("n1", "Postgres tuning")]}
        selectedNoteId={null}
        hasSampleNotes={false}
        folderState="unsupported"
        folderName={null}
        connectError={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        conversations={[]}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        chatActive={false}
        onDeleteNote={vi.fn()}
        onDeleteSamples={vi.fn()}
        onConnectFolder={vi.fn()}
        onReconnectFolder={vi.fn()}
        onDisconnectFolder={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />,
    );

    const list = document.querySelector(".notes-rail__list");

    expect(list).not.toBeNull();
    expect(fades(list)).toBe(true);
    // The <ul> inside it does not scroll, so fading it would do nothing.
    expect(fades(list!.querySelector("ul"))).toBe(false);
  });

  it("fades the chat log, which is the element that scrolls the transcript", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "user",
      text: "how do I tune postgres",
      createdAt: iso,
    };
    render(
      <ChatPanel
        messages={[message]}
        notes={[mkNote("n1", "Postgres tuning")]}
        onSubmit={vi.fn()}
        onJumpToNote={vi.fn()}
        onExamplePrompt={vi.fn()}
        isFirstAssistantMessage={() => false}
      />,
    );

    const log = document.querySelector(".chat__log");

    expect(log).not.toBeNull();
    expect(fades(log)).toBe(true);
  });

  it("fades the note body textarea, which is what scrolls a long note", () => {
    render(
      <NoteEditor
        note={mkNote("n1", "A title", "a long body")}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    expect(fades(screen.getByLabelText("Note body"))).toBe(true);
  });

  /**
   * The fill sits on .composer__row rather than the textarea precisely so this
   * mask only touches the text. Masking the textarea while it painted the
   * white pill would have faded the pill out to the page colour at each edge.
   */
  it("fades the composer text, which scrolls once the box hits its cap", () => {
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(fades(screen.getByLabelText("Ask a question"))).toBe(true);
    expect(fades(document.querySelector(".composer__row"))).toBe(false);
  });

  it("also fades the editor section, which scrolls when the pane is too short", () => {
    render(
      <NoteEditor
        note={mkNote("n1", "A title", "a long body")}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    expect(fades(document.querySelector(".editor"))).toBe(true);
  });
});
