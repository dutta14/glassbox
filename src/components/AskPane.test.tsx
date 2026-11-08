import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { AskPane } from "./AskPane";
import { COPY } from "../engine/copy";
import { DRAWER_SWAP_WIDTH } from "../hooks/useAskPane";
import type { Conversation } from "../types";

const iso = "2024-01-01T00:00:00.000Z";

const mkConversation = (id: string, title: string): Conversation => ({
  id,
  title,
  messages: [],
  createdAt: iso,
  updatedAt: iso,
});

const conversations = [
  mkConversation("c1", "Why is it slow"),
  mkConversation("c2", "What did I write about bread"),
];

const renderPane = (
  overrides: Partial<ComponentProps<typeof AskPane>> = {},
) => {
  const props = {
    id: "ask-pane",
    width: 400,
    conversations,
    activeConversationId: null,
    onSelectConversation: vi.fn(),
    onNewQuestion: vi.fn(),
    onDeleteConversation: vi.fn(),
    onClose: vi.fn(),
    children: <div data-testid="conversation">the conversation</div>,
    ...overrides,
  };
  return { ...render(<AskPane {...props} />), props };
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("the Ask pane sits beside the note rather than over it", () => {
  /* Announcing it as a dialog would tell a screen reader user the rest of the
     page had gone inert. It has not: the note stays readable and editable,
     which is the entire reason the pane exists. */
  it("is a complementary region, not a dialog", () => {
    renderPane();

    expect(
      screen.getByRole("complementary", { name: COPY.askPaneRegion }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the conversation it was given", () => {
    renderPane();

    expect(screen.getByTestId("conversation")).toBeInTheDocument();
  });

  it("takes the width it was told to take", () => {
    renderPane({ width: 512 });

    expect(
      screen.getByRole("complementary", { name: COPY.askPaneRegion }),
    ).toHaveStyle({ width: "512px" });
  });
});

describe("the Ask pane header", () => {
  it("closes when the close control is pressed", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();

    await user.click(screen.getByRole("button", { name: COPY.askClose }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("starts a new question", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();

    await user.click(screen.getByRole("button", { name: COPY.askNewQuestion }));

    expect(props.onNewQuestion).toHaveBeenCalledTimes(1);
  });

  /* Escape is how people leave things. The drawer does not swallow it: the
     pane is what someone wants gone when they reach for it, and making them
     press it twice would be the common case paying for the rare one. */
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    screen.getByRole("button", { name: COPY.askClose }).focus();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  /* The pane listens on itself, and the composer lives inside it. If any key
     closed it, typing the question would dismiss the thing being typed into. */
  it("stays open while a question is typed into it", async () => {
    const user = userEvent.setup();
    const { props } = renderPane({
      children: <textarea aria-label="Your question" />,
    });

    await user.type(
      screen.getByLabelText("Your question"),
      "why is it slow{Enter}",
    );

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape even while the history drawer is open", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the past questions drawer", () => {
  it("stays shut until it is asked for", () => {
    renderPane();

    expect(
      screen.getByRole("button", { name: COPY.askHistoryOpen }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Why is it slow")).toBeNull();
  });

  it("lists past questions when opened", async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    const drawer = screen.getByRole("group", { name: COPY.askHistoryRegion });
    expect(within(drawer).getByText("Why is it slow")).toBeInTheDocument();
    expect(
      within(drawer).getByText("What did I write about bread"),
    ).toBeInTheDocument();
  });

  it("points the toggle at the drawer it controls", async () => {
    const user = userEvent.setup();
    renderPane();
    const toggle = screen.getByRole("button", { name: COPY.askHistoryOpen });

    await user.click(toggle);

    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it("selects a question and shuts the drawer behind it", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    await user.click(screen.getByText("Why is it slow"));

    expect(props.onSelectConversation).toHaveBeenCalledWith("c1");
    expect(
      screen.queryByRole("group", { name: COPY.askHistoryRegion }),
    ).toBeNull();
  });

  it("marks the open question as current", async () => {
    const user = userEvent.setup();
    renderPane({ activeConversationId: "c2" });

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    expect(
      screen.getByRole("button", { name: "What did I write about bread" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("says so plainly when nothing has been asked yet", async () => {
    const user = userEvent.setup();
    renderPane({ conversations: [] });

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    expect(screen.getByText(COPY.emptyChatsSidebar)).toBeInTheDocument();
  });

  /* The way out is where the way in was, so someone who opened the drawer by
     keyboard is not left hunting for the glyph that closes it. */
  it("returns focus to the toggle when the drawer is shut again", async () => {
    const user = userEvent.setup();
    renderPane();
    const toggle = screen.getByRole("button", { name: COPY.askHistoryOpen });
    await user.click(toggle);

    await user.click(
      screen.getByRole("button", { name: COPY.askHistoryClose }),
    );

    expect(
      screen.getByRole("button", { name: COPY.askHistoryOpen }),
    ).toHaveFocus();
  });

  it("starts a new question from inside the drawer and shuts it", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));
    const drawer = screen.getByRole("group", { name: COPY.askHistoryRegion });

    await user.click(
      within(drawer).getByRole("button", { name: COPY.askNewQuestion }),
    );

    expect(props.onNewQuestion).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("group", { name: COPY.askHistoryRegion }),
    ).toBeNull();
  });

  /* A half-typed question must survive a glance at the history, so the
     conversation is hidden rather than unmounted. */
  it("keeps the conversation mounted while the drawer covers it", async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    expect(screen.getByTestId("conversation")).toBeInTheDocument();
  });
});

describe("the drawer adapts to a narrow pane", () => {
  /* At the default width a 224px drawer would leave a sliver of the
     conversation showing, which reads as a failed overlay rather than
     something sliding over. Below the swap width it takes the whole pane. */
  it("takes the whole pane below the swap width", () => {
    renderPane({ width: DRAWER_SWAP_WIDTH - 1 });

    expect(
      screen.getByRole("complementary", { name: COPY.askPaneRegion }),
    ).toHaveAttribute("data-drawer-swaps", "true");
  });

  it("slides over the conversation at or above the swap width", () => {
    renderPane({ width: DRAWER_SWAP_WIDTH });

    expect(
      screen.getByRole("complementary", { name: COPY.askPaneRegion }),
    ).toHaveAttribute("data-drawer-swaps", "false");
  });

  /* When the drawer has replaced the conversation rather than covering part of
     it, the conversation underneath must leave the accessibility tree. A list
     of questions read as one continuous region with the answer beneath it is
     nonsense to a screen reader. */
  it("hides the covered conversation from assistive tech in the swap", async () => {
    const user = userEvent.setup();
    renderPane({ width: DRAWER_SWAP_WIDTH - 1 });

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    expect(screen.getByTestId("conversation").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("leaves the conversation readable when the drawer merely overlays it", async () => {
    const user = userEvent.setup();
    renderPane({ width: DRAWER_SWAP_WIDTH });

    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    expect(screen.getByTestId("conversation").parentElement).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });
});

describe("deleting a past question", () => {
  /* Delete moved into the drawer with the list when the rail's Questions
     section went. Losing it would have been a silent capability regression. */
  it("asks before deleting, then deletes", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    await user.click(
      screen.getByRole("button", { name: "More actions for Why is it slow" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(props.onDeleteConversation).toHaveBeenCalledWith("c1");
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const { props } = renderPane();
    await user.click(screen.getByRole("button", { name: COPY.askHistoryOpen }));

    await user.click(
      screen.getByRole("button", { name: "More actions for Why is it slow" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(props.onDeleteConversation).not.toHaveBeenCalled();
  });
});
