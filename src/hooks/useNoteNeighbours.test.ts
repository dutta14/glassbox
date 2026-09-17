import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNoteNeighbours } from "./useNoteNeighbours";
import type { Note } from "../types";

const note = (id: string, createdAt: string, updatedAt = createdAt): Note => ({
  id,
  title: id,
  body: "",
  tags: [],
  createdAt,
  updatedAt,
});

/** Created oldest to newest: a, then b, then c. */
const a = note("a", "2024-01-01T00:00:00.000Z");
const b = note("b", "2024-02-01T00:00:00.000Z");
const c = note("c", "2024-03-01T00:00:00.000Z");

/** The rail hands these over sorted by updatedAt, so the input is not in
    creation order to begin with. */
const setup = (notes: Note[], selectedId: string | null) =>
  renderHook(() => useNoteNeighbours(notes, selectedId));

describe("useNoteNeighbours", () => {
  it("points Previous at the note created before this one", () => {
    const { result } = setup([c, b, a], "b");

    expect(result.current.previous?.id).toBe("a");
  });

  it("points Next at the note created after this one", () => {
    const { result } = setup([c, b, a], "b");

    expect(result.current.next?.id).toBe("c");
  });

  it("offers no Next on the most recently created note", () => {
    const { result } = setup([c, b, a], "c");

    expect(result.current.next).toBeNull();
    expect(result.current.previous?.id).toBe("b");
  });

  it("offers no Previous on the first note ever written", () => {
    const { result } = setup([c, b, a], "a");

    expect(result.current.previous).toBeNull();
    expect(result.current.next?.id).toBe("b");
  });

  it("offers neither when nothing is selected", () => {
    const { result } = setup([c, b, a], null);

    expect(result.current.previous).toBeNull();
    expect(result.current.next).toBeNull();
  });

  it("offers neither when the selected note is not in the list", () => {
    const { result } = setup([c, b, a], "missing");

    expect(result.current.previous).toBeNull();
    expect(result.current.next).toBeNull();
  });

  it("ignores the order the rail happens to hand it", () => {
    // The rail sorts by updatedAt. Creation order must win regardless of the
    // sequence the array arrives in.
    const { result } = setup([a, c, b], "b");

    expect(result.current.previous?.id).toBe("a");
    expect(result.current.next?.id).toBe("c");
  });

  it("keeps both neighbours when an edit makes this the most recent note", () => {
    // This is why creation order is used. "b" is edited, so the rail moves it
    // to the front and its updatedAt is now the newest of the three. Ordering
    // on updatedAt would make it the newest note and drop its Next link.
    const editedB = note("b", b.createdAt, "2024-04-01T00:00:00.000Z");
    const { result } = setup([editedB, c, a], "b");

    expect(result.current.previous?.id).toBe("a");
    expect(result.current.next?.id).toBe("c");
  });

  it("orders notes created in the same millisecond deterministically", () => {
    const x = note("x", "2024-05-01T00:00:00.000Z");
    const y = note("y", "2024-05-01T00:00:00.000Z");

    expect(setup([x, y], "y").result.current.next?.id).toBe("x");
    expect(setup([y, x], "y").result.current.next?.id).toBe("x");
  });
});
