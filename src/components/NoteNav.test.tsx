import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteNav } from "./NoteNav";
import type { Note } from "../types";

const note = (id: string, title: string): Note => ({
  id,
  title,
  body: "",
  tags: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

const older = note("older", "Sourdough starter");
const newer = note("newer", "Postgres index tuning");

describe("NoteNav", () => {
  it("names the note behind each direction, so the destination is known before the click", () => {
    render(<NoteNav previous={older} next={newer} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Previous note: Sourdough starter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next note: Postgres index tuning" }),
    ).toBeInTheDocument();
  });

  it("opens the previous note when it is chosen", async () => {
    const onSelect = vi.fn();
    render(<NoteNav previous={older} next={newer} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole("button", { name: /^Previous note:/ }),
    );

    expect(onSelect).toHaveBeenCalledWith("older");
  });

  it("opens the next note when it is chosen", async () => {
    const onSelect = vi.fn();
    render(<NoteNav previous={older} next={newer} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /^Next note:/ }));

    expect(onSelect).toHaveBeenCalledWith("newer");
  });

  it("omits Previous on the first note rather than showing a dead control", () => {
    render(<NoteNav previous={null} next={newer} onSelect={vi.fn()} />);

    expect(screen.queryByText("← Previous")).not.toBeInTheDocument();
    expect(screen.getByText("Next →")).toBeInTheDocument();
  });

  it("omits Next on the most recent note", () => {
    render(<NoteNav previous={older} next={null} onSelect={vi.fn()} />);

    expect(screen.queryByText("Next →")).not.toBeInTheDocument();
    expect(screen.getByText("← Previous")).toBeInTheDocument();
  });

  it("renders nothing at all when there is nowhere to go", () => {
    // Otherwise the nav's top rule would hang under the note on its own.
    const { container } = render(
      <NoteNav previous={null} next={null} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to Untitled so an unnamed note is still identifiable", () => {
    render(
      <NoteNav
        previous={note("blank", "   ")}
        next={null}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Previous note: Untitled" }),
    ).toBeInTheDocument();
  });

  it("groups the pair in a landmark, so it can be skipped or jumped to", () => {
    render(<NoteNav previous={older} next={newer} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("navigation", { name: "Previous and next notes" }),
    ).toBeInTheDocument();
  });
});
