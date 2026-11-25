import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { collectionMeta } from "./collectionMeta";

const at = (createdAt: string): Note => ({
  id: createdAt,
  title: "",
  body: "",
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

describe("collectionMeta", () => {
  it("is just Empty at zero chapters", () => {
    expect(collectionMeta(0, [])).toBe("Empty");
  });

  it("spans the first and last year of the written dates, in any order", () => {
    const chapters = [
      at("2014-05-01T12:00:00"),
      at("2011-02-01T12:00:00"),
      at("2012-09-01T12:00:00"),
    ];
    expect(collectionMeta(3, chapters)).toBe("3 chapters · 2011–2014");
  });

  it("reads a single year as one year, never a range", () => {
    expect(collectionMeta(1, [at("2011-06-15T12:00:00")])).toBe(
      "1 chapter · 2011",
    );
    expect(
      collectionMeta(2, [at("2011-01-02T12:00:00"), at("2011-12-30T12:00:00")]),
    ).toBe("2 chapters · 2011");
  });

  it("counts a missing chapter but gives it no year", () => {
    expect(collectionMeta(3, [at("2020-03-01T12:00:00"), null, null])).toBe(
      "3 chapters · 2020",
    );
  });

  it("leaves the years off when no chapter has a readable date", () => {
    expect(collectionMeta(2, [at("not a date"), null])).toBe("2 chapters");
  });
});
