import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* Read from disk for the same reason tokens.test.ts does: vite.config.ts sets
   css: false, so a `?raw` import resolves to an empty string and jsdom sees no
   styling at all. Nothing in the component suite can observe a layout bug, so
   the invariant has to be asserted against the stylesheet itself. */
const STYLES = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(STYLES, "AskPane.css"), "utf8");

const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from AskPane.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

describe("the Ask pane's scroll chain", () => {
  /* A flex item's automatic minimum size is its content, on whatever the main
     axis happens to be. The body became a column so the history glyph could
     sit above the conversation, which moved that minimum from the inline axis
     to the block axis. Without min-height: 0 the conversation cannot shrink
     below its own content, so the chat log never receives a bounded height,
     its overflow-y has nothing to scroll against, and a long answer is
     silently clipped by the pane's overflow: hidden.

     This is asserted here rather than in a component test because the bug is
     invisible to jsdom: every element reports a height of zero, so the log
     would appear to scroll perfectly while being unusable in a browser. */
  it("lets the conversation shrink below its content so the log can scroll", () => {
    expect(rule(".ask-pane__conversation")).toMatch(/min-height:\s*0/);
  });

  it("is still the column layout that made that necessary", () => {
    expect(rule(".ask-pane__body")).toMatch(/flex-direction:\s*column/);
  });

  /* The pane clips rather than scrolls, which is what turns a missing
     min-height into lost content rather than a stray scrollbar. */
  it("clips at the pane, so nothing inside may rely on the pane scrolling", () => {
    expect(rule(".ask-pane")).toMatch(/overflow:\s*hidden/);
  });
});
