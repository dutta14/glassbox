import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AskFab } from "./AskFab";
import { AskResizer } from "./AskResizer";
import { COPY } from "../engine/copy";
import { MAX_WIDTH, MIN_WIDTH } from "../hooks/useAskPane";

describe("the Ask button", () => {
  it("opens the pane when pressed", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<AskFab onOpen={onOpen} controls="ask-pane" />);

    await user.click(screen.getByRole("button", { name: COPY.askOpen }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  /* Says what it opens and that the thing is currently shut, so a screen
     reader user knows the button leads somewhere before pressing it. */
  it("says what it controls and that it is not yet open", () => {
    render(<AskFab onOpen={vi.fn()} controls="ask-pane" />);
    const fab = screen.getByRole("button", { name: COPY.askOpen });

    expect(fab).toHaveAttribute("aria-expanded", "false");
    expect(fab).toHaveAttribute("aria-controls", "ask-pane");
  });

  it("carries no icon text into its name", () => {
    render(<AskFab onOpen={vi.fn()} controls="ask-pane" />);

    expect(
      screen.getByRole("button", { name: COPY.askOpen }),
    ).toHaveAccessibleName(COPY.askOpen);
  });
});

describe("the resizer announces itself as a sizeable separator", () => {
  it("reports the current width and the range it may take", () => {
    render(<AskResizer width={512} onWidth={vi.fn()} controls="ask-pane" />);
    const handle = screen.getByRole("separator", { name: COPY.askResize });

    expect(handle).toHaveAttribute("aria-valuenow", "512");
    expect(handle).toHaveAttribute("aria-valuemin", String(MIN_WIDTH));
    expect(handle).toHaveAttribute("aria-valuemax", String(MAX_WIDTH));
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-controls", "ask-pane");
  });

  it("follows the width as it changes, rather than reporting a fixed one", () => {
    const { rerender } = render(
      <AskResizer width={512} onWidth={vi.fn()} controls="ask-pane" />,
    );

    rerender(<AskResizer width={640} onWidth={vi.fn()} controls="ask-pane" />);

    expect(
      screen.getByRole("separator", { name: COPY.askResize }),
    ).toHaveAttribute("aria-valuenow", "640");
  });

  /* A drag handle with no keyboard equivalent is a control some people simply
     cannot use, so the handle takes focus in the normal tab order. */
  it("can be reached by keyboard", async () => {
    const user = userEvent.setup();
    render(<AskResizer width={400} onWidth={vi.fn()} controls="ask-pane" />);

    await user.tab();

    expect(
      screen.getByRole("separator", { name: COPY.askResize }),
    ).toHaveFocus();
  });
});

describe("resizing from the keyboard", () => {
  const setup = (width = 400) => {
    const onWidth = vi.fn();
    render(<AskResizer width={width} onWidth={onWidth} controls="ask-pane" />);
    screen.getByRole("separator", { name: COPY.askResize }).focus();
    return { onWidth, user: userEvent.setup() };
  };

  /* The pane is pinned to the right edge and grows leftward, so the arrows
     follow the pane rather than the pointer. Left widens because that is what
     "make the pane bigger" looks like to someone watching it. */
  it("widens the pane with the left arrow", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{ArrowLeft}");

    expect(onWidth).toHaveBeenCalledWith(416);
  });

  it("narrows the pane with the right arrow", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{ArrowRight}");

    expect(onWidth).toHaveBeenCalledWith(384);
  });

  it("moves in coarse steps with shift held, to cross the range quickly", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");

    expect(onWidth).toHaveBeenCalledWith(464);
  });

  it("jumps to the narrowest width with Home", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{Home}");

    expect(onWidth).toHaveBeenCalledWith(MIN_WIDTH);
  });

  it("jumps to the widest width with End", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{End}");

    expect(onWidth).toHaveBeenCalledWith(MAX_WIDTH);
  });

  it("ignores keys that mean nothing here", async () => {
    const { onWidth, user } = setup(400);

    await user.keyboard("{ArrowUp}{Enter}a");

    expect(onWidth).not.toHaveBeenCalled();
  });
});
