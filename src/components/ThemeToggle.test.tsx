import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("offers both themes by name rather than one ambiguous toggle", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
  });

  it("marks the active theme as pressed and the other as not", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("moves the pressed state with the theme", () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches when the inactive theme is chosen", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point of two buttons over one toggle: pressing the theme you are
   * already on must not flip you off it.
   */
  it("does nothing when the active theme is chosen again", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("names the group so the two buttons are not read as loose controls", () => {
    render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });

  it("is reachable and operable from the keyboard alone", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Light" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
