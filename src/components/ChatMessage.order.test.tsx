import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";
import type {
  Answer,
  ChatMessage as ChatMessageType,
  Note,
  ScoredChunk,
} from "../types";

/**
 * The reasoning disclosure leads the assistant message, above the answer.
 *
 * This is a deliberate layout choice and nothing else asserts it. When the
 * reasoning was moved from the bottom of the message to the top, the entire
 * suite stayed green, which means the order was never covered. Ordering is
 * also not purely cosmetic: DOM order is the screen reader reading order, so
 * a silent revert changes what a screen reader announces first after an
 * answer is appended to the log.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkChunk = (): ScoredChunk => ({
  noteId: "n1",
  noteTitle: "Postgres tuning",
  position: 0,
  text: "shared_buffers should be 25% of RAM.",
  score: 0.42,
  matchedTerms: ["postgres"],
  coverage: 0.75,
});

const mkAnswer = (): Answer => {
  const source = mkChunk();
  return {
    text: source.text,
    sources: [source],
    trace: {
      intent: "search",
      confidence: 0.42,
      queryTerms: ["postgres"],
      candidatesConsidered: 3,
      results: [source],
      reason: "quoted the highest scoring passage",
    },
  };
};

const notes: Note[] = [
  {
    id: "n1",
    title: "Postgres tuning",
    body: "shared_buffers should be 25% of RAM.",
    tags: [],
    createdAt: iso,
    updatedAt: iso,
  },
];

const renderMessage = () => {
  const message: ChatMessageType = {
    id: "m1",
    role: "assistant",
    text: mkAnswer().text,
    answer: mkAnswer(),
    createdAt: iso,
  };
  return render(
    <ChatMessage
      message={message}
      userQuery="postgres tuning"
      notes={notes}
      onJumpToNote={vi.fn()}
    />,
  );
};

describe("assistant message layout order", () => {
  it("renders the reasoning disclosure before the quoted answer in the DOM", () => {
    renderMessage();

    const summary = screen.getByRole("button", { expanded: false });
    const quote = screen.getByRole("blockquote");

    const position = summary.compareDocumentPosition(quote);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the "Open note" action after the quoted answer', () => {
    renderMessage();

    const quote = screen.getByRole("blockquote");
    const openNote = screen.getByRole("button", { name: "Open note" });

    const position = quote.compareDocumentPosition(openNote);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
