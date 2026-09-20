import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookChapterList } from "./BookChapterList";
import { COPY } from "../engine/copy";
import type { Note } from "../types";

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  body: "body",
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const CHAPTERS = [
  mkNote("c1", "#1 \u2013 The Drizzle"),
  mkNote("c2", "Chapter 2: Abdul's Shop"),
];

const renderList = (
  overrides: Partial<{
    chapters: Note[];
    currentNoteId: string | null;
    openMenuId: string | null;
  }> = {},
) => {
  const handlers = {
    onSelect: vi.fn(),
    onMenuOpenChange: vi.fn(),
    onRequestDelete: vi.fn(),
    onToggleFormat: vi.fn(),
    onAddToBook: vi.fn(),
  };
  render(
    <BookChapterList
      listId="book-chapters-b1"
      bookTitle="Autumn"
      chapters={overrides.chapters ?? CHAPTERS}
      currentNoteId={overrides.currentNoteId ?? null}
      openMenuId={overrides.openMenuId ?? null}
      {...handlers}
    />,
  );
  return handlers;
};

const row = (name: string) => screen.getByRole("button", { name });

describe("BookChapterList", () => {
  it("names the list after the book it belongs to, so two open books are told apart", () => {
    renderList();
    expect(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    ).toBeTruthy();
  });

  it("shows each chapter under the note's own title rather than a renamed one", () => {
    renderList();
    expect(row("#1 \u2013 The Drizzle")).toBeTruthy();
    expect(row("Chapter 2: Abdul's Shop")).toBeTruthy();
  });

  it("opens the chapter that was clicked", async () => {
    const { onSelect } = renderList();
    await userEvent.click(row("Chapter 2: Abdul's Shop"));
    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("marks only the open chapter as current", () => {
    renderList({ currentNoteId: "c2" });
    expect(row("Chapter 2: Abdul's Shop").getAttribute("aria-current")).toBe(
      "true",
    );
    expect(
      row("#1 \u2013 The Drizzle").getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks nothing as current when the open note is not in this book", () => {
    renderList({ currentNoteId: "somewhere-else" });
    expect(screen.queryByRole("button", { current: true })).toBeNull();
  });

  /* The reason chapter rows are NoteListItems rather than plain buttons: a
     chapter is a note, and the things you can do to a note have to be
     reachable from wherever it is shown. */
  it("gives every chapter its own actions menu", () => {
    renderList();
    expect(row("More actions for #1 \u2013 The Drizzle")).toBeTruthy();
    expect(row("More actions for Chapter 2: Abdul's Shop")).toBeTruthy();
  });

  it("opens the menu for the chapter whose dots were clicked", async () => {
    const { onMenuOpenChange } = renderList();
    await userEvent.click(row("More actions for Chapter 2: Abdul's Shop"));
    expect(onMenuOpenChange).toHaveBeenCalledWith("c2", true);
  });

  it("deletes the chapter whose menu is open, not another one", async () => {
    const { onRequestDelete } = renderList({ openMenuId: "c2" });
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(onRequestDelete).toHaveBeenCalledWith(CHAPTERS[1]);
  });

  /* Under the book's own heading, naming the book on every row would repeat
     what the heading just said. */
  it("does not label each chapter with the book it is already under", () => {
    renderList();
    const list = within(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    );
    expect(list.queryByText("Autumn")).toBeNull();
  });

  /* The class is invisible to role queries and the suite never evaluates CSS,
     so nothing else would notice it landing on an element that does not
     scroll. The ul is the element with the five-row max-height. */
  it("puts the edge fades on the list itself, which is what scrolls", () => {
    renderList();
    expect(
      screen
        .getByRole("list", { name: "Chapters in Autumn" })
        .classList.contains("scroll-fades"),
    ).toBe(true);
  });

  it("says a book is empty rather than showing a list with nothing in it", () => {
    renderList({ chapters: [] });
    expect(screen.getByText(COPY.emptyBookChapters)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
