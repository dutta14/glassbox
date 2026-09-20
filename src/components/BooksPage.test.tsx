import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BooksPage } from "./BooksPage";
import { COPY } from "../engine/copy";
import type { Book } from "../types";

const iso = "2026-01-01T00:00:00.000Z";

const mkBook = (id: string, title: string, chapters = 0): Book => ({
  id,
  title,
  chapterIds: Array.from({ length: chapters }, (_, i) => `${id}-c${i}`),
  createdAt: iso,
  updatedAt: iso,
});

const BOOKS = [
  mkBook("b1", "Autumn", 5),
  mkBook("b2", "Decagon", 1),
  mkBook("b3", "Shaena", 0),
];

const renderPage = (
  overrides: Partial<{ books: Book[]; booksLoaded: boolean }> = {},
) => {
  const onOpen = vi.fn();
  const onCreate = vi.fn();
  render(
    <BooksPage
      books={overrides.books ?? BOOKS}
      booksLoaded={overrides.booksLoaded ?? true}
      onOpen={onOpen}
      onCreate={onCreate}
    />,
  );
  return { onOpen, onCreate };
};

const search = () => screen.getByRole("searchbox");
const titles = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("button").textContent);

describe("BooksPage", () => {
  it("lists every book with its chapter count", () => {
    renderPage();
    expect(titles()).toEqual(["Autumn5 chapters", "Decagon1 chapter", "ShaenaEmpty"]);
  });

  /* The same words as the rail row. A book that is "Empty" in the sidebar and
     "0 chapters" here would read as two different facts. */
  it("counts chapters in the same words the rail uses", () => {
    renderPage();
    expect(screen.getByText(COPY.chapterCount(5))).toBeTruthy();
    expect(screen.getByText(COPY.chapterCount(1))).toBeTruthy();
    expect(screen.getByText(COPY.chapterCount(0))).toBeTruthy();
  });

  it("opens the book that was clicked", async () => {
    const { onOpen } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Decagon/ }));
    expect(onOpen).toHaveBeenCalledWith("b2");
  });

  it("starts a new book", async () => {
    const { onCreate } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: COPY.newBook }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("narrows the list to books matching what was typed", async () => {
    renderPage();
    await userEvent.type(search(), "deca");
    expect(titles()).toEqual(["Decagon1 chapter"]);
  });

  it("matches regardless of case", async () => {
    renderPage();
    await userEvent.type(search(), "AUTUMN");
    expect(titles()).toEqual(["Autumn5 chapters"]);
  });

  it("matches anywhere in the title, not only the start", async () => {
    renderPage();
    await userEvent.type(search(), "cago");
    expect(titles()).toEqual(["Decagon1 chapter"]);
  });

  /* Typing a space is not a search, and emptying the shelf for it would look
     like everything had gone. */
  it("treats whitespace as no search at all", async () => {
    renderPage();
    await userEvent.type(search(), "   ");
    expect(titles()).toHaveLength(3);
  });

  it("names what was searched for when nothing matches", async () => {
    renderPage();
    await userEvent.type(search(), "zzz");
    expect(screen.getByText(COPY.booksSearchEmpty("zzz"))).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  /* Clearing has to be possible, so the text stays put when it matches
     nothing. */
  it("keeps the search text after a search that found nothing", async () => {
    renderPage();
    await userEvent.type(search(), "zzz");
    expect(search()).toHaveValue("zzz");
  });

  it("offers a way to start a book when there are none", () => {
    renderPage({ books: [] });
    expect(screen.getByText(COPY.booksPageEmpty)).toBeTruthy();
    expect(screen.getByRole("button", { name: COPY.newBook })).toBeTruthy();
  });

  /* Three different nothings. Saying "no books yet" to someone whose books
     have simply not loaded is a lie that resolves itself a moment later. */
  it("says nothing at all until the books have loaded", () => {
    renderPage({ books: [], booksLoaded: false });
    expect(screen.queryByText(COPY.booksPageEmpty)).toBeNull();
  });

  it("names an untitled book rather than showing a blank row", () => {
    renderPage({ books: [mkBook("b9", "   ")] });
    expect(
      screen.getByRole("button", { name: new RegExp(`^${COPY.untitledBook}`) }),
    ).toBeTruthy();
  });
});
