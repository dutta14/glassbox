import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { COPY } from "../engine/copy";
import type {
  Answer,
  ChatMessage as ChatMessageType,
  Note,
  ScoredChunk,
} from "../types";

/**
 * ChatPanel had zero coverage until now. Sasha's B3 (clear-chat dropping
 * focus to <body>) shipped precisely because of that gap. These tests
 * cover the load-bearing surface at the ChatPanel level.
 *
 * Focus-trap internals of ConfirmDialog are covered elsewhere; here we
 * assert the outcome after ChatPanel's onConfirm/onCancel handlers run.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkChunk = (noteId: string, title: string): ScoredChunk => ({
  noteId,
  noteTitle: title,
  position: 0,
  text: "shared_buffers should be 25% of RAM.",
  score: 0.42,
  matchedTerms: ["postgres"],
  coverage: 0.75,
});

const mkAnswer = (noteId: string, title: string): Answer => {
  const s = mkChunk(noteId, title);
  return {
    text: s.text,
    sources: [s],
    trace: {
      intent: "search",
      confidence: 0.42,
      queryTerms: ["postgres"],
      candidatesConsidered: 3,
      results: [s],
      reason: "quoted the highest scoring passage",
    },
  };
};

const mkUser = (id: string, text: string): ChatMessageType => ({
  id,
  role: "user",
  text,
  createdAt: iso,
});

const mkAssistant = (
  id: string,
  noteId: string,
  title: string,
): ChatMessageType => ({
  id,
  role: "assistant",
  text: mkAnswer(noteId, title).text,
  answer: mkAnswer(noteId, title),
  createdAt: iso,
});

const mkNote = (id: string, title: string, createdAt = iso): Note => ({
  id,
  title,
  body: "",
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

interface HarnessProps {
  messages: ChatMessageType[];
  notes: Note[];
  onSubmit?: (text: string) => void;
  onJumpToNote?: (noteId: string) => void;
  onExamplePrompt?: (text: string) => void;
  isFirstAssistantMessage?: (id: string) => boolean;
}

const renderChatPanel = ({
  messages,
  notes,
  onSubmit = vi.fn(),
  onJumpToNote = vi.fn(),
  onExamplePrompt = vi.fn(),
  isFirstAssistantMessage = () => false,
}: HarnessProps) =>
  render(
    <ChatPanel
      messages={messages}
      notes={notes}
      onSubmit={onSubmit}
      onJumpToNote={onJumpToNote}
      onExamplePrompt={onExamplePrompt}
      isFirstAssistantMessage={isFirstAssistantMessage}
    />,
  );

describe("ChatPanel — empty state", () => {
  it("renders the empty-state heading when there are no messages", () => {
    renderChatPanel({ messages: [], notes: [mkNote("n1", "Postgres tuning")] });
    expect(
      screen.getByRole("heading", { name: COPY.askTitle }),
    ).toBeInTheDocument();
  });

  it("renders the three example prompt buttons when notes exist and there are no messages", () => {
    renderChatPanel({ messages: [], notes: [mkNote("n1", "Postgres tuning")] });
    expect(
      screen.getByRole("button", { name: "What did I write about postgres?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show me #work notes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What did I write about postgres?" }),
    ).toBeInTheDocument();
  });

  it("calls onExamplePrompt with the example text when an example prompt button is clicked", async () => {
    const onExamplePrompt = vi.fn();
    renderChatPanel({
      messages: [],
      notes: [mkNote("n1", "Postgres tuning")],
      onExamplePrompt,
    });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "What did I write about postgres?" }),
    );
    expect(onExamplePrompt).toHaveBeenCalledTimes(1);
    expect(onExamplePrompt).toHaveBeenCalledWith(
      "What did I write about postgres?",
    );
  });
});

/**
 * Clear chat is gone. Conversations are separate records now, so emptying a
 * transcript in place has no meaning: starting a new chat leaves the old one
 * intact in the rail, and deleting one removes it outright.
 *
 * This guards removal rather than absence of a class name. A button can be
 * visually hidden and still be reachable by keyboard and screen reader, which
 * is the failure this asserts against.
 */
describe("ChatPanel — Clear chat is removed", () => {
  const twoMessages = (): ChatMessageType[] => [
    mkUser("u1", "What did I write about postgres?"),
    mkAssistant("a1", "n1", "Postgres tuning"),
  ];

  it("offers no Clear chat control once a conversation has messages", () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote("n1", "Postgres tuning")],
    });

    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("exposes no confirmation dialog to clear a transcript", () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote("n1", "Postgres tuning")],
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.body.textContent).not.toMatch(/clear chat/i);
  });

  it("renders no toolbar row above the conversation", () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote("n1", "Postgres tuning")],
    });

    expect(document.querySelector(".chat__toolbar")).toBeNull();
  });
});

/**
 * The greeting and the composer now sit together in the middle of an empty
 * pane instead of the heading floating above an input pinned to the floor.
 *
 * The obvious way to build that is to nest the composer inside the empty
 * block, which would put it at a different position in the tree in each
 * branch. React reconciles by position, so the textarea would unmount and
 * remount the moment the first message landed, dropping the caret to <body>
 * mid-conversation. The layout is done with auto margins for that reason, and
 * these tests hold the DOM order still.
 */
describe("ChatPanel — welcome layout", () => {
  const panel = () => document.querySelector(".chat");

  it("marks the panel empty so the greeting and composer centre as one group", () => {
    renderChatPanel({ messages: [], notes: [mkNote("n1", "Postgres tuning")] });

    expect(panel()).toHaveClass("chat--empty");
  });

  it("drops the empty marker once the conversation has a message", () => {
    renderChatPanel({
      messages: [mkUser("m1", "how much shared_buffers?")],
      notes: [mkNote("n1", "Postgres tuning")],
    });

    expect(panel()).not.toHaveClass("chat--empty");
  });

  it("keeps the composer a direct child of the panel in both states", () => {
    const notes = [mkNote("n1", "Postgres tuning")];

    const { unmount } = renderChatPanel({ messages: [], notes });
    expect(document.querySelector(".chat > .composer")).not.toBeNull();
    unmount();

    renderChatPanel({ messages: [mkUser("m1", "why?")], notes });
    expect(document.querySelector(".chat > .composer")).not.toBeNull();
  });

  it("leaves the caret in the composer when the first message arrives", async () => {
    const notes = [mkNote("n1", "Postgres tuning")];
    const props = {
      notes,
      onSubmit: vi.fn(),
      onJumpToNote: vi.fn(),
      onExamplePrompt: vi.fn(),
      isFirstAssistantMessage: () => false,
    };

    const { rerender } = render(<ChatPanel messages={[]} {...props} />);

    const input = screen.getByRole("textbox", { name: /ask/i });
    input.focus();
    expect(document.activeElement).toBe(input);

    rerender(<ChatPanel messages={[mkUser("m1", "why?")]} {...props} />);

    expect(document.activeElement).toBe(input);
    expect(input).toBeInTheDocument();
  });
});

/**
 * The empty state is where the app says what it is. It claims to be an
 * archive, and it backs the claim with the reader's own numbers, so those
 * numbers have to be right for a library that spans years, one that does
 * not, and one whose notes never got a usable date.
 */
describe("ChatPanel — the archive line", () => {
  /* Midday, not midnight. The year is read in local time, which is right:
     createdAt is stamped from the writer's own clock, so a note made at
     16:00 in California on New Year's Eve belongs to the year they were
     living in, not the one UTC had already turned over to. Midnight UTC
     fixtures would therefore land in different years depending on where the
     suite runs, and pass in London while failing in Los Angeles. */
  it("names how many notes there are and the years they span", () => {
    renderChatPanel({
      messages: [],
      notes: [
        mkNote("n1", "Oldest", "2010-04-02T12:00:00.000Z"),
        mkNote("n2", "Middle", "2018-07-09T12:00:00.000Z"),
        mkNote("n3", "Newest", "2026-01-01T12:00:00.000Z"),
      ],
    });

    expect(screen.getByText("3 notes, 2010 to 2026.")).toBeInTheDocument();
  });

  it("gives a single year once rather than as a span of itself", () => {
    renderChatPanel({
      messages: [],
      notes: [
        mkNote("n1", "One", "2014-03-01T12:00:00.000Z"),
        mkNote("n2", "Two", "2014-11-01T12:00:00.000Z"),
      ],
    });

    expect(screen.getByText("2 notes, 2014.")).toBeInTheDocument();
    expect(screen.queryByText(/2014 to 2014/)).not.toBeInTheDocument();
  });

  it("counts a lone note in the singular", () => {
    renderChatPanel({
      messages: [],
      notes: [mkNote("n1", "Only", "2014-03-01T12:00:00.000Z")],
    });

    expect(screen.getByText("1 note, 2014.")).toBeInTheDocument();
  });

  it("ignores notes with an unreadable date instead of dating the archive to NaN", () => {
    renderChatPanel({
      messages: [],
      notes: [
        mkNote("n1", "Dated", "2011-05-01T12:00:00.000Z"),
        mkNote("n2", "Undated", "not a date"),
        mkNote("n3", "Dated", "2020-05-01T12:00:00.000Z"),
      ],
    });

    /* All three are still counted; only the broken date is kept out of the
       span, because a note that exists is part of the archive even when we
       cannot say when it was written. */
    expect(screen.getByText("3 notes, 2011 to 2020.")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("says nothing about a span when no note has a readable date", () => {
    renderChatPanel({
      messages: [],
      notes: [mkNote("n1", "Undated", "not a date")],
    });

    expect(screen.queryByText(/note,/)).not.toBeInTheDocument();
    /* The promise still stands even when the span cannot be drawn. */
    expect(screen.getByText(COPY.archiveContract)).toBeInTheDocument();

    /* An absent line has to be absent rather than blank. The empty state is
       a flex column with a gap, so a paragraph holding nothing still opens a
       band of space in the middle of it and reads as a layout fault. */
    const blanks = [...screen.getByLabelText(COPY.chatRegion).querySelectorAll("p")].filter(
      (p) => p.textContent?.trim() === "",
    );
    expect(blanks).toHaveLength(0);
  });

  it("offers the add-a-note prompt instead of an archive line when there are no notes", () => {
    renderChatPanel({ messages: [], notes: [] });

    expect(screen.getByText(COPY.emptyNotesChat)).toBeInTheDocument();
    expect(screen.queryByText(/notes, /)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.archiveContract)).not.toBeInTheDocument();
  });

  it("drops the archive line once the conversation has started", () => {
    renderChatPanel({
      messages: [mkUser("u1", "what did I write about postgres")],
      notes: [mkNote("n1", "Postgres tuning", "2010-04-02T12:00:00.000Z")],
    });

    expect(screen.queryByText("1 note, 2010.")).not.toBeInTheDocument();
  });
});
