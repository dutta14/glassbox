import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useAskPane,
  clampWidth,
  DEFAULT_WIDTH,
  MIN_WIDTH,
  MAX_WIDTH,
} from "./useAskPane";

const OPEN_KEY = "glassbox.ask.open.v1";
const WIDTH_KEY = "glassbox.ask.width.v1";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the Ask pane remembers whether it was open", () => {
  it("starts closed on a first visit, so the note has the whole window", () => {
    const { result } = renderHook(() => useAskPane());

    expect(result.current.open).toBe(false);
  });

  it("opens and closes", () => {
    const { result } = renderHook(() => useAskPane());

    act(() => result.current.openPane());
    expect(result.current.open).toBe(true);

    act(() => result.current.closePane());
    expect(result.current.open).toBe(false);
  });

  /* Reloading mid-conversation and finding the pane shut would lose the reader
     their place for no reason they caused. */
  it("reopens on the next visit when it was left open", () => {
    const first = renderHook(() => useAskPane());
    act(() => first.result.current.openPane());
    first.unmount();

    const second = renderHook(() => useAskPane());

    expect(second.result.current.open).toBe(true);
  });

  it("stays shut on the next visit when it was closed", () => {
    localStorage.setItem(OPEN_KEY, "true");
    const first = renderHook(() => useAskPane());
    act(() => first.result.current.closePane());
    first.unmount();

    const second = renderHook(() => useAskPane());

    expect(second.result.current.open).toBe(false);
  });

  /* Anything that is not exactly 'true' is treated as shut, so a half-written
     or hand-edited value cannot open a pane nobody asked for. */
  it("treats an unreadable stored value as shut", () => {
    localStorage.setItem(OPEN_KEY, "yes please");

    const { result } = renderHook(() => useAskPane());

    expect(result.current.open).toBe(false);
  });

  it("survives a localStorage that throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    const { result } = renderHook(() => useAskPane());

    expect(result.current.open).toBe(false);
    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("survives a localStorage that throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useAskPane());

    act(() => result.current.openPane());

    expect(result.current.open).toBe(true);
  });
});

describe("the Ask pane remembers how wide it was", () => {
  it("starts at the default width", () => {
    const { result } = renderHook(() => useAskPane());

    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("remembers a width across visits", () => {
    const first = renderHook(() => useAskPane());
    act(() => first.result.current.setWidth(512));
    first.unmount();

    const second = renderHook(() => useAskPane());

    expect(second.result.current.width).toBe(512);
  });

  it("refuses to go narrower than the minimum", () => {
    const { result } = renderHook(() => useAskPane());

    act(() => result.current.setWidth(40));

    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it("refuses to go wider than the maximum", () => {
    const { result } = renderHook(() => useAskPane());

    act(() => result.current.setWidth(5000));

    expect(result.current.width).toBe(MAX_WIDTH);
  });

  /* A width the reader never chose is worse than no memory at all: they cannot
     explain it and cannot find the setting that caused it. Corrupt storage
     should look like a fresh install. */
  it("falls back to the default when the stored width is out of range", () => {
    localStorage.setItem(WIDTH_KEY, "9000");

    const { result } = renderHook(() => useAskPane());

    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("falls back to the default when the stored width is not a number", () => {
    localStorage.setItem(WIDTH_KEY, "wide-ish");

    const { result } = renderHook(() => useAskPane());

    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("falls back to the default when the stored width is empty", () => {
    localStorage.setItem(WIDTH_KEY, "");

    const { result } = renderHook(() => useAskPane());

    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it("stores a whole number of pixels, never a fraction from a drag", () => {
    const { result } = renderHook(() => useAskPane());

    act(() => result.current.setWidth(412.7));

    expect(result.current.width).toBe(413);
    expect(localStorage.getItem(WIDTH_KEY)).toBe("413");
  });
});

describe("clampWidth", () => {
  it("leaves a width inside the range alone", () => {
    expect(clampWidth(400)).toBe(400);
  });

  it("pins the ends of the range exactly", () => {
    expect(clampWidth(MIN_WIDTH)).toBe(MIN_WIDTH);
    expect(clampWidth(MAX_WIDTH)).toBe(MAX_WIDTH);
  });

  it("rounds, so a sub-pixel drag never becomes a stored fraction", () => {
    expect(clampWidth(399.4)).toBe(399);
  });
});
