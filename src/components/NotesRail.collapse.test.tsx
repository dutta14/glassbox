import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesRail } from "./NotesRail";
import type { Note } from "../types";

/**
 * Collapse is ported from finance-tracking's sidebar, which drops to a 56px
 * icon strip and hides its menu entirely. The rail does the same, so most of
 * its contents unmount rather than just being visually hidden.
 */

const COLLAPSE_KEY = "glassbox.rail.v1";
const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string, body: string): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const notes = [
  mkNote("n1", "Postgres tuning", "shared_buffers should be 25% of RAM"),
  mkNote("n2", "Sourdough", "the starter was underfed"),
];

const renderRail = () =>
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
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
    />,
  );

const collapseButton = () =>
  screen.getByRole("button", { name: /(Collapse|Expand) sidebar/ });

afterEach(() => {
  localStorage.clear();
});

describe("NotesRail collapse", () => {
  it("starts expanded when nothing has been stored", () => {
    renderRail();

    expect(screen.getByText("Glassbox")).toBeInTheDocument();
    expect(screen.getByText("Postgres tuning")).toBeInTheDocument();
    expect(collapseButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("hides the brand and the note list once collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());

    expect(screen.queryByText("Glassbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Postgres tuning")).not.toBeInTheDocument();
    expect(collapseButton()).toHaveAttribute("aria-expanded", "false");
  });

  /** The only control left at 56px, so losing it would trap the user. */
  it("keeps the toggle reachable while collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    expect(collapseButton()).toBeVisible();

    await user.click(collapseButton());
    expect(screen.getByText("Postgres tuning")).toBeInTheDocument();
  });

  it("describes the action the button will take, not the current state", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(collapseButton()).toHaveAccessibleName("Collapse sidebar");
    await user.click(collapseButton());
    expect(collapseButton()).toHaveAccessibleName("Expand sidebar");
  });

  it("persists the collapsed state so it survives a reload", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("collapsed");

    await user.click(collapseButton());
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("expanded");
  });

  it("restores a stored collapsed state on mount", () => {
    localStorage.setItem(COLLAPSE_KEY, "collapsed");

    renderRail();

    expect(screen.queryByText("Glassbox")).not.toBeInTheDocument();
    expect(collapseButton()).toHaveAttribute("aria-expanded", "false");
  });

  /**
   * Collapsing unmounts the filter field. A query left in state would come
   * back invisibly on expand and silently shorten the list, with nothing on
   * screen to explain why notes were missing.
   */
  /**
   * Search moved into a modal, so the rail no longer holds filter state that
   * collapsing has to reset. What collapsing must still do is take the glyph
   * out of the tab order rather than leave an invisible control behind.
   */
  it("hides the search glyph while collapsed and brings it back on expand", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(
      screen.getByRole("button", { name: "Search notes" }),
    ).toBeInTheDocument();

    await user.click(collapseButton());
    expect(
      screen.queryByRole("button", { name: "Search notes" }),
    ).not.toBeInTheDocument();

    await user.click(collapseButton());
    expect(
      screen.getByRole("button", { name: "Search notes" }),
    ).toBeInTheDocument();
  });

  it("keeps every note in the rail list across a collapse and expand", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    await user.click(collapseButton());

    expect(screen.getByText("Postgres tuning")).toBeInTheDocument();
    expect(screen.getByText("Sourdough")).toBeInTheDocument();
  });

  it("survives a localStorage that throws", async () => {
    const user = userEvent.setup();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    renderRail();
    await user.click(collapseButton());

    expect(screen.queryByText("Glassbox")).not.toBeInTheDocument();
    setItem.mockRestore();
  });
});
