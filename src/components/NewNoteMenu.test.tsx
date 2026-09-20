import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewNoteMenu } from "./NewNoteMenu";

const renderMenu = () => {
  const onCreate = vi.fn();
  render(
    <div>
      <button type="button">outside</button>
      <NewNoteMenu onCreate={onCreate} />
    </div>,
  );
  return { onCreate };
};

const primary = () => screen.getByRole("button", { name: "New note" });
const disclosure = () =>
  screen.getByRole("button", { name: "New note options" });
const noteItem = () => screen.queryByRole("menuitem", { name: "Note" });
const verseItem = () => screen.queryByRole("menuitem", { name: "Verse" });

describe("the one-click default stays prose (AC 4, 6, 29)", () => {
  it("creates a prose note from the primary button without opening the menu", async () => {
    const { onCreate } = renderMenu();

    await userEvent.click(primary());

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("prose");
    // The point of a split control: the common case never sees a menu.
    expect(noteItem()).toBeNull();
    expect(verseItem()).toBeNull();
  });

  it("keeps both choices behind the caret until it is pressed", async () => {
    renderMenu();

    expect(noteItem()).toBeNull();
    await userEvent.click(disclosure());

    expect(noteItem()).toBeInTheDocument();
    expect(verseItem()).toBeInTheDocument();
  });

  it("reports whether the menu is showing, so the caret is not a mystery button", async () => {
    renderMenu();

    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(disclosure());

    expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("choosing a format (AC 5, 29)", () => {
  it("creates a verse note when Verse is chosen", async () => {
    const { onCreate } = renderMenu();

    await userEvent.click(disclosure());
    await userEvent.click(verseItem()!);

    expect(onCreate).toHaveBeenCalledWith("verse");
  });

  it("creates a prose note when Note is chosen", async () => {
    const { onCreate } = renderMenu();

    await userEvent.click(disclosure());
    await userEvent.click(noteItem()!);

    expect(onCreate).toHaveBeenCalledWith("prose");
  });

  it("closes the menu after choosing, so focus can land on the new note", async () => {
    renderMenu();

    await userEvent.click(disclosure());
    await userEvent.click(verseItem()!);

    await waitFor(() => expect(verseItem()).toBeNull());
  });
});

describe("the menu is reachable and escapable by keyboard (AC 7, 31)", () => {
  it("opens from the keyboard and puts focus on the first choice", async () => {
    renderMenu();

    disclosure().focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(noteItem()).toHaveFocus());
  });

  it("closes on Escape without creating anything", async () => {
    const { onCreate } = renderMenu();

    await userEvent.click(disclosure());
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(noteItem()).toBeNull());
    // Dismissing is not a decision. Nothing may be written to the folder
    // because a menu was opened and thought better of.
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("returns focus to the caret on Escape rather than dropping it at the top of the page", async () => {
    renderMenu();

    await userEvent.click(disclosure());
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(disclosure()).toHaveFocus());
  });

  it("closes without creating anything when the press lands outside", async () => {
    const { onCreate } = renderMenu();

    await userEvent.click(disclosure());
    await userEvent.click(screen.getByRole("button", { name: "outside" }));

    await waitFor(() => expect(noteItem()).toBeNull());
    expect(onCreate).not.toHaveBeenCalled();
  });
});
