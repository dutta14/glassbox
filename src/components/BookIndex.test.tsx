import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookIndex } from "./BookIndex";
import type { BookIndexChapter } from "./BookIndex";

const CHAPTERS: BookIndexChapter[] = [
  { id: "a", title: "The Maid", number: 1, missing: false },
  { id: "b", title: "The Garden", number: 2, missing: false },
  { id: "c", title: "The Storm", number: 3, missing: false },
  { id: "d", title: "The Return", number: 4, missing: false },
];

/**
 * The parent owns chapter order in the real tree, so a stateless render would
 * never reflect a reorder back and the focus-follows-item behaviour, which
 * depends on the props changing, could not be observed. This harness owns the
 * order the way the book stage's caller does.
 */
const Harness = ({
  initial = CHAPTERS,
  currentChapterId = null,
  onReorder,
  onJump = vi.fn(),
  onRemoveChapter = vi.fn(),
  onSetNumbered = vi.fn(),
}: {
  initial?: BookIndexChapter[];
  currentChapterId?: string | null;
  onReorder?: (ids: string[]) => void;
  onJump?: (id: string) => void;
  onRemoveChapter?: (id: string) => void;
  onSetNumbered?: (id: string, numbered: boolean) => void;
}) => {
  const [chapters, setChapters] = useState(initial);
  const handleReorder = (ids: string[]) => {
    onReorder?.(ids);
    setChapters(ids.map((id) => chapters.find((c) => c.id === id)!));
  };
  return (
    <BookIndex
      chapters={chapters}
      currentChapterId={currentChapterId}
      onReorder={handleReorder}
      onJump={onJump}
      onRemoveChapter={onRemoveChapter}
      onSetNumbered={onSetNumbered}
    />
  );
};

const moveUp = (title: string) =>
  screen.getByRole("button", { name: `Move ${title} up` });
const moveDown = (title: string) =>
  screen.getByRole("button", { name: `Move ${title} down` });

describe("BookIndex", () => {
  it("cannot move the first chapter up", () => {
    render(<Harness />);
    expect(moveUp("The Maid")).toBeDisabled();
  });

  it("cannot move the last chapter down", () => {
    render(<Harness />);
    expect(moveDown("The Return")).toBeDisabled();
  });

  it("can move the first chapter down and the last chapter up", () => {
    render(<Harness />);
    expect(moveDown("The Maid")).toBeEnabled();
    expect(moveUp("The Return")).toBeEnabled();
  });

  it("emits the new id order with the moved chapter one position later", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    await user.click(moveDown("The Maid"));
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c", "d"]);
  });

  it("emits the new id order with the moved chapter one position earlier", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    await user.click(moveUp("The Storm"));
    expect(onReorder).toHaveBeenCalledWith(["a", "c", "b", "d"]);
  });

  it("keeps focus on the pressed control as it follows the moved chapter", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(moveDown("The Maid"));
    // The Maid is now second. Its own move-down button must hold focus so a
    // second press moves it again without hunting for the control.
    expect(moveDown("The Maid")).toHaveFocus();
  });

  it("moves focus to the opposite control when the pressed one becomes disabled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // The Storm is third; moving it down lands it last, disabling its own
    // move-down. Focus must not fall to the document, so it goes to move-up.
    await user.click(moveDown("The Storm"));
    expect(moveUp("The Storm")).toHaveFocus();
    expect(moveDown("The Storm")).toBeDisabled();
  });

  it("announces the move and its new position in a live region", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(moveDown("The Maid"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Moved The Maid to position 2 of 4"
    );
  });

  it("says nothing in the live region before any move", () => {
    render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("calls onJump with the clicked chapter id", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<Harness onJump={onJump} />);
    await user.click(screen.getByRole("button", { name: /^Go to The Garden$/ }));
    expect(onJump).toHaveBeenCalledWith("b");
  });

  it("marks the current chapter and no other", () => {
    render(<Harness currentChapterId="c" />);
    expect(screen.getByRole("button", { name: /^Go to The Storm$/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /^Go to The Maid$/ })
    ).not.toHaveAttribute("aria-current");
  });

  it("names each move control after its own chapter", () => {
    render(<Harness />);
    // Named by chapter, not "Move up" four times, so a screen reader user can
    // tell the controls apart.
    expect(moveUp("The Garden")).toBeInTheDocument();
    expect(moveDown("The Garden")).toBeInTheDocument();
  });
});

describe("BookIndex — numbering", () => {
  const UNCOUNTED: BookIndexChapter[] = [
    { id: "p", title: "Prologue", number: null, missing: false },
    { id: "a", title: "The Maid", number: 1, missing: false },
  ];

  /**
   * A blank would let the prologue's title slide left and break the column of
   * titles. The dash holds the place without claiming to be a number.
   */
  it("stands a dash where an uncounted chapter's number would be", () => {
    render(<Harness initial={UNCOUNTED} />);

    const row = screen.getByRole("button", { name: "Go to Prologue" });
    expect(row.textContent).toBe("– Prologue");
  });

  it("reports whether each chapter is counted", () => {
    render(<Harness initial={UNCOUNTED} />);

    expect(
      screen.getByRole("button", { name: "Number Prologue" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Number The Maid" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("asks for the opposite of the chapter's current state when pressed", async () => {
    const onSetNumbered = vi.fn();
    render(<Harness initial={UNCOUNTED} onSetNumbered={onSetNumbered} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Number Prologue" }),
    );
    expect(onSetNumbered).toHaveBeenCalledWith("p", true);

    await userEvent.click(
      screen.getByRole("button", { name: "Number The Maid" }),
    );
    expect(onSetNumbered).toHaveBeenCalledWith("a", false);
  });

  /**
   * A chapter called nothing but "Chapter 3" has no title once the number is
   * lifted out of it, and a control read aloud as "3" is not something anyone
   * can act on. It borrows the number for its name instead.
   */
  it("names controls after the number when the chapter has no title", async () => {
    const onRemoveChapter = vi.fn();
    render(
      <Harness
        initial={[{ id: "a", title: "", number: 3, missing: false }]}
        onRemoveChapter={onRemoveChapter}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to chapter 3" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove chapter 3 from this book" }),
    );
    expect(onRemoveChapter).toHaveBeenCalledWith("a");
  });

  it("falls back to a bare name when a chapter has neither title nor number", () => {
    render(
      <Harness
        initial={[{ id: "p", title: "", number: null, missing: false }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to this chapter" }),
    ).toBeInTheDocument();
  });
});
