import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RailFlyout } from "./RailFlyout";

const Harness = ({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div data-testid="outside-scroller">outside</div>
      <RailFlyout
        label="Chats"
        heading="Chats"
        icon={<span>icon</span>}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        isEmpty={false}
        emptyText="Nothing here"
      >
        <ul>
          <li>
            <button type="button">Why was it slow</button>
          </li>
        </ul>
      </RailFlyout>
    </div>
  );
};

const panel = () => screen.getByRole("group", { name: "Chats" });

describe("RailFlyout", () => {
  it("opens from its trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Chats" }));

    expect(panel()).toBeInTheDocument();
    expect(screen.getByText("Why was it slow")).toBeInTheDocument();
  });

  /* The panel scrolls its own contents once there are enough rows. Scrolling
     it does not move it relative to its trigger, so it must stay open. This
     was dismissing on the first wheel event. */
  it("stays open while its own list is scrolled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Chats" }));

    act(() => {
      panel().dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(screen.queryByRole("group", { name: "Chats" })).toBeInTheDocument();
  });

  it("stays open while a row inside it is scrolled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Chats" }));

    act(() => {
      screen
        .getByText("Why was it slow")
        .dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(screen.queryByRole("group", { name: "Chats" })).toBeInTheDocument();
  });

  /* An ancestor scrolling does drift it, because the panel is position:fixed
     and does not follow. */
  it("closes when something outside it scrolls", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Chats" }));

    act(() => {
      screen
        .getByTestId("outside-scroller")
        .dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(screen.queryByRole("group", { name: "Chats" })).toBeNull();
  });

  it("closes on Escape and hands focus back to its trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Chats" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Chats" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes when a press lands outside it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Chats" }));

    await user.click(screen.getByTestId("outside-scroller"));

    expect(screen.queryByRole("group", { name: "Chats" })).toBeNull();
  });

  it("reports its state on the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Chats" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("explains itself when there is nothing to list", () => {
    render(
      <RailFlyout
        label="Chats"
        heading="Chats"
        icon={<span>icon</span>}
        open
        onOpenChange={vi.fn()}
        isEmpty
        emptyText="Nothing here"
      >
        <ul />
      </RailFlyout>,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
