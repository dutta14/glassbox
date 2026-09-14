import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteSearchModal } from "./NoteSearchModal";
import type { Note } from "../types";

/**
 * Direct coverage for the modal. NotesRail.search.test.tsx covers only the
 * wiring between the rail's glyph and this component.
 */

const iso = "2026-01-01T00:00:00.000Z";

const mkNote = (
  id: string,
  title: string,
  body = "",
  tags: string[] = [],
): Note => ({ id, title, body, tags, createdAt: iso, updatedAt: iso });

const notes = [
  mkNote("n1", "Postgres tuning", "shared_buffers should be 25% of RAM", [
    "database",
  ]),
  mkNote("n2", "Sourdough", "the starter was underfed", ["baking", "weekend"]),
  mkNote("n3", "Reading list", "Seeing Like a State"),
];

const setup = (
  props: Partial<React.ComponentProps<typeof NoteSearchModal>>,
) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <NoteSearchModal
      open
      notes={notes}
      selectedNoteId={null}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSelect, onClose, ...view };
};

const dialog = () => screen.getByRole("dialog");
const field = () => screen.getByRole("combobox", { name: "Search notes" });
const options = () => within(dialog()).getAllByRole("option");
/** Each option holds a title and a tag list; this reads only the title. */
const titles = () =>
  options().map(
    (o) => o.querySelector(".note-search__option-title")?.textContent,
  );

describe("NoteSearchModal", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("renders nothing while closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists every note when it opens, before anything is typed", () => {
    setup({});

    expect(options()).toHaveLength(3);
    expect(titles()).toEqual(["Postgres tuning", "Sourdough", "Reading list"]);
  });

  it("moves focus into the search field on open", () => {
    setup({});

    expect(field()).toHaveFocus();
  });

  describe("matching", () => {
    it("narrows to notes whose title matches", async () => {
      const user = userEvent.setup();
      setup({});

      await user.type(field(), "sourdough");

      expect(titles()).toEqual(["Sourdough"]);
    });

    it("matches on body text, not only on the title", async () => {
      const user = userEvent.setup();
      setup({});

      await user.type(field(), "shared_buffers");

      expect(titles()).toEqual(["Postgres tuning"]);
    });

    it("matches on tags, which are not otherwise shown as searchable", async () => {
      const user = userEvent.setup();
      setup({});

      await user.type(field(), "baking");

      expect(titles()).toEqual(["Sourdough"]);
    });

    it("ignores surrounding whitespace in the query", async () => {
      const user = userEvent.setup();
      setup({});

      await user.type(field(), "   ");

      expect(options()).toHaveLength(3);
    });
  });

  describe("empty states", () => {
    it("explains a query that matches nothing", async () => {
      const user = userEvent.setup();
      setup({});

      await user.type(field(), "kubernetes");

      expect(within(dialog()).queryAllByRole("option")).toHaveLength(0);
      expect(within(dialog()).getByText("No matches")).toBeInTheDocument();
      expect(
        within(dialog()).getByText("Try a different search."),
      ).toBeInTheDocument();
    });

    /** An empty library is a different problem from a bad query. */
    it("distinguishes an empty library from a query with no matches", () => {
      setup({ notes: [] });

      expect(within(dialog()).getByText("No notes yet")).toBeInTheDocument();
      expect(
        within(dialog()).queryByText("No matches"),
      ).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("opens the clicked note and closes", async () => {
      const user = userEvent.setup();
      const { onSelect, onClose } = setup({});

      await user.click(within(dialog()).getByText("Sourdough"));

      expect(onSelect).toHaveBeenCalledWith("n2");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("opens the highlighted note on Enter", async () => {
      const user = userEvent.setup();
      const { onSelect, onClose } = setup({});

      await user.keyboard("{ArrowDown}{Enter}");

      expect(onSelect).toHaveBeenCalledWith("n2");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does nothing on Enter when no note matches", async () => {
      const user = userEvent.setup();
      const { onSelect, onClose } = setup({});

      await user.type(field(), "kubernetes");
      await user.keyboard("{Enter}");

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("marks the note already open in the editor", () => {
      setup({ selectedNoteId: "n2" });

      expect(options()[1]).toHaveClass("note-search__option--current");
      expect(options()[0]).not.toHaveClass("note-search__option--current");
    });
  });

  describe("keyboard navigation", () => {
    it("highlights the first note before any arrow key is pressed", () => {
      setup({});

      expect(options()[0]).toHaveAttribute("aria-selected", "true");
    });

    /** Typing must keep working while the arrows move the highlight. */
    it("keeps focus in the input while the highlight moves", async () => {
      const user = userEvent.setup();
      setup({});

      await user.keyboard("{ArrowDown}");

      expect(options()[1]).toHaveAttribute("aria-selected", "true");
      expect(field()).toHaveFocus();
    });

    it("points aria-activedescendant at the highlighted option", async () => {
      const user = userEvent.setup();
      setup({});

      await user.keyboard("{ArrowDown}");

      expect(field()).toHaveAttribute("aria-activedescendant", options()[1].id);
    });

    it("wraps from the last note forward to the first", async () => {
      const user = userEvent.setup();
      setup({});

      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");

      expect(options()[0]).toHaveAttribute("aria-selected", "true");
    });

    it("wraps from the first note backward to the last", async () => {
      const user = userEvent.setup();
      setup({});

      await user.keyboard("{ArrowUp}");

      expect(options()[2]).toHaveAttribute("aria-selected", "true");
    });

    /**
     * A highlight left past the end of a shrinking list makes Enter a no-op.
     */
    it("pulls the highlight back into range when the result set shrinks", async () => {
      const user = userEvent.setup();
      const { onSelect } = setup({});

      await user.keyboard("{ArrowDown}{ArrowDown}");
      await user.type(field(), "postgres");

      expect(options()).toHaveLength(1);
      expect(options()[0]).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{Enter}");
      expect(onSelect).toHaveBeenCalledWith("n1");
    });

    it("follows the mouse so hover and keyboard share one highlight", async () => {
      const user = userEvent.setup();
      setup({});

      await user.hover(options()[2]);

      expect(options()[2]).toHaveAttribute("aria-selected", "true");
      expect(options()[0]).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("dismissal", () => {
    it("closes on Escape", async () => {
      const user = userEvent.setup();
      const { onClose } = setup({});

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes when the backdrop is clicked", async () => {
      const user = userEvent.setup();
      const { onClose } = setup({});

      await user.click(
        document.querySelector(".note-search__backdrop") as Element,
      );

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    /** A click that starts inside the card must not dismiss it. */
    it("stays open when the click lands inside the modal", async () => {
      const user = userEvent.setup();
      const { onClose } = setup({});

      await user.click(field());

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("exposes itself as a modal dialog with an accessible name", () => {
      setup({});

      expect(dialog()).toHaveAttribute("aria-modal", "true");
      expect(dialog()).toHaveAccessibleName("Search notes");
    });

    it("announces how many notes are showing", async () => {
      const user = userEvent.setup();
      setup({});

      expect(screen.getByRole("status")).toHaveTextContent("3 notes");

      await user.type(field(), "sourdough");
      expect(screen.getByRole("status")).toHaveTextContent("1 note");
    });

    /** Screen readers must not be able to walk into the page behind. */
    it("makes the page behind inert while open and restores it on close", () => {
      const { rerender } = setup({});

      expect(root.hasAttribute("inert")).toBe(true);

      rerender(
        <NoteSearchModal
          open={false}
          notes={notes}
          selectedNoteId={null}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(root.hasAttribute("inert")).toBe(false);
    });

    it("survives a missing root element rather than throwing", () => {
      root.remove();

      expect(() => setup({})).not.toThrow();
    });
  });

  it("falls back to a readable label for an untitled note", () => {
    setup({ notes: [mkNote("n9", "")] });

    expect(within(dialog()).getByText("Untitled")).toBeInTheDocument();
  });

  it("starts from a clean query each time it is reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = setup({});

    await user.type(field(), "sourdough");
    expect(options()).toHaveLength(1);

    const props = {
      notes,
      selectedNoteId: null,
      onSelect: vi.fn(),
      onClose: vi.fn(),
    };
    rerender(<NoteSearchModal open={false} {...props} />);
    rerender(<NoteSearchModal open {...props} />);

    expect(field()).toHaveValue("");
    expect(options()).toHaveLength(3);
  });
});
