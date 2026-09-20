import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import type { Note } from "../types";

/**
 * Deleting used to live in a footer button inside the editor, which meant you
 * could only delete the note you had open. It now hangs off each rail row, so
 * the path from row menu to confirmed deletion is worth locking down.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  body: "body",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const notes = [mkNote("n1", "Postgres tuning"), mkNote("n2", "Sourdough")];

const renderRail = (onDeleteNote = vi.fn()) => {
  render(
    <NotesRail
      notes={notes}
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
      onDeleteNote={onDeleteNote}
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
      onDeleteBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
    />,
  );
  return { onDeleteNote };
};

const menuFor = (title: string) =>
  screen.getByRole("button", { name: `More actions for ${title}` });

describe("NotesRail row deletion", () => {
  it("gives every row its own actions menu", () => {
    renderRail();

    expect(menuFor("Postgres tuning")).toBeInTheDocument();
    expect(menuFor("Sourdough")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, naming the note", async () => {
    const user = userEvent.setup();
    const { onDeleteNote } = renderRail();

    await user.click(menuFor("Sourdough"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      'Delete "Sourdough"?',
    );
    expect(onDeleteNote).not.toHaveBeenCalled();
  });

  it("deletes the row whose menu was used, not the selected note", async () => {
    const user = userEvent.setup();
    const { onDeleteNote } = renderRail();

    await user.click(menuFor("Sourdough"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDeleteNote).toHaveBeenCalledTimes(1);
    expect(onDeleteNote).toHaveBeenCalledWith("n2");
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { onDeleteNote } = renderRail();

    await user.click(menuFor("Postgres tuning"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDeleteNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("returns focus to the row's menu trigger after cancelling", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(menuFor("Postgres tuning"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(menuFor("Postgres tuning")).toHaveFocus());
  });

  it("keeps only one row menu open at a time", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(menuFor("Postgres tuning"));
    await user.click(menuFor("Sourdough"));

    expect(screen.getAllByRole("menuitem", { name: "Delete" })).toHaveLength(1);
    expect(menuFor("Postgres tuning")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
