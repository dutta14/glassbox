import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNotes } from "./useNotes";
import type { Note } from "../types";
import type { NotesStore } from "../storage/types";

/**
 * Gap #3 — AC 25 storage-unavailable bootstrap.
 *
 * When localStorage throws on every read AND every write, the app must still
 * come up to a `ready` state. A fresh app is empty: nothing is seeded, so
 * nothing is written on the way up.
 */

class InMemoryStore implements NotesStore {
  readonly kind = "local" as const;
  readonly label = "no-ls";
  disk = new Map<string, Note>();
  putCalls: Note[] = [];
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(note: Note): Promise<void> {
    this.putCalls.push({ ...note, tags: [...note.tags] });
    this.disk.set(note.id, { ...note });
  }
  async remove(id: string): Promise<void> {
    this.disk.delete(id);
  }
}

describe("useNotes bootstrap — Gap #3 / AC 25 storage unavailable", () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let setSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Real localStorage.clear works before we install the throwing spies.
    localStorage.clear();
    getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: read denied");
    });
    setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: write denied");
    });
    removeSpy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError: remove denied");
      });
  });

  afterEach(() => {
    getSpy.mockRestore();
    setSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("reaches ready status even when localStorage throws on both read and write", async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("starts empty and writes nothing on first bootstrap", async () => {
    const store = new InMemoryStore();
    const { result } = renderHook(() => useNotes(store));

    await vi.waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.notes).toEqual([]);
    expect(store.putCalls).toEqual([]);
  });
});
