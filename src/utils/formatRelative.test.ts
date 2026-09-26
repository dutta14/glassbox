import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelative } from "./formatRelative";

/** Local noon, so the label never depends on the runner's timezone. */
const at = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 12, 0, 0).toISOString();

const freeze = (y: number, m: number, d: number) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelative", () => {
  it("returns an empty string for a timestamp it cannot parse", () => {
    expect(formatRelative("not a date")).toBe("");
  });

  it("labels a timestamp from earlier the same day as Today", () => {
    freeze(2026, 5, 20);
    expect(formatRelative(at(2026, 5, 20))).toBe("Today");
  });

  it("labels a timestamp from the previous calendar day as Yesterday", () => {
    freeze(2026, 5, 20);
    expect(formatRelative(at(2026, 5, 19))).toBe("Yesterday");
  });

  it("counts days for the rest of the first week", () => {
    freeze(2026, 5, 20);
    expect(formatRelative(at(2026, 5, 15))).toBe("5 days ago");
  });

  it("switches to a date once a week has passed", () => {
    freeze(2026, 5, 20);
    expect(formatRelative(at(2026, 5, 13))).toMatch(/May 13/);
  });

  it("omits the year for a date within the current year", () => {
    freeze(2026, 9, 26);
    expect(formatRelative(at(2026, 5, 25))).not.toMatch(/2026/);
  });

  it("includes the year for a date in an earlier year", () => {
    freeze(2026, 9, 26);
    expect(formatRelative(at(2010, 5, 25))).toMatch(/2010/);
  });

  it("includes the year for December once January has arrived", () => {
    freeze(2026, 1, 8);
    expect(formatRelative(at(2025, 12, 28))).toMatch(/2025/);
  });

  it("distinguishes the same day and month in two different years", () => {
    freeze(2026, 9, 26);
    const older = formatRelative(at(2019, 5, 25));
    const newer = formatRelative(at(2026, 5, 25));
    expect(older).not.toBe(newer);
  });

  it("treats a future timestamp as Today rather than counting backwards", () => {
    freeze(2026, 5, 20);
    expect(formatRelative(at(2026, 5, 22))).toBe("Today");
  });
});
