import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NotesRail } from "./NotesRail";
import type { Conversation, Note } from "../types";

const iso = "2024-01-01T00:00:00.000Z";

const note: Note = {
  id: "n1",
  title: "Postgres tuning",
  body: "shared_buffers should be 25% of RAM",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
};

const conversation: Conversation = {
  id: "c1",
  title: "Why is it slow",
  messages: [],
  createdAt: iso,
  updatedAt: iso,
};

const renderRail = (
  overrides: Partial<ComponentProps<typeof NotesRail>> = {},
) =>
  render(
    <NotesRail
      notes={[note]}
      selectedNoteId={null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      conversations={[conversation]}
      activeConversationId={null}
      books={[]}
      selectedBookId={null}
      bookNameByNoteId={new Map<string, string>()}
      onSelectBook={vi.fn()}
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onNewChat={vi.fn()}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      chatActive={false}
      onDeleteNote={vi.fn()}
      onToggleNoteFormat={vi.fn()}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
      {...overrides}
    />,
  );

/** The toggle lives inside the heading, so it is reachable by either role. */
const toggle = (name: "Chats" | "Notes") =>
  screen.getByRole("button", { name: new RegExp(`^${name}$`) });

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("NotesRail section accordions", () => {
  it("keeps both sections open on a first visit", () => {
    renderRail();

    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Why is it slow")).toBeVisible();
    expect(screen.getByText("Postgres tuning")).toBeVisible();
  });

  it("keeps the heading role, so the outline still has both sections", () => {
    renderRail();

    expect(screen.getByRole("heading", { name: "Chats" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  });

  it("hides the chat list when the Chats heading is collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(toggle("Chats"));

    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "false");
    // Not merely "not visible": hidden removes it from the accessibility tree
    // too, which is the part a screen reader depends on.
    expect(screen.queryByText("Why is it slow")).not.toBeVisible();
  });

  it("leaves the other section alone when one is collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(toggle("Chats"));

    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Postgres tuning")).toBeVisible();
  });

  it("points the toggle at the list it controls", async () => {
    renderRail();

    const controls = toggle("Chats").getAttribute("aria-controls");
    expect(controls).toBe("rail-chats-list");
    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it("reopens a collapsed section", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(toggle("Notes"));
    await user.click(toggle("Notes"));

    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Postgres tuning")).toBeVisible();
  });

  it("remembers a collapsed section across a remount", async () => {
    const user = userEvent.setup();
    const first = renderRail();

    await user.click(toggle("Notes"));
    first.unmount();
    renderRail();

    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "false");
    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to open when the stored value is not usable", () => {
    localStorage.setItem("glassbox.railSections.v1", "{ not json");
    renderRail();

    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "true");
  });

  /* A half-written blob must not be able to shut a section with the only way
     back also hidden. */
  it("ignores a stored field that is not a boolean", () => {
    localStorage.setItem(
      "glassbox.railSections.v1",
      JSON.stringify({ chats: "nope", notes: false }),
    );
    renderRail();

    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Notes")).toHaveAttribute("aria-expanded", "false");
  });

  it("survives a localStorage that throws on write", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderRail();

    await user.click(toggle("Chats"));

    expect(toggle("Chats")).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses the sample banner with the notes section it belongs to", async () => {
    const user = userEvent.setup();
    renderRail({ hasSampleNotes: true });

    expect(
      screen.getByRole("button", { name: "Delete all samples" }),
    ).toBeInTheDocument();

    await user.click(toggle("Notes"));

    expect(
      screen.queryByRole("button", { name: "Delete all samples" }),
    ).toBeNull();
  });
});
