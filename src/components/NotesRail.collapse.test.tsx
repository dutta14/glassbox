import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NotesRail } from "./NotesRail";
import { COPY } from "../engine/copy";
import type { Note } from "../types";

/**
 * Collapsing removes the rail entirely. The only thing left is a menu button
 * at the top-left of the page, so most of the rail's contents unmount rather
 * than being visually hidden.
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

const renderRail = (
  overrides: Partial<ComponentProps<typeof NotesRail>> = {},
) =>
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
      onDeleteBook={vi.fn()}
      onCreateBook={vi.fn()}
      onAddNoteToBook={vi.fn()}
      onToggleTheme={vi.fn()}
      {...overrides}
    />,
  );

const collapseButton = () =>
  screen.getByRole("button", { name: "Collapse sidebar" });
const openButton = () => screen.getByRole("button", { name: "Open sidebar" });

afterEach(() => {
  localStorage.clear();
});

describe("NotesRail collapse", () => {
  it("starts expanded when nothing has been stored", () => {
    renderRail();

    expect(screen.getByText("Glassbox")).toBeInTheDocument();
    expect(screen.getByText("Postgres tuning")).toBeInTheDocument();
    expect(collapseButton()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("hides the brand and the note list once collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());

    expect(screen.queryByText("Glassbox")).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.railTagline)).not.toBeInTheDocument();
    expect(screen.queryByText("Postgres tuning")).not.toBeInTheDocument();
  });

  /** The only control left, so losing it would trap the user. */
  it("offers an Open sidebar button while collapsed and reopens the rail with it", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    expect(openButton()).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Collapse sidebar" }),
    ).not.toBeInTheDocument();

    await user.click(openButton());
    expect(screen.getByText("Postgres tuning")).toBeInTheDocument();
    expect(collapseButton()).toBeInTheDocument();
  });

  it("persists the collapsed state so it survives a reload", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("collapsed");

    await user.click(openButton());
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("expanded");
  });

  it("restores a stored collapsed state on mount", () => {
    localStorage.setItem(COLLAPSE_KEY, "collapsed");

    renderRail();

    expect(screen.queryByText("Glassbox")).not.toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
  });

  /* Collapsed means no rail at all, so no icon strip or flyout trigger is
     left behind to stand in for the lists. */
  it("leaves no search, new, or notes controls behind while collapsed", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());

    expect(screen.queryByRole("button", { name: "Search notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: COPY.askRow })).toBeNull();
  });

  it("keeps every note in the rail list across a collapse and expand", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(collapseButton());
    await user.click(openButton());

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
    expect(openButton()).toBeInTheDocument();
    setItem.mockRestore();
  });

  /* The rail's CSS is not exercised by the suite, so position on screen is not
     verifiable here, but DOM order drives both the visual order and the tab
     order. */
  it("puts the collapse button in the masthead, after the brand", () => {
    renderRail();

    const toggle = collapseButton();
    const mast = toggle.closest(".notes-rail__mast");
    const brand = screen.getByText("Glassbox");

    expect(mast).not.toBeNull();
    expect(mast!.contains(brand)).toBe(true);
    expect(mast!.lastElementChild).toBe(toggle);
  });

  it("shows the tagline under the masthead, before New and Search", () => {
    renderRail();

    const tagline = screen.getByText(COPY.railTagline);
    const links = document.querySelector(".notes-rail__links");

    expect(links).not.toBeNull();
    expect(
      tagline.compareDocumentPosition(links!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(links!.textContent).toContain("New");
    expect(links!.textContent).toContain("Search");
  });
});
