import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { OrganizeMenu } from "./OrganizeMenu";
import type { OrganizeMode } from "../hooks/useNoteOrganize";

const Harness = ({
  initialMode = "list",
  onChoose = vi.fn(),
}: {
  initialMode?: OrganizeMode;
  onChoose?: (mode: OrganizeMode) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OrganizeMode>(initialMode);
  return (
    <OrganizeMenu
      mode={mode}
      open={open}
      onOpenChange={setOpen}
      onChoose={(next) => {
        setMode(next);
        onChoose(next);
      }}
    />
  );
};

const openMenu = async () =>
  userEvent.click(screen.getByRole("button", { name: "Organize notes" }));

describe("OrganizeMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("names the trigger so a screen reader can read an icon-only button", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Organize notes" }),
    ).toBeInTheDocument();
  });

  it("keeps the menu shut until the trigger is used", () => {
    render(<Harness />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers the two ways of arranging notes", async () => {
    render(<Harness />);
    await openMenu();
    expect(
      screen.getByRole("menuitemradio", { name: /In one list/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    ).toBeInTheDocument();
  });

  /* Radio rather than plain menuitem, because the two are exclusive. A
     menuitem would be announced as an unrelated command and the check mark
     would be the only thing saying otherwise, which a screen reader cannot
     see. */
  it("marks the active choice as the checked one", async () => {
    render(<Harness initialMode="book" />);
    await openMenu();
    expect(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: /In one list/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("reports the mode the reader picked", async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    );
    expect(onChoose).toHaveBeenCalledWith("book");
  });

  it("shuts the menu once a choice is made", async () => {
    render(<Harness />);
    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves the check to the newly chosen mode", async () => {
    render(<Harness />);
    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    );
    await openMenu();
    expect(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  /* Opening on the active choice rather than the first one means the menu
     tells you where you already are before you move. */
  it("opens with focus on the mode already in use", async () => {
    render(<Harness initialMode="book" />);
    await openMenu();
    expect(
      screen.getByRole("menuitemradio", { name: /By book/ }),
    ).toHaveFocus();
  });

  /* Deliberately the mode that is FIRST in the list. Checking only the "book"
     case cannot tell "focus the active choice" apart from "focus whichever
     option happens to be last", because By book is both. */
  it("opens with focus on the first option when that is the active one", async () => {
    render(<Harness initialMode="list" />);
    await openMenu();
    expect(
      screen.getByRole("menuitemradio", { name: /In one list/ }),
    ).toHaveFocus();
  });

  it("closes on Escape without changing anything", async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    await openMenu();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("gives focus back to the trigger after Escape", async () => {
    render(<Harness />);
    await openMenu();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Organize notes" }),
    ).toHaveFocus();
  });

  /* The heading repeats the menu's own accessible name, so leaving it readable
     would make a screen reader say "Organize notes" twice before the choices. */
  it("hides the repeated heading from the screen reader", async () => {
    render(<Harness />);
    await openMenu();
    expect(screen.getByRole("menu")).toHaveAccessibleName("Organize notes");
    expect(
      screen.getByText("Organize notes", { selector: "p" }),
    ).toHaveAttribute("aria-hidden", "true");
  });
});
