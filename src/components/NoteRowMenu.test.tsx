import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteRowMenu } from "./NoteRowMenu";

/**
 * The menu is a controlled component, so a stateless render would leave it
 * stuck open and none of the dismissal paths would be observable. This harness
 * owns the state the rail owns in the real tree.
 */
const Harness = ({
  onRequestDelete = vi.fn(),
  title = "Postgres tuning",
}: {
  onRequestDelete?: () => void;
  title?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button">outside</button>
      <NoteRowMenu
        itemId="n1"
        itemLabel={title}
        open={open}
        onOpenChange={setOpen}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
};

const trigger = () => screen.getByRole("button", { name: /More actions/ });
const deleteItem = () => screen.queryByRole("menuitem", { name: "Delete" });

describe("NoteRowMenu", () => {
  it("names the trigger after its own note, so twenty rows are distinguishable", () => {
    render(<Harness title="Postgres tuning" />);

    expect(
      screen.getByRole("button", { name: "More actions for Postgres tuning" }),
    ).toBeInTheDocument();
  });

  it("renders no menu until the trigger is used", () => {
    render(<Harness />);

    expect(deleteItem()).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the menu when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    expect(deleteItem()).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("moves focus into the menu on open, so a keyboard user is not stranded", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    await waitFor(() => expect(deleteItem()).toHaveFocus());
  });

  it("requests deletion and closes when Delete is chosen", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    render(<Harness onRequestDelete={onRequestDelete} />);

    await user.click(trigger());
    await user.click(deleteItem()!);

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(deleteItem()).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());

    await user.keyboard("{Escape}");

    expect(deleteItem()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes when a press lands outside the menu", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(deleteItem()).not.toBeInTheDocument();
  });

  it("marks the trigger with the id the rail uses to restore focus", () => {
    render(<Harness />);

    expect(trigger()).toHaveAttribute("data-menu-for", "n1");
  });

  /**
   * The rail's note list scrolls, so a menu nested inside a row is clipped at
   * the right and bottom edges. It escapes to the body instead.
   */
  it("renders the menu outside the row, so the scrolling rail cannot clip it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(trigger());
    const menu = screen.getByRole("menu");

    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it("closes on scroll, which fixed positioning would otherwise not follow", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());

    document.dispatchEvent(new Event("scroll", { bubbles: false }));

    await waitFor(() => expect(deleteItem()).not.toBeInTheDocument());
  });

  it("declares itself a menu trigger for assistive tech", () => {
    render(<Harness />);

    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
  });
});

/**
 * Verse conversion spec ACs 21, 27, 28. The menu is shared with conversation
 * rows, which have no shape to change, so the format action is opt-in: a row
 * that passes neither prop gets exactly the menu it always had.
 */
const FormatHarness = ({
  format,
  onToggleFormat = vi.fn(),
}: {
  format: "prose" | "verse";
  onToggleFormat?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <NoteRowMenu
      itemId="n1"
      itemLabel="Dream Again"
      open={open}
      onOpenChange={setOpen}
      onRequestDelete={vi.fn()}
      format={format}
      onToggleFormat={onToggleFormat}
    />
  );
};

describe("the format action in a note's menu", () => {
  it("offers to turn a prose note into verse", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="prose" />);

    await user.click(trigger());

    expect(
      screen.getByRole("menuitem", { name: "Turn into verse" }),
    ).toBeInTheDocument();
  });

  it("offers to turn a verse note back into prose", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="verse" />);

    await user.click(trigger());

    expect(
      screen.getByRole("menuitem", { name: "Turn into prose" }),
    ).toBeInTheDocument();
  });

  it("names what it will do rather than what the note currently is", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="prose" />);

    await user.click(trigger());

    expect(
      screen.queryByRole("menuitem", { name: "Turn into prose" }),
    ).not.toBeInTheDocument();
  });

  it("asks for the change when chosen", async () => {
    const user = userEvent.setup();
    const onToggleFormat = vi.fn();
    render(<FormatHarness format="prose" onToggleFormat={onToggleFormat} />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: "Turn into verse" }));

    expect(onToggleFormat).toHaveBeenCalledTimes(1);
  });

  it("closes the menu after the change is chosen", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="prose" />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: "Turn into verse" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: "Turn into verse" }),
      ).not.toBeInTheDocument(),
    );
  });

  /* AC 28. Opening the menu puts focus on its first item, and the format
     action is now that item. */
  it("takes focus when the menu opens, being the first item", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="prose" />);

    await user.click(trigger());

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Turn into verse" }),
      ).toHaveFocus(),
    );
  });

  it("keeps Delete reachable below it", async () => {
    const user = userEvent.setup();
    render(<FormatHarness format="prose" />);

    await user.click(trigger());

    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Turn into verse", "Delete"]);
  });

  /* AC 27. A chat row passes neither prop. */
  it("shows no format action on a row that has no format, such as a chat", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(
      ["Delete"],
    );
    expect(deleteItem()).toHaveFocus();
  });
});

/**
 * The book action is opt-in exactly like the format action: only a note row
 * passes onAddToBook, and it must slot between the format action and Delete
 * without ever stealing the opening focus from the genuinely first item.
 */
const BookHarness = ({
  withFormat = false,
  onAddToBook = vi.fn(),
}: {
  withFormat?: boolean;
  onAddToBook?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <NoteRowMenu
      itemId="n1"
      itemLabel="Chapter one"
      open={open}
      onOpenChange={setOpen}
      onRequestDelete={vi.fn()}
      format={withFormat ? "prose" : undefined}
      onToggleFormat={withFormat ? vi.fn() : undefined}
      onAddToBook={onAddToBook}
    />
  );
};

const addToBookItem = () =>
  screen.queryByRole("menuitem", { name: "Add to book" });

describe("the add-to-book action in a note's menu", () => {
  it("offers to add the note to a book", async () => {
    const user = userEvent.setup();
    render(<BookHarness />);

    await user.click(trigger());

    expect(addToBookItem()).toBeInTheDocument();
  });

  it("sits between the format action and Delete", async () => {
    const user = userEvent.setup();
    render(<BookHarness withFormat />);

    await user.click(trigger());

    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(
      ["Turn into verse", "Add to book", "Delete"],
    );
  });

  it("asks to add when chosen, then closes the menu", async () => {
    const user = userEvent.setup();
    const onAddToBook = vi.fn();
    render(<BookHarness onAddToBook={onAddToBook} />);

    await user.click(trigger());
    await user.click(addToBookItem()!);

    expect(onAddToBook).toHaveBeenCalledTimes(1);
    expect(addToBookItem()).not.toBeInTheDocument();
  });

  it("is absent on a chat row, which passes no book handler", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    expect(addToBookItem()).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(
      ["Delete"],
    );
  });

  it("takes opening focus when it is the first item, with no format above it", async () => {
    const user = userEvent.setup();
    render(<BookHarness />);

    await user.click(trigger());

    await waitFor(() => expect(addToBookItem()).toHaveFocus());
  });

  it("yields opening focus to the format action when one sits above it", async () => {
    const user = userEvent.setup();
    render(<BookHarness withFormat />);

    await user.click(trigger());

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Turn into verse" }),
      ).toHaveFocus(),
    );
    expect(addToBookItem()).not.toHaveFocus();
  });

  it("leaves opening focus on Delete when neither format nor book renders", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    await waitFor(() => expect(deleteItem()).toHaveFocus());
  });
});
