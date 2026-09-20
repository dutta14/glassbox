import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddToBookModal } from "./AddToBookModal";
import type { Book } from "../types";

const mkBook = (overrides: Partial<Book> = {}): Book => ({
  id: "b1",
  title: "Poems",
  chapterIds: ["n1", "n2"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/**
 * The modal is presentational and the parent owns `open`, so a stateless
 * render would never exercise the close paths. This harness owns that state
 * the way the rail does, and keeps an "opener" button that becomes the element
 * focus must be restored to.
 */
const Harness = ({
  books = [],
  containingBookIds = [],
  noteTitle = "React from scratch",
  onClose = vi.fn(),
  onAddToBook = vi.fn(),
  onCreateBook = vi.fn(),
}: {
  books?: Book[];
  containingBookIds?: string[];
  noteTitle?: string;
  onClose?: () => void;
  onAddToBook?: (bookId: string) => void;
  onCreateBook?: (title: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <AddToBookModal
        noteTitle={noteTitle}
        books={books}
        containingBookIds={containingBookIds}
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onAddToBook={onAddToBook}
        onCreateBook={onCreateBook}
      />
    </div>
  );
};

const openModal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "opener" }));
  return screen.getByRole("dialog");
};

const bookButton = (name: RegExp) => screen.getByRole("button", { name });
const createButton = () => screen.getByRole("button", { name: "Create" });
const titleField = () => screen.getByPlaceholderText("Book title");

describe("AddToBookModal", () => {
  it("names the note it is adding in the description", async () => {
    const user = userEvent.setup();
    render(<Harness noteTitle="React from scratch" />);

    await openModal(user);

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Add React from scratch to a book.",
    );
  });

  it("lists each book with its chapter count, pluralised", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        books={[
          mkBook({ id: "b1", title: "Poems", chapterIds: ["n1", "n2", "n3"] }),
          mkBook({ id: "b2", title: "Essays", chapterIds: ["n9"] }),
        ]}
      />,
    );

    await openModal(user);

    expect(bookButton(/Poems/)).toHaveTextContent("3 chapters");
    expect(bookButton(/Essays/)).toHaveTextContent("1 chapter");
  });

  it("adds the note to a chosen book and closes", async () => {
    const user = userEvent.setup();
    const onAddToBook = vi.fn();
    const onClose = vi.fn();
    render(
      <Harness
        books={[mkBook({ id: "b1", title: "Poems" })]}
        onAddToBook={onAddToBook}
        onClose={onClose}
      />,
    );

    await openModal(user);
    await user.click(bookButton(/Poems/));

    expect(onAddToBook).toHaveBeenCalledWith("b1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a book that already contains the note as already-containing and disables it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        books={[mkBook({ id: "b1", title: "Poems" })]}
        containingBookIds={["b1"]}
      />,
    );

    await openModal(user);
    const button = bookButton(/Poems/);

    expect(within(button).getByText("Already in this book")).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("does not add the note again when its containing book is clicked", async () => {
    const user = userEvent.setup();
    const onAddToBook = vi.fn();
    render(
      <Harness
        books={[mkBook({ id: "b1", title: "Poems" })]}
        containingBookIds={["b1"]}
        onAddToBook={onAddToBook}
      />,
    );

    await openModal(user);
    await user.click(bookButton(/Poems/));

    expect(onAddToBook).not.toHaveBeenCalled();
  });

  it("disables the confirm until a non-whitespace title is typed", async () => {
    const user = userEvent.setup();
    render(<Harness books={[mkBook()]} />);

    await openModal(user);
    expect(createButton()).toBeDisabled();

    await user.type(titleField(), "   ");
    expect(createButton()).toBeDisabled();

    await user.type(titleField(), "My book");
    expect(createButton()).toBeEnabled();
  });

  it("creates a book with the trimmed title and closes when confirmed", async () => {
    const user = userEvent.setup();
    const onCreateBook = vi.fn();
    const onClose = vi.fn();
    render(
      <Harness books={[mkBook()]} onCreateBook={onCreateBook} onClose={onClose} />,
    );

    await openModal(user);
    await user.type(titleField(), "  Chapters of me  ");
    await user.click(createButton());

    expect(onCreateBook).toHaveBeenCalledWith("Chapters of me");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits the new book when Enter is pressed in the title field", async () => {
    const user = userEvent.setup();
    const onCreateBook = vi.fn();
    render(<Harness books={[mkBook()]} onCreateBook={onCreateBook} />);

    await openModal(user);
    await user.type(titleField(), "Field notes{Enter}");

    expect(onCreateBook).toHaveBeenCalledWith("Field notes");
  });

  it("does not create a book when Enter is pressed on a whitespace-only title", async () => {
    const user = userEvent.setup();
    const onCreateBook = vi.fn();
    render(<Harness books={[mkBook()]} onCreateBook={onCreateBook} />);

    await openModal(user);
    await user.type(titleField(), "   {Enter}");

    expect(onCreateBook).not.toHaveBeenCalled();
  });

  describe("when the user has no books", () => {
    it("leads with creating a book and shows no book list", async () => {
      const user = userEvent.setup();
      render(<Harness books={[]} />);

      await openModal(user);

      expect(
        screen.getByRole("textbox", { name: "Create a book" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Your books")).not.toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("puts opening focus on the title field, the only thing there is to do", async () => {
      const user = userEvent.setup();
      render(<Harness books={[]} />);

      await openModal(user);

      await waitFor(() => expect(titleField()).toHaveFocus());
    });
  });

  it("puts opening focus on the first addable book when books exist", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        books={[
          mkBook({ id: "b1", title: "Poems" }),
          mkBook({ id: "b2", title: "Essays" }),
        ]}
      />,
    );

    await openModal(user);

    await waitFor(() => expect(bookButton(/Poems/)).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness books={[mkBook()]} onClose={onClose} />);

    await openModal(user);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness books={[mkBook()]} onClose={onClose} />);

    const dialog = await openModal(user);
    const backdrop = dialog.closest(".add-book__backdrop");
    expect(backdrop).not.toBeNull();
    await user.pointer([
      { target: backdrop as HTMLElement, keys: "[MouseLeft]" },
    ]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a click inside the dialog from closing it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness books={[mkBook({ title: "Poems" })]} onClose={onClose} />);

    const dialog = await openModal(user);
    await user.click(within(dialog).getByText("Add to book"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps focus from the last control back to the first when Tab is pressed", async () => {
    const user = userEvent.setup();
    // One addable book plus the title field, with Create disabled and so out
    // of the tab ring, gives exactly two stops to wrap between.
    render(<Harness books={[mkBook({ id: "b1", title: "Poems" })]} />);

    await openModal(user);
    await waitFor(() => expect(bookButton(/Poems/)).toHaveFocus());

    await user.tab();
    expect(titleField()).toHaveFocus();

    await user.tab();
    expect(bookButton(/Poems/)).toHaveFocus();
  });

  it("wraps focus from the first control back to the last on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<Harness books={[mkBook({ id: "b1", title: "Poems" })]} />);

    await openModal(user);
    await waitFor(() => expect(bookButton(/Poems/)).toHaveFocus());

    await user.tab({ shift: true });

    expect(titleField()).toHaveFocus();
  });

  it("restores focus to the element that was focused before it opened", async () => {
    const user = userEvent.setup();
    render(<Harness books={[mkBook()]} />);
    const opener = screen.getByRole("button", { name: "opener" });

    await user.click(opener);
    expect(opener).not.toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
