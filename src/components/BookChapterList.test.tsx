import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookChapterList } from "./BookChapterList";
import { COPY } from "../engine/copy";

const CHAPTERS = [
  { id: "c1", label: "#1 \u2013 The Drizzle" },
  { id: "c2", label: "Chapter 2: Abdul's Shop" },
];

describe("BookChapterList", () => {
  it("names the list after the book it belongs to, so two open books are told apart", () => {
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={CHAPTERS}
        currentNoteId={null}
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Chapters in Autumn" }),
    ).toBeTruthy();
  });

  it("shows each chapter under the note's own title rather than a renamed one", () => {
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={CHAPTERS}
        currentNoteId={null}
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "#1 \u2013 The Drizzle" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Chapter 2: Abdul's Shop" }),
    ).toBeTruthy();
  });

  it("opens the chapter that was clicked", async () => {
    const onOpen = vi.fn();
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={CHAPTERS}
        currentNoteId={null}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Chapter 2: Abdul's Shop" }),
    );
    expect(onOpen).toHaveBeenCalledWith("c2");
  });

  it("marks only the open chapter as current", () => {
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={CHAPTERS}
        currentNoteId="c2"
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Chapter 2: Abdul's Shop" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "#1 \u2013 The Drizzle" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks nothing as current when the open note is not in this book", () => {
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={CHAPTERS}
        currentNoteId="somewhere-else"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { current: true })).toBeNull();
  });

  it("says a book is empty rather than showing a list with nothing in it", () => {
    render(
      <BookChapterList
        bookTitle="Autumn"
        chapters={[]}
        currentNoteId={null}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(COPY.emptyBookChapters)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
