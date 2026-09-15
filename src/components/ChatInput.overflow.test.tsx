import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatInput } from "./ChatInput";

/**
 * The composer sizes itself to its text up to a cap. Leaving overflow-y on
 * auto meant Chromium kept a scrollbar against the pill's rounded right edge
 * even when the text fit, which read as a grey sliver sitting outside the
 * border.
 *
 * jsdom reports 0 for scrollHeight, so the prototype is stubbed to stand in
 * for a given amount of text.
 */

const MAX_HEIGHT = 6 * 24 + 24;

const stubScrollHeight = (px: number) => {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => px,
  });
};

afterEach(() => {
  delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>)
    .scrollHeight;
});

const input = () => screen.getByLabelText("Ask a question");

describe("composer sizing", () => {
  it("keeps the scrollbar away while the text still fits", () => {
    stubScrollHeight(44);
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(input().style.overflowY).toBe("hidden");
  });

  it("still fits at exactly the cap, so no scrollbar appears", () => {
    stubScrollHeight(MAX_HEIGHT);
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(input().style.overflowY).toBe("hidden");
    expect(input().style.height).toBe(`${MAX_HEIGHT}px`);
  });

  it("allows scrolling once the text grows past the cap", () => {
    stubScrollHeight(MAX_HEIGHT + 1);
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(input().style.overflowY).toBe("auto");
  });

  it("stops growing at the cap rather than filling the pane", () => {
    stubScrollHeight(900);
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(input().style.height).toBe(`${MAX_HEIGHT}px`);
  });

  it("grows to fit the text while it is under the cap", () => {
    stubScrollHeight(72);
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);

    expect(input().style.height).toBe("72px");
  });
});
