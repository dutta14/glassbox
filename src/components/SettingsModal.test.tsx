import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "./SettingsModal";

const setup = (overrides = {}) => {
  const props = {
    open: true,
    folderState: "connected" as const,
    folderName: "glassbox-notes",
    connectError: null,
    theme: "dark" as const,
    onConnectFolder: vi.fn(),
    onReconnectFolder: vi.fn(),
    onDisconnectFolder: vi.fn(),
    onToggleTheme: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SettingsModal {...props} />);
  return props;
};

describe("SettingsModal", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a modal dialog named Settings", () => {
    setup();

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("holds both of the settings the rail used to keep loose in its foot", () => {
    setup();

    expect(screen.getByText("Where notes are kept")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Close settings" }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Typing into a setting must not dismiss the dialog, and neither must any
   * key that is simply not Escape.
   */
  it("stays open on other keys", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.keyboard("a{ArrowDown}{ArrowUp}");

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is pressed", async () => {
    const user = userEvent.setup();
    const props = setup();

    const backdrop = document.querySelector(".settings-backdrop");
    await user.click(backdrop as Element);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * A press that starts inside the dialog and drifts onto the backdrop, which
   * is what selecting text does, must not be read as dismissing it.
   */
  it("stays open when a press starts inside the dialog", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("dialog"));

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog when it opens", () => {
    setup();

    expect(screen.getByRole("button", { name: "Close settings" })).toHaveFocus();
  });

  it("makes the rest of the app inert so focus cannot wander behind it", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    setup();

    expect(root).toHaveAttribute("inert");
    root.remove();
  });

  it("wraps focus from the last control back to the first", async () => {
    const user = userEvent.setup();
    setup();

    const close = screen.getByRole("button", { name: "Close settings" });
    const dark = screen.getByRole("button", { name: "Dark" });
    dark.focus();

    await user.tab();

    expect(close).toHaveFocus();
  });

  it("wraps focus backwards from the first control to the last", async () => {
    const user = userEvent.setup();
    setup();

    screen.getByRole("button", { name: "Close settings" }).focus();

    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Dark" })).toHaveFocus();
  });

  it("passes the theme through to the appearance control", () => {
    setup({ theme: "light" });

    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("passes folder actions through to the storage control", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(props.onDisconnectFolder).toHaveBeenCalledTimes(1);
  });
});
