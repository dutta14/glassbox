import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageControl } from "./StorageControl";
import type { FolderState } from "../hooks/useStorageBackend";

const setup = (folderState: FolderState, overrides = {}) => {
  const props = {
    folderState,
    folderName: "glassbox-notes",
    connectError: null,
    onConnect: vi.fn(),
    onReconnect: vi.fn(),
    onDisconnect: vi.fn(),
    ...overrides,
  };
  render(<StorageControl {...props} />);
  return props;
};

describe("StorageControl", () => {
  /**
   * It was a popover trigger in the rail's foot. Inside the settings dialog
   * the options are simply present, so there must be nothing to open first.
   */
  it("shows its options without needing to be opened", () => {
    setup("disconnected");

    expect(
      screen.getByRole("button", { name: "Connect folder" }),
    ).toBeInTheDocument();
  });

  it("names the connected folder", () => {
    setup("connected");

    expect(screen.getByText("glassbox-notes")).toBeInTheDocument();
  });

  it("says notes are in the browser when no folder is connected", () => {
    setup("disconnected");

    expect(screen.getByText("This browser")).toBeInTheDocument();
  });

  it("offers changing and disconnecting once a folder is connected", () => {
    setup("connected");

    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
  });

  it("offers a reconnect after a reload drops the handle", () => {
    setup("needs-reconnect");

    expect(
      screen.getByRole("button", { name: "Reconnect" }),
    ).toBeInTheDocument();
  });

  it("offers a fresh choice after access was denied", () => {
    setup("denied");

    expect(
      screen.getByRole("button", { name: "Choose a folder" }),
    ).toBeInTheDocument();
  });

  /**
   * Safari and Firefox have no File System Access API. Offering a button that
   * cannot work is worse than explaining why there is none.
   */
  it("offers no action at all where folders are unsupported", () => {
    setup("unsupported");

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByText(/only available in Chrome or Edge/i),
    ).toBeInTheDocument();
  });

  it("calls onDisconnect when the folder is disconnected", async () => {
    const user = userEvent.setup();
    const props = setup("connected");

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(props.onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("calls onConnect when the folder is changed", async () => {
    const user = userEvent.setup();
    const props = setup("connected");

    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(props.onConnect).toHaveBeenCalledTimes(1);
  });

  it("calls onReconnect rather than onConnect when reconnecting", async () => {
    const user = userEvent.setup();
    const props = setup("needs-reconnect");

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(props.onReconnect).toHaveBeenCalledTimes(1);
    expect(props.onConnect).not.toHaveBeenCalled();
  });

  it("announces a connection failure as an alert", () => {
    setup("disconnected", { connectError: "Permission dismissed." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Permission dismissed.",
    );
  });

  it("shows no alert when nothing has failed", () => {
    setup("connected");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
