import { describe, expect, it, vi } from "vitest";
import { createLocalStorageStore } from "./localStorageStore";
import { saveNotes } from "./notes";
import type { Note } from "../types";

/**
 * Reading a library is paced by the number of files, not their size: in Chrome
 * over 570 notes, opening the handles was 61% of the cost and the bytes were
 * nearly free. So the nav should not wait for the last file to draw the first
 * row, and `list` reports batches as it reads them.
 *
 * These tests pin the contract rather than the clock. Nothing here asserts a
 * duration, because a slow machine would fail it for the wrong reason.
 */

const note = (
  id: string,
  title: string,
  updatedAt = "2020-01-01T12:00:00.000Z",
): Note => ({
  id,
  title,
  body: "body",
  tags: [],
  createdAt: "2020-01-01T12:00:00.000Z",
  updatedAt,
});

/* Seed through the store's own writer rather than a hand-typed key, so this
   cannot quietly test an empty library if the key ever changes. */
const seed = (notes: Note[]) => {
  saveNotes(notes);
};

describe("list reports progress while it reads", () => {
  it("returns the same notes whether or not anyone is listening", async () => {
    seed([note("a", "Alpha"), note("b", "Beta")]);
    const store = createLocalStorageStore();

    const withoutCallback = await store.list();
    const withCallback = await store.list(() => {});

    /* Progress must not change the answer, only when it arrives. */
    expect(withCallback).toEqual(withoutCallback);
  });

  it("hands over notes before resolving, so the nav can draw early", async () => {
    seed([note("a", "Alpha"), note("b", "Beta")]);
    const store = createLocalStorageStore();

    const seen: string[] = [];
    let resolved = false;
    const result = await store.list((batch) => {
      /* If this fires after the promise settles it is useless: the caller
         already had the full list and never needed the progress. */
      expect(resolved).toBe(false);
      seen.push(...batch.map((n) => n.id));
    });
    resolved = true;

    expect(seen).toContain("a");
    expect(result).toHaveLength(2);
  });

  it("does not report an empty batch, which would be progress with no news", async () => {
    seed([]);
    const store = createLocalStorageStore();

    const onBatch = vi.fn();
    await store.list(onBatch);

    expect(onBatch).not.toHaveBeenCalled();
  });

  it("still returns the library when the listener throws", async () => {
    seed([note("a", "Alpha")]);
    const store = createLocalStorageStore();

    /* A crash while drawing a row must not cost someone their notes. */
    const result = await store.list(() => {
      throw new Error("render blew up");
    });

    expect(result.map((n) => n.id)).toEqual(["a"]);
  });
});
