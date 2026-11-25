import { describe, expect, it } from "vitest";
import type { Book, Note } from "../types";
import { orderCollections } from "./collectionOrder";

const note = (id: string, createdAt: string): Note => ({
  id,
  title: id,
  body: "",
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

const book = (
  title: string,
  chapterIds: string[],
  createdAt = "2020-01-01T12:00:00",
): Book => ({
  id: title,
  title,
  chapterIds,
  createdAt,
  updatedAt: "2030-01-01T12:00:00",
});

const titles = (books: readonly Book[], notes: readonly Note[]) =>
  orderCollections(books, notes).map((b) => b.title);

describe("orderCollections", () => {
  it("puts empty collections first, newest created first", () => {
    const notes = [note("n1", "2024-05-01T12:00:00")];
    expect(
      titles(
        [
          book("Full", ["n1"]),
          book("Old empty", [], "2021-01-01T12:00:00"),
          book("New empty", [], "2023-01-01T12:00:00"),
        ],
        notes,
      ),
    ).toEqual(["New empty", "Old empty", "Full"]);
  });

  it("orders by end year, newest first, ignoring updatedAt", () => {
    const notes = [
      note("a", "2011-03-01T12:00:00"),
      note("b", "2019-03-01T12:00:00"),
      note("c", "2014-03-01T12:00:00"),
    ];
    expect(
      titles(
        [book("Ends 2014", ["a", "c"]), book("Ends 2019", ["b", "a"])],
        notes,
      ),
    ).toEqual(["Ends 2019", "Ends 2014"]);
  });

  it("breaks an end-year tie by the latest written date, then title", () => {
    const notes = [
      note("a", "2020-02-01T12:00:00"),
      note("b", "2020-09-01T12:00:00"),
      note("c", "2020-09-01T12:00:00"),
    ];
    expect(
      titles(
        [
          book("B", ["c"]),
          book("Later", ["b"]),
          book("Earlier", ["a"]),
          book("A", ["b"]),
        ],
        notes,
      ),
    ).toEqual(["A", "B", "Later", "Earlier"]);
  });

  it("sends collections with no readable chapter date after dated ones", () => {
    const notes = [
      note("bad", "not a date"),
      note("ok", "2001-06-01T12:00:00"),
    ];
    expect(
      titles([book("Undated", ["bad", "gone"]), book("Dated", ["ok"])], notes),
    ).toEqual(["Dated", "Undated"]);
  });
});
