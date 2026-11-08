import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingPosition } from "./useReadingPosition";

const STORAGE_KEY = "glassbox.reading.v1";

describe("useReadingPosition", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns null for a book with no recorded position", () => {
    const { result } = renderHook(() => useReadingPosition());

    expect(result.current.positionFor("book-1")).toBeNull();
  });

  it("returns the chapter that was last read in that book", () => {
    const { result } = renderHook(() => useReadingPosition());

    act(() => result.current.remember("book-1", "chapter-2"));

    expect(result.current.positionFor("book-1")).toBe("chapter-2");
  });

  it("persists the last read chapter across a remount", () => {
    const first = renderHook(() => useReadingPosition());
    act(() => first.result.current.remember("book-1", "chapter-2"));
    first.unmount();

    const second = renderHook(() => useReadingPosition());

    expect(second.result.current.positionFor("book-1")).toBe("chapter-2");
  });

  it("keeps reading positions for several books independently", () => {
    const { result } = renderHook(() => useReadingPosition());

    act(() => {
      result.current.remember("book-1", "chapter-1");
      result.current.remember("book-2", "chapter-4");
      result.current.remember("book-3", "chapter-9");
    });

    expect(result.current.positionFor("book-1")).toBe("chapter-1");
    expect(result.current.positionFor("book-2")).toBe("chapter-4");
    expect(result.current.positionFor("book-3")).toBe("chapter-9");
  });

  it("rejects a stored array and writes a plain map over it", () => {
    // An array passes a naive "every value is a string" check, and spreading
    // one would produce numeric keys in the saved map.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["chapter-1", "chapter-2"]),
    );
    const { result } = renderHook(() => useReadingPosition());

    expect(result.current.positionFor("book-1")).toBeNull();

    act(() => {
      result.current.remember("book-1", "chapter-3");
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      "book-1": "chapter-3",
    });
  });

  it("overwrites the chapter for a book when a new chapter is remembered", () => {
    const { result } = renderHook(() => useReadingPosition());

    act(() => {
      result.current.remember("book-1", "chapter-1");
      result.current.remember("book-1", "chapter-5");
    });

    expect(result.current.positionFor("book-1")).toBe("chapter-5");
  });

  it("forgets one book while leaving other remembered books intact", () => {
    const { result } = renderHook(() => useReadingPosition());

    act(() => {
      result.current.remember("book-1", "chapter-1");
      result.current.remember("book-2", "chapter-4");
      result.current.forget("book-1");
    });

    expect(result.current.positionFor("book-1")).toBeNull();
    expect(result.current.positionFor("book-2")).toBe("chapter-4");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      "book-2": "chapter-4",
    });
  });

  it("does not re-render when a chapter position is remembered", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useReadingPosition();
    });

    act(() => result.current.remember("book-1", "chapter-2"));

    expect(renders).toBe(1);
    expect(result.current.positionFor("book-1")).toBe("chapter-2");
  });

  it.each([["not json"], ["null"], ["[1,2,3]"], ["42"], ['{"b1": 5}']])(
    "returns null instead of throwing when storage contains %s",
    (storedValue) => {
      localStorage.setItem(STORAGE_KEY, storedValue);
      const { result } = renderHook(() => useReadingPosition());

      expect(() => result.current.positionFor("b1")).not.toThrow();
      expect(result.current.positionFor("b1")).toBeNull();
    },
  );

  it("does not propagate a localStorage write failure", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useReadingPosition());

    expect(() => {
      act(() => result.current.remember("book-1", "chapter-2"));
    }).not.toThrow();
    expect(result.current.positionFor("book-1")).toBe("chapter-2");
  });
});
