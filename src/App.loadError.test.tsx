import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppReady } from "./App";
import type { FolderState } from "./hooks/useStorageBackend";
import type { Conversation } from "./types";
import type {
  BookStore,
  ConversationListResult,
  ConversationStore,
  NotesStore,
} from "./storage/types";

/**
 * When the notes cannot be read, the app draws only the error. The rail, and
 * the settings that disconnect a folder, are not on screen, so the error has
 * to carry its own way out or a folder that fails to load fails on every
 * launch.
 */

const MESSAGE =
  "A requested file or directory could not be found at the time an operation was processed.";

const brokenStore = (): NotesStore => ({
  kind: "folder",
  label: "broken",
  isAvailable: () => true,
  async list() {
    throw new Error(MESSAGE);
  },
  async put() {},
  async remove() {},
});

const conversations: ConversationStore = {
  kind: "local",
  async list(): Promise<ConversationListResult> {
    return { conversations: [] as Conversation[], skipped: 0 };
  },
  async put() {},
  async remove() {},
};

const books: BookStore = {
  kind: "local",
  async list() {
    return { books: [], skipped: 0 };
  },
  async put() {},
  async remove() {},
};

const renderBroken = (folderState: FolderState, onDisconnect = vi.fn()) => {
  render(
    <MemoryRouter>
      <AppReady
        store={brokenStore()}
        conversationStore={conversations}
        bookStore={books}
        folderState={folderState}
        folderName="Notes"
        connectError={null}
        onConnect={() => {}}
        onReconnect={() => {}}
        onDisconnect={onDisconnect}
      />
    </MemoryRouter>,
  );
  return onDisconnect;
};

describe("the load error screen", () => {
  it("shows what failed", async () => {
    renderBroken("connected");

    expect(await screen.findByText("Could not load your notes.")).toBeTruthy();
    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it("offers a way back to this browser's notes when a folder is connected, and disconnects on click", async () => {
    const onDisconnect = renderBroken("connected");

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Use the notes saved in this browser",
      }),
    );

    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("offers no folder action when no folder is connected", async () => {
    renderBroken("disconnected");
    await screen.findByText("Could not load your notes.");

    expect(
      screen.queryByRole("button", {
        name: "Use the notes saved in this browser",
      }),
    ).toBeNull();
  });
});
