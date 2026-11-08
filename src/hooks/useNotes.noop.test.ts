import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNotes } from "./useNotes";
import { markSeeded } from "../storage/notes";
import type { Note } from "../types";
import type { NotesStore } from "../storage/types";

const AUTOSAVE_MS = 500;

class InMemoryStore implements NotesStore {
  readonly kind = "local" as const;
  readonly label = "noop-fixture";
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

const SEEDED: Note = {
  id: "n",
  title: "Returning to Redmond",
  body: "The badge still worked.",
  tags: ["microsoft"],
  createdAt: "2025-08-08T03:21:29.586Z",
  updatedAt: "2025-08-08T03:21:29.586Z",
};

/**
 * `updateNote` used to restamp `updatedAt` and schedule a write for any call at
 * all, including one handing back the values the note already held. That is not
 * a hypothetical: a controlled input that re-emits its current value, a
 * normalisation pass, or a stray keystroke that is then undone all take that
 * path. The damage is quiet and cumulative. Notes reorder in the rail, an
 * untouched note reads "Edited just now", and files on disk are rewritten
 * simply for having been opened, which is how twenty seeded notes ended up
 * claiming they were edited today.
 */
describe("useNotes — an update that changes nothing is not an edit", () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const boot = async () => {
    const store = new InMemoryStore();
    store.disk.set(SEEDED.id, { ...SEEDED });
    const { result } = renderHook(() => useNotes(store));
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
    return { store, result };
  };

  const settle = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });

  it("leaves updatedAt alone when the patch repeats the current body", async () => {
    const { result } = await boot();

    await act(async () => {
      result.current.updateNote("n", { body: SEEDED.body });
    });
    await settle();

    expect(result.current.notes[0].updatedAt).toBe(SEEDED.updatedAt);
  });

  it("leaves updatedAt alone when the patch repeats the current title", async () => {
    const { result } = await boot();

    await act(async () => {
      result.current.updateNote("n", { title: SEEDED.title });
    });
    await settle();

    expect(result.current.notes[0].updatedAt).toBe(SEEDED.updatedAt);
  });

  it("writes nothing to the store for a patch that changes nothing", async () => {
    const { store, result } = await boot();

    await act(async () => {
      result.current.updateNote("n", {
        title: SEEDED.title,
        body: SEEDED.body,
      });
    });
    await settle();

    // The file on disk is the thing the user sees go stale, so it is asserted
    // separately from the in-memory note above.
    expect(store.putCalls).toHaveLength(0);
    expect(store.disk.get("n")!.updatedAt).toBe(SEEDED.updatedAt);
  });

  it("still records a real edit, so the guard has not simply disabled saving", async () => {
    const { store, result } = await boot();

    await act(async () => {
      result.current.updateNote("n", { body: "The badge did not work." });
    });
    await settle();

    expect(store.putCalls).toHaveLength(1);
    expect(store.putCalls[0].body).toBe("The badge did not work.");
    expect(result.current.notes[0].updatedAt).not.toBe(SEEDED.updatedAt);
  });

  it("records an edit that only restores an earlier value, since the note did change", async () => {
    const { store, result } = await boot();

    await act(async () => {
      result.current.updateNote("n", { body: "typo" });
    });
    await settle();
    await act(async () => {
      result.current.updateNote("n", { body: SEEDED.body });
    });
    await settle();

    // Guarding on "differs from current" rather than "differs from the seed"
    // matters here: the second call must not be swallowed.
    expect(store.putCalls).toHaveLength(2);
    expect(store.disk.get("n")!.body).toBe(SEEDED.body);
  });
});
