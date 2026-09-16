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
