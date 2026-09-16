import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RailTip } from "./RailTip";

describe("RailTip", () => {
  it("shows the label so a collapsed icon is not a guessing game", () => {
    render(<RailTip label="New note" />);

    expect(screen.getByText("New note")).toBeInTheDocument();
  });

  it("hides the label from assistive tech, which already hears it once", () => {
    // The host button carries the same string as its aria-label. Without this
    // attribute a screen reader reaches the tip as a second, identical node.
    render(<RailTip label="New note" />);

    expect(screen.getByText("New note")).toHaveAttribute("aria-hidden", "true");
  });
});
