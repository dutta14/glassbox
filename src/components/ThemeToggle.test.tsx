import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("names the current theme rather than the pending one", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /dark mode/i }),
    ).toBeInTheDocument();
  });

  it("describes the destination in the tooltip so the action is unambiguous", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Switch to light mode",
    );
  });

  /**
   * The label alone reads as a statement, not a control state. aria-pressed
   * gives a screen reader the on/off semantics of a toggle.
   */
  it("reports an unpressed toggle while the dark theme is active", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a pressed toggle while the light theme is active", () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: /light mode/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggle once when clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    await user.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("is reachable and operable from the keyboard alone", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
