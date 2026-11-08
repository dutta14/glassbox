import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNotes } from "./useNotes";
import { markSeeded } from "../storage/notes";
import { serialiseNote, parseNote } from "../storage/markdown";
import type { Note, NoteFormat } from "../types";
import type { NotesStore } from "../storage/types";

/**
 * Verse conversion spec ACs 22-26: changing the shape of a note that is
 * already written.
 *
 * The trap this file guards is AC 25. Prose is recorded as the *absence* of
 * the format key, so a note switched to prose has to come out byte-identical
 * to one that was always prose. Writing `format: "prose"` instead would look
 * correct in the app and quietly rewrite hundreds of files in the archive.
 */

class InMemoryStore implements NotesStore {
  readonly kind = "local" as const;
  readonly label = "inmem";
  disk = new Map<string, Note>();
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(note: Note): Promise<void> {
    this.disk.set(note.id, note);
  }
  async remove(id: string): Promise<void> {
    this.disk.delete(id);
  }
}

const mkNote = (format?: NoteFormat): Note => ({
  id: "n1",
  title: "Dream Again",
  body: "The silence of the night,\nThe vast starry sky,",
  tags: ["verses"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...(format === undefined ? {} : { format }),
});

const setup = async (note: Note) => {
  const store = new InMemoryStore();
  store.disk.set(note.id, note);
  const rendered = renderHook(() => useNotes(store));
  await waitFor(() =>
    expect(rendered.result.current.notes.map((n) => n.id)).toContain(note.id),
  );
  return { ...rendered, store };
};

const current = (rendered: Awaited<ReturnType<typeof setup>>): Note => {
  const note = rendered.result.current.notes.find((n) => n.id === "n1");
  expect(note).toBeDefined();
  return note!;
};

const setFormat = async (
  rendered: Awaited<ReturnType<typeof setup>>,
  format: NoteFormat,
): Promise<void> => {
  await act(async () => {
    rendered.result.current.setNoteFormat("n1", format);
  });
};

describe("changing a note between prose and verse", () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
  });

  it("turns a prose note into verse", async () => {
    const rendered = await setup(mkNote());

    await setFormat(rendered, "verse");

    expect(current(rendered).format).toBe("verse");
  });

  it("turns a verse note back into prose", async () => {
    const rendered = await setup(mkNote("verse"));

    await setFormat(rendered, "prose");

    expect(current(rendered).format ?? "prose").toBe("prose");
  });

  /* AC 23. The whole point is that the same characters are laid out
     differently, so a round trip has to give back exactly what was typed. */
  it("leaves every character of the body untouched through a round trip", async () => {
    const original = mkNote();
    const rendered = await setup(original);

    await setFormat(rendered, "verse");
    await setFormat(rendered, "prose");

    expect(current(rendered).body).toBe(original.body);
    expect(current(rendered).title).toBe(original.title);
    expect(current(rendered).tags).toEqual(original.tags);
  });

  /* AC 25, the expensive one to get wrong. */
  it("writes no format key at all for a note turned back into prose", async () => {
    const rendered = await setup(mkNote("verse"));

    await setFormat(rendered, "prose");

    const markdown = serialiseNote(current(rendered));
    expect(markdown).not.toContain("format");
  });

  it("leaves a note turned back into prose identical to one that was never verse", async () => {
    const rendered = await setup(mkNote("verse"));

    await setFormat(rendered, "prose");

    const roundTripped = current(rendered);
    const neverVerse: Note = { ...mkNote(), updatedAt: roundTripped.updatedAt };
    expect(serialiseNote(roundTripped)).toBe(serialiseNote(neverVerse));
  });

  it("records verse in the markdown so the shape survives a reload", async () => {
    const rendered = await setup(mkNote());

    await setFormat(rendered, "verse");

    const reparsed = parseNote(serialiseNote(current(rendered)));
    expect(reparsed.ok).toBe(true);
    expect(reparsed.ok && reparsed.note.format).toBe("verse");
  });

  it("saves the new shape to the store", async () => {
    const rendered = await setup(mkNote());

    await setFormat(rendered, "verse");

    await waitFor(() =>
      expect(rendered.store.disk.get("n1")?.format).toBe("verse"),
    );
  });

  /* Same reasoning as updateNote's no-op guard: restamping here would mark an
     untouched note as edited, reorder nothing but rewrite the file for free. */
  it("does nothing when the note is already in that shape", async () => {
    const rendered = await setup(mkNote("verse"));
    const before = current(rendered).updatedAt;

    await setFormat(rendered, "verse");

    expect(current(rendered).updatedAt).toBe(before);
  });

  it("ignores a note that is not there rather than throwing", async () => {
    const rendered = await setup(mkNote());

    await act(async () => {
      rendered.result.current.setNoteFormat("missing", "verse");
    });

    expect(current(rendered).format).toBeUndefined();
  });

  /* AC 32. The imported verses carry both a format and a `verses` tag, which
     makes the tag look like the thing doing the work. It never was, and a
     mis-tag must not rearrange writing. */
  it("does not change shape when the verses tag is added to a prose note", async () => {
    const rendered = await setup(mkNote());

    await act(async () => {
      rendered.result.current.updateNote("n1", {
        body: "The silence of the night, #verses",
      });
    });

    expect(current(rendered).tags).toContain("verses");
    expect(current(rendered).format).toBeUndefined();
  });

  it("does not change shape when the verses tag is removed from a verse note", async () => {
    const rendered = await setup({
      ...mkNote("verse"),
      body: "A poem. #verses",
      tags: ["verses"],
    });

    await act(async () => {
      rendered.result.current.updateNote("n1", { body: "A poem." });
    });

    expect(current(rendered).format).toBe("verse");
  });
});

describe("creating a note in a chosen shape", () => {
  beforeEach(() => {
    localStorage.clear();
    markSeeded();
  });

  it("creates a prose note carrying no format key when asked for nothing", async () => {
    const rendered = await setup(mkNote());

    let created: Note | undefined;
    await act(async () => {
      created = rendered.result.current.createNote();
    });

    expect(created!.format).toBeUndefined();
    expect(serialiseNote(created!)).not.toContain("format");
  });

  it("creates a verse note when asked for verse", async () => {
    const rendered = await setup(mkNote());

    let created: Note | undefined;
    await act(async () => {
      created = rendered.result.current.createNote("verse");
    });

    expect(created!.format).toBe("verse");
  });
});
