import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readOrganizeMode, useNoteOrganize } from "./useNoteOrganize";

describe("useNoteOrganize", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* Every note in one place is the mode that cannot hide anything, so it is
     what someone who has never chosen should get. */
  it("starts in one list for a reader who has never chosen", () => {
    const { result } = renderHook(() => useNoteOrganize());
    expect(result.current[0]).toBe("list");
  });

  it("starts in the mode that was last chosen", () => {
    localStorage.setItem("glassbox.notesOrganize.v1", "book");
    const { result } = renderHook(() => useNoteOrganize());
    expect(result.current[0]).toBe("book");
  });

  it("remembers a chosen mode across a reload", () => {
    const { result } = renderHook(() => useNoteOrganize());
    act(() => result.current[1]("book"));
    expect(readOrganizeMode()).toBe("book");
  });

  it("reports the new mode straight away", () => {
    const { result } = renderHook(() => useNoteOrganize());
    act(() => result.current[1]("book"));
    expect(result.current[0]).toBe("book");
  });

  /* A value written by a later version, or a half-written one, must not take
     the rail down with it. Losing the preference costs a click. */
  it("falls back to one list when the stored value is not a mode", () => {
    localStorage.setItem("glassbox.notesOrganize.v1", "by-author");
    expect(readOrganizeMode()).toBe("list");
  });

  it("falls back to one list when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readOrganizeMode()).toBe("list");
  });

  it("keeps working for this session when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const { result } = renderHook(() => useNoteOrganize());
    act(() => result.current[1]("book"));
    expect(result.current[0]).toBe("book");
  });
});
