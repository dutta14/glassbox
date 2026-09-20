import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookContentsPanel } from "./BookContentsPanel";
import type { BookIndexChapter } from "./BookIndex";

const CHAPTERS: BookIndexChapter[] = [
  { id: "a", title: "The Maid", number: 1, story: null, missing: false },
  { id: "b", title: "The Garden", number: 2, story: null, missing: false },
  { id: "c", title: "The Storm", number: 3, story: null, missing: false },
];

interface PanelOverrides {
  chapters?: BookIndexChapter[];
  currentChapterId?: string | null;
  onClose?: () => void;
  onReorder?: (ids: string[]) => void;
  onJump?: (id: string) => void;
  onRemoveChapter?: (id: string) => void;
}

const noop = () => {};

const renderPanel = (over: PanelOverrides = {}) =>
  render(
    <BookContentsPanel
      open
      chapters={over.chapters ?? CHAPTERS}
      currentChapterId={over.currentChapterId ?? null}
      onClose={over.onClose ?? noop}
      onReorder={over.onReorder ?? noop}
      onJump={over.onJump ?? noop}
      onSetNumbered={vi.fn()}
    onSetStory={vi.fn()}
    onRemoveChapter={over.onRemoveChapter ?? noop}
    />,
  );

/* The panel takes #root inert and restores focus to whatever opened it, so the
   tests need a real #root and a real opener to observe either. */
let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
});

afterEach(() => {
  root.remove();
});

/** Mirrors the real caller: a button in the page that opens the sheet. */
const Opener = ({ onJump = vi.fn() }: { onJump?: (id: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Contents
      </button>
      <BookContentsPanel
        open={open}
        chapters={CHAPTERS}
        currentChapterId={null}
        onClose={() => setOpen(false)}
        onReorder={noop}
        onJump={onJump}
        onSetNumbered={vi.fn()}
    onSetStory={vi.fn()}
    onRemoveChapter={noop}
      />
    </>
  );
};

describe("BookContentsPanel", () => {
  it("renders nothing at all when closed", () => {
    render(
      <BookContentsPanel
        open={false}
        chapters={CHAPTERS}
        currentChapterId={null}
        onClose={noop}
        onReorder={noop}
        onJump={noop}
        onSetNumbered={vi.fn()}
    onSetStory={vi.fn()}
    onRemoveChapter={noop}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // Not merely hidden: the chapter buttons must be out of the tab order too.
    expect(screen.queryByRole("button", { name: /The Maid/ })).toBeNull();
  });

  it("names itself after its own heading", () => {
    renderPanel();
    // Two indexes are mounted in the real tree, the page copy and this one, so
    // the heading id has to be generated rather than fixed or they collide.
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Contents");
  });

  it("moves focus into the sheet when it opens", async () => {
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole("button", { name: "Contents" }));
    // Landing on the close button means the keyboard is inside the sheet and
    // the first press of Tab continues within it.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Contents" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(opener).toHaveFocus();
  });

  it("takes the page behind it out of reach while it is open", () => {
    renderPanel();
    expect(root).toHaveAttribute("inert");
  });

  it("gives the page back when it closes", async () => {
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole("button", { name: "Contents" }));
    expect(root).toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(root).not.toHaveAttribute("inert");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ onClose });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not let Escape reach a handler underneath it", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    // Mirrors useDismissable, which every transient layer in the app uses: a
    // bubble-phase listener on the document.
    document.addEventListener("keydown", outer);
    try {
      renderPanel();
      await user.keyboard("{Escape}");
      // One Escape means one thing closes. Without the stop, the same press
      // would also dismiss whatever layer is behind the sheet.
      const escapes = outer.mock.calls.filter(
        (c) => (c[0] as KeyboardEvent).key === "Escape",
      );
      expect(escapes).toHaveLength(0);
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("still lets Tab reach the page, so only Escape is claimed", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      renderPanel();
      screen.getByRole("button", { name: "Close" }).focus();
      await user.tab();
      const tabs = outer.mock.calls.filter(
        (c) => (c[0] as KeyboardEvent).key === "Tab",
      );
      // Swallowing every key would be an easy way to pass the Escape test and
      // a bad way to behave.
      expect(tabs).toHaveLength(1);
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { baseElement } = renderPanel({ onClose });
    const backdrop = baseElement.querySelector(
      ".book-contents__backdrop",
    ) as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the sheet itself is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ onClose });
    await user.click(screen.getByRole("heading", { name: "Contents" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after jumping, because the sheet covers where it just went", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<Opener onJump={onJump} />);
    await user.click(screen.getByRole("button", { name: "Contents" }));
    await user.click(screen.getByRole("button", { name: /^Go to The Storm$/ }));
    expect(onJump).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open while chapters are being reordered", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ onClose });
    await user.click(screen.getByRole("button", { name: "Move The Maid down" }));
    // Reordering is work done on the list, so the list has to stay in front of
    // the reader to do more of it.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("wraps Tab from the last control back to the first", async () => {
    const user = userEvent.setup();
    renderPanel();
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", {
      name: "Remove The Storm from this book",
    });
    last.focus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it("wraps Shift+Tab from the first control back to the last", async () => {
    const user = userEvent.setup();
    renderPanel();
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: "Remove The Storm from this book" }),
    ).toHaveFocus();
  });
});
