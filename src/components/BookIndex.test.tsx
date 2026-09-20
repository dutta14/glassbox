import { describe, expect, it, vi } from "vitest";
import type { StoryMark } from "../types";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookIndex } from "./BookIndex";
import type { BookIndexChapter } from "./BookIndex";

const CHAPTERS: BookIndexChapter[] = [
  { id: "a", title: "The Maid", number: 1, story: null, missing: false },
  { id: "b", title: "The Garden", number: 2, story: null, missing: false },
  { id: "c", title: "The Storm", number: 3, story: null, missing: false },
  { id: "d", title: "The Return", number: 4, story: null, missing: false },
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
  onSetStory = vi.fn(),
  editable,
  suggestedStories,
  onApplyStories,
}: {
  initial?: BookIndexChapter[];
  currentChapterId?: string | null;
  onReorder?: (ids: string[]) => void;
  onJump?: (id: string) => void;
  onRemoveChapter?: (id: string) => void;
  onSetNumbered?: (id: string, numbered: boolean) => void;
  onSetStory?: (id: string, title: string | null) => void;
  editable?: boolean;
  suggestedStories?: StoryMark[];
  onApplyStories?: (stories: StoryMark[]) => void;
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
      onJump={onJump}
      editing={
        editable === false
          ? undefined
          : {
              onReorder: handleReorder,
              onRemoveChapter,
              onSetNumbered,
              onSetStory,
              suggestedStories,
              onApplyStories,
            }
      }
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
      "Moved The Maid to position 2 of 4",
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
    await user.click(
      screen.getByRole("button", { name: /^Go to The Garden$/ }),
    );
    expect(onJump).toHaveBeenCalledWith("b");
  });

  it("marks the current chapter and no other", () => {
    render(<Harness currentChapterId="c" />);
    expect(
      screen.getByRole("button", { name: /^Go to The Storm$/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: /^Go to The Maid$/ }),
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
    { id: "p", title: "Prologue", number: null, story: null, missing: false },
    { id: "a", title: "The Maid", number: 1, story: null, missing: false },
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
   * lifted out of it. The reading column can show a single grey line there,
   * but a contents cannot: a whole book of those lists nothing but digits.
   */
  it("spells out the number as the title when the chapter has no other", () => {
    render(
      <Harness
        initial={[
          { id: "a", title: "", number: 3, story: null, missing: false },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to Chapter 3" }),
    ).toBeInTheDocument();
  });

  it("does not print the number twice on the same row", () => {
    render(
      <Harness
        initial={[
          { id: "a", title: "", number: 3, story: null, missing: false },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to Chapter 3" }).textContent,
    ).toBe(" Chapter 3");
  });

  it("names the other controls after the number too", async () => {
    const onRemoveChapter = vi.fn();
    render(
      <Harness
        initial={[
          { id: "a", title: "", number: 3, story: null, missing: false },
        ]}
        onRemoveChapter={onRemoveChapter}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Chapter 3 from this book" }),
    );
    expect(onRemoveChapter).toHaveBeenCalledWith("a");
  });

  it("falls back to a bare name when a chapter has neither title nor number", () => {
    render(
      <Harness
        initial={[
          { id: "p", title: "", number: null, story: null, missing: false },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to this chapter" }),
    ).toBeInTheDocument();
  });
});

describe("BookIndex stories", () => {
  const anthology = [
    { id: "a", title: "Chapter 1", number: 1, story: "Echoes", missing: false },
    { id: "b", title: "Chapter 2", number: 2, story: "Echoes", missing: false },
    {
      id: "c",
      title: "Chapter 1",
      number: 1,
      story: "Fracture",
      missing: false,
    },
  ];

  it("names each story once, above the chapter that opens it", () => {
    render(<Harness initial={anthology} />);

    expect(screen.getAllByRole("button", { name: /Echoes/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Fracture/ })).toHaveLength(1);
  });

  it("hides the rename hint from the page", () => {
    render(<Harness initial={anthology} />);

    // jsdom has no styling, so the only way to catch the hint leaking into
    // the visible heading is to pin the class that takes it off the page.
    const heading = screen.getByRole("button", { name: /Echoes/ });
    expect(heading.querySelector(".sr-only")).toHaveTextContent(
      "(rename this story)",
    );
  });

  it("does not name a story above chapters that only continue it", () => {
    render(<Harness initial={anthology} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows[1]).not.toHaveTextContent("Echoes");
  });

  it("marks the chapter that opens a story as pressed", () => {
    render(<Harness initial={anthology} />);

    const toggles = screen.getAllByRole("button", {
      name: /^Start a story at/,
    });
    expect(toggles[0]).toHaveAttribute("aria-pressed", "true");
    expect(toggles[1]).toHaveAttribute("aria-pressed", "false");
    expect(toggles[2]).toHaveAttribute("aria-pressed", "true");
  });

  it("starts a story at a chapter once the name is entered", async () => {
    const onSetStory = vi.fn();
    render(
      <Harness
        initial={[
          { id: "a", title: "One", number: 1, story: null, missing: false },
        ]}
        onSetStory={onSetStory}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^Start a story at/ }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Story name" }),
      "Echoes{Enter}",
    );

    expect(onSetStory).toHaveBeenCalledWith("a", "Echoes");
  });

  it("takes the division away when the chapter already opens a story", async () => {
    const onSetStory = vi.fn();
    render(<Harness initial={anthology} onSetStory={onSetStory} />);

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Start a story at/ })[0],
    );

    expect(onSetStory).toHaveBeenCalledWith("a", null);
    expect(
      screen.queryByRole("textbox", { name: "Story name" }),
    ).not.toBeInTheDocument();
  });

  it("renames a story from its heading", async () => {
    const onSetStory = vi.fn();
    render(<Harness initial={anthology} onSetStory={onSetStory} />);

    await userEvent.click(screen.getByRole("button", { name: /Echoes/ }));
    const field = screen.getByRole("textbox", { name: "Story name" });
    expect(field).toHaveValue("Echoes");

    await userEvent.clear(field);
    await userEvent.type(field, "Echo{Enter}");
    expect(onSetStory).toHaveBeenCalledWith("a", "Echo");
  });

  it("removes the division when the name is emptied", async () => {
    const onSetStory = vi.fn();
    render(<Harness initial={anthology} onSetStory={onSetStory} />);

    await userEvent.click(screen.getByRole("button", { name: /Echoes/ }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Story name" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Story name" }),
      "{Enter}",
    );

    expect(onSetStory).toHaveBeenCalledWith("a", null);
  });

  it("abandons the name on Escape", async () => {
    const onSetStory = vi.fn();
    render(<Harness initial={anthology} onSetStory={onSetStory} />);

    await userEvent.click(screen.getByRole("button", { name: /Fracture/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Story name" }),
      "Something{Escape}",
    );

    expect(onSetStory).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Story name" }),
    ).not.toBeInTheDocument();
  });

  it("abandons the name when the field loses focus", async () => {
    const onSetStory = vi.fn();
    render(
      <Harness
        initial={[
          { id: "a", title: "One", number: 1, story: null, missing: false },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^Start a story at/ }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Story name" }),
      "Half",
    );
    await userEvent.tab();

    expect(onSetStory).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Story name" }),
    ).not.toBeInTheDocument();
  });

  it("opens only one naming field at a time", async () => {
    render(<Harness initial={anthology} onSetStory={vi.fn()} />);

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Start a story at/ })[1],
    );
    await userEvent.click(screen.getByRole("button", { name: /Fracture/ }));

    expect(screen.getAllByRole("textbox", { name: "Story name" })).toHaveLength(
      1,
    );
  });
});

describe("BookIndex — a book that counts nothing", () => {
  it("shows no gutter at all when no chapter is counted", () => {
    const { container } = render(
      <Harness
        initial={[
          { id: "a", title: "May", number: null, story: null, missing: false },
          {
            id: "b",
            title: "Leaving",
            number: null,
            story: null,
            missing: false,
          },
        ]}
      />,
    );

    // A column of dashes down a whole poetry collection is noise. The dash
    // marks the exception in a book that counts.
    expect(container.querySelectorAll(".book-index__number")).toHaveLength(0);
  });

  it("still marks the uncounted chapters in a book that counts some", () => {
    const { container } = render(
      <Harness
        initial={[
          {
            id: "a",
            title: "Prologue",
            number: null,
            story: null,
            missing: false,
          },
          { id: "b", title: "One", number: 1, story: null, missing: false },
        ]}
      />,
    );

    expect(
      container.querySelectorAll(".book-index__number--none"),
    ).toHaveLength(1);
  });

  it("still reads out the titles when there is no gutter", () => {
    render(
      <Harness
        initial={[
          { id: "a", title: "May", number: null, story: null, missing: false },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to May" }),
    ).toBeInTheDocument();
  });
});

describe("BookIndex — reading rather than arranging", () => {
  const rows = [
    { id: "a", title: "May", number: 1, story: "Echoes", missing: false },
    { id: "b", title: "Leaving", number: 2, story: "Echoes", missing: false },
  ];

  it("takes the row controls away when the list is not editable", () => {
    render(<Harness initial={rows} editable={false} />);

    expect(
      screen.queryByRole("button", { name: /^Move .* down/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Start a story at/ }),
    ).not.toBeInTheDocument();
  });

  it("still lets a reader jump to a chapter", async () => {
    const onJump = vi.fn();
    render(<Harness initial={rows} editable={false} onJump={onJump} />);

    await userEvent.click(screen.getByRole("button", { name: "Go to May" }));
    expect(onJump).toHaveBeenCalledWith("a");
  });

  it("names the story without offering to rename it", () => {
    render(<Harness initial={rows} editable={false} />);

    expect(screen.getByText("Echoes")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /rename this story/ }),
    ).not.toBeInTheDocument();
  });

  it("makes no offer to divide the book", () => {
    render(
      <Harness
        initial={rows}
        editable={false}
        suggestedStories={[{ startsAt: "a", title: "Echoes" }]}
        onApplyStories={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Divide the book" }),
    ).not.toBeInTheDocument();
  });

  it("keeps every control when the list is editable", () => {
    render(<Harness initial={rows} />);

    expect(
      screen.getAllByRole("button", { name: /^Start a story at/ }),
    ).toHaveLength(2);
  });
});
