import { createFileSystemStore } from "./fileSystemStore";
import { serialiseNote } from "./markdown";
import type { Note } from "../types";

// Minimal in-memory stand-in for FileSystemDirectoryHandle.
class FakeFile {
  name: string;
  contents: string;
  lastModified: number;
  constructor(name: string, contents = "", lastModified = Date.now()) {
    this.name = name;
    this.contents = contents;
    this.lastModified = lastModified;
  }
}
class FakeDir {
  files = new Map<string, FakeFile>();
  name = "fake-folder";
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create)
        throw Object.assign(new Error("NotFound"), { name: "NotFoundError" });
      this.files.set(name, new FakeFile(name));
    }
    const f = this.files.get(name)!;
    return {
      kind: "file" as const,
      name,
      getFile: async () => ({
        name: f.name,
        lastModified: f.lastModified,
        text: async () => f.contents,
      }),
      createWritable: async () => {
        let buf = "";
        return {
          write: async (c: string) => {
            buf += c;
          },
          close: async () => {
            f.contents = buf;
            f.lastModified = Date.now();
          },
        };
      },
    };
  }
  dirs = new Map<string, FakeDir>();
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!opts?.create)
        throw Object.assign(new Error("NotFound"), { name: "NotFoundError" });
      const child = new FakeDir();
      child.name = name;
      this.dirs.set(name, child);
    }
    return this.dirs.get(name)!;
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
  async *values() {
    for (const f of this.files.values()) yield await this.getFileHandle(f.name);
  }
  [Symbol.asyncIterator]() {
    return this.values();
  }
}

const mk = (
  id: string,
  title: string,
  body: string,
  updatedAt: string,
): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});

/* Notes live in a notes/ subfolder now. The fake passed in by each test is
   mounted AS that subfolder, so every assertion below still reads the
   directory the notes actually land in and none of them had to change. Tests
   that care about the root itself build it explicitly. */
const rootFor = (d: FakeDir): FakeDir => {
  const root = new FakeDir();
  root.name = "picked-folder";
  root.dirs.set("notes", d);
  return root;
};

const store = (d: FakeDir) =>
  createFileSystemStore(rootFor(d) as unknown as FileSystemDirectoryHandle);

it("writes one .md file per note and reads them back", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(
    mk("a1", "Postgres index tuning", "body one", "2026-01-02T00:00:00.000Z"),
  );
  await s.put(mk("a2", "Sourdough", "body two", "2026-01-03T00:00:00.000Z"));
  const names = [...d.files.keys()];
  expect(names).toHaveLength(2);
  expect(names.every((n) => n.endsWith(".md"))).toBe(true);
  expect(names.some((n) => n.includes("postgres-index-tuning"))).toBe(true);
  const listed = await s.list();
  expect(listed.map((n) => n.id).sort()).toEqual(["a1", "a2"]);
  expect(listed.find((n) => n.id === "a1")!.body).toBe("body one");
});

it("updates in place rather than creating a second file for the same note", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Title", "v1", "2026-01-02T00:00:00.000Z"));
  await s.put(mk("a1", "Title", "v2", "2026-01-04T00:00:00.000Z"));
  expect(d.files.size).toBe(1);
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].body).toBe("v2");
});

it("does not leave a duplicate note behind when the title changes", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Old title", "body", "2026-01-02T00:00:00.000Z"));
  await s.put(mk("a1", "Brand new title", "body", "2026-01-05T00:00:00.000Z"));
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].title).toBe("Brand new title");
  expect(d.files.size).toBe(1);
});

it("removes the file when a note is deleted", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Gone", "body", "2026-01-02T00:00:00.000Z"));
  await s.remove("a1");
  expect(d.files.size).toBe(0);
  expect(await s.list()).toEqual([]);
});

it("identifies notes by frontmatter id, so renaming a file in Finder does not duplicate it", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Original", "body", "2026-01-02T00:00:00.000Z"));
  const [oldName] = [...d.files.keys()];
  const f = d.files.get(oldName)!;
  d.files.delete(oldName);
  d.files.set(
    "renamed-by-hand.md",
    new FakeFile("renamed-by-hand.md", f.contents, f.lastModified),
  );
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe("a1");
  await s.put({
    ...mk("a1", "Original", "edited", "2026-01-06T00:00:00.000Z"),
  });
  expect(await s.list()).toHaveLength(1);
});

it("skips a corrupt file instead of losing the whole library", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Good", "fine", "2026-01-02T00:00:00.000Z"));
  d.files.set(
    "garbage.md",
    new FakeFile("garbage.md", "not frontmatter at all"),
  );
  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe("a1");
});

it("ignores non-markdown files in the folder", async () => {
  const d = new FakeDir();
  const s = store(d);
  await s.put(mk("a1", "Good", "fine", "2026-01-02T00:00:00.000Z"));
  d.files.set("notes.txt", new FakeFile("notes.txt", "hello"));
  d.files.set(".DS_Store", new FakeFile(".DS_Store", "junk"));
  expect(await s.list()).toHaveLength(1);
});

// ---------- Extended coverage ----------

const seedFile = (
  d: FakeDir,
  filename: string,
  note: Note,
  lastModified = Date.now(),
) => {
  d.files.set(
    filename,
    new FakeFile(filename, serialiseNote(note), lastModified),
  );
};

it("adopts .md files already in the folder (written by another tool) instead of overwriting them", async () => {
  // Simulate a folder pre-populated by Obsidian or a git checkout, with no
  // prior contact with this app. First list() must surface those notes.
  const d = new FakeDir();
  const preexisting1 = mk(
    "pre-1",
    "From another editor",
    "external body one",
    "2026-02-01T00:00:00.000Z",
  );
  const preexisting2 = mk(
    "pre-2",
    "Also external",
    "external body two",
    "2026-02-02T00:00:00.000Z",
  );
  seedFile(d, "from-another-editor-pre-1.md", preexisting1);
  seedFile(d, "also-external-pre-2.md", preexisting2);

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(2);
  const byId = new Map(listed.map((n) => [n.id, n]));
  expect(byId.get("pre-1")?.body).toBe("external body one");
  expect(byId.get("pre-2")?.body).toBe("external body two");
  // Prove no file was overwritten or created: same two files, same contents.
  expect([...d.files.keys()].sort()).toEqual([
    "also-external-pre-2.md",
    "from-another-editor-pre-1.md",
  ]);
});

it("adopts existing files AND unions them with subsequently put notes", async () => {
  const d = new FakeDir();
  seedFile(
    d,
    "existing-ext-1.md",
    mk("ext-1", "Existing", "external", "2026-02-01T00:00:00.000Z"),
  );

  const s = store(d);
  await s.put(mk("own-1", "Ours", "own body", "2026-03-01T00:00:00.000Z"));

  const listed = await s.list();
  const ids = listed.map((n) => n.id).sort();
  expect(ids).toEqual(["ext-1", "own-1"]);
  expect(listed.find((n) => n.id === "ext-1")!.body).toBe("external");
  expect(listed.find((n) => n.id === "own-1")!.body).toBe("own body");
});

it("collapses two files with the same frontmatter id to the newer updatedAt (last-write-wins)", async () => {
  // Drive can legitimately leave two files carrying the same id (e.g. a
  // conflicted copy, or a rename that raced with a write). list() must
  // deduplicate on id and prefer the newer updatedAt.
  const d = new FakeDir();
  const older = mk(
    "dup",
    "Older title",
    "OLDER CONTENT",
    "2026-01-01T00:00:00.000Z",
  );
  const newer = mk(
    "dup",
    "Newer title",
    "NEWER CONTENT",
    "2026-06-01T00:00:00.000Z",
  );
  seedFile(d, "older-copy-dup.md", older);
  seedFile(d, "newer-copy-dup.md", newer);

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe("dup");
  // Both halves of the assertion matter: the newer wins AND the older is gone.
  expect(listed[0].body).toBe("NEWER CONTENT");
  expect(listed[0].title).toBe("Newer title");
  expect(listed.some((n) => n.body === "OLDER CONTENT")).toBe(false);
  expect(listed.some((n) => n.title === "Older title")).toBe(false);
});

it("adopts a note whose frontmatter dates are unparseable, falling back to file lastModified", async () => {
  // Losing a note because an editor reformatted its date is unacceptable.
  // The store must fall back to the file's mtime rather than dropping it.
  const d = new FakeDir();
  const badDateContent =
    '---\nid: bad-date\ntitle: "Has bad dates"\ntags: []\ncreatedAt: not-a-date-at-all\nupdatedAt: also-junk\n---\n\nreal body content';
  const fixedMtime = Date.parse("2026-04-15T12:34:56.000Z");
  d.files.set(
    "has-bad-dates-bad-date.md",
    new FakeFile("has-bad-dates-bad-date.md", badDateContent, fixedMtime),
  );

  const s = store(d);
  const listed = await s.list();

  expect(listed).toHaveLength(1);
  const [note] = listed;
  expect(note.id).toBe("bad-date");
  expect(note.body).toBe("real body content");
  // Fallback = file lastModified as canonical ISO. Assert exact value.
  const expected = new Date(fixedMtime).toISOString();
  expect(note.createdAt).toBe(expected);
  expect(note.updatedAt).toBe(expected);
  // Prove the junk strings did not leak through as the dates.
  expect(note.createdAt).not.toBe("not-a-date-at-all");
  expect(note.updatedAt).not.toBe("also-junk");
  expect(note.createdAt).not.toBe("");
  expect(note.updatedAt).not.toBe("");
});

it("round-trips a note whose title is empty through put and list", async () => {
  const d = new FakeDir();
  const s = store(d);
  const note = mk(
    "empty-title",
    "",
    "body of a titleless note",
    "2026-05-01T00:00:00.000Z",
  );
  await s.put(note);

  // Filename must be usable: "untitled-<id>.md", never bare ".md" or hidden.
  const names = [...d.files.keys()];
  expect(names).toHaveLength(1);
  expect(names[0]).toBe("untitled-empty-title.md");
  expect(names[0]).not.toBe(".md");
  expect(names[0].startsWith(".")).toBe(false);

  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe("empty-title");
  expect(listed[0].title).toBe("");
  expect(listed[0].body).toBe("body of a titleless note");
});

it("round-trips a note whose title is punctuation-only through put and list", async () => {
  const d = new FakeDir();
  const s = store(d);
  const note = mk(
    "punct-title",
    "???!!!",
    "punct body",
    "2026-05-02T00:00:00.000Z",
  );
  await s.put(note);

  const names = [...d.files.keys()];
  expect(names[0]).toBe("untitled-punct-title.md");

  const listed = await s.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toBe("punct-title");
  expect(listed[0].title).toBe("???!!!");
  expect(listed[0].body).toBe("punct body");
});

/* The folder layout itself. Notes are scoped to notes/ so that conversations
   can sit beside them in chats/ without being scanned. Every .md in the
   scanned directory becomes a note, so a transcript landing in the same
   directory would be indexed and the engine would quote the app's own answers
   back as though the user had written them. */

it("creates the notes subfolder and writes note files inside it, not at the root", async () => {
  const root = new FakeDir();
  const s = createFileSystemStore(root as unknown as FileSystemDirectoryHandle);

  await s.put(
    mk("a1", "Postgres index tuning", "body", "2026-01-02T00:00:00.000Z"),
  );

  expect(root.files.size).toBe(0);
  const notesDir = root.dirs.get("notes");
  expect(notesDir).toBeDefined();
  expect([...notesDir!.files.keys()]).toHaveLength(1);
  expect([...notesDir!.files.keys()][0]).toMatch(/\.md$/);
});

it("ignores markdown sitting at the root of the picked folder", async () => {
  const root = new FakeDir();
  root.files.set(
    "README.md",
    new FakeFile(
      "README.md",
      serialiseNote(
        mk(
          "stray",
          "Stray",
          "should not be adopted",
          "2026-01-02T00:00:00.000Z",
        ),
      ),
    ),
  );
  const s = createFileSystemStore(root as unknown as FileSystemDirectoryHandle);

  const listed = await s.list();

  expect(listed).toHaveLength(0);
});

it("reads notes already sitting in an existing notes subfolder", async () => {
  const root = new FakeDir();
  const notesDir = new FakeDir();
  notesDir.name = "notes";
  root.dirs.set("notes", notesDir);
  notesDir.files.set(
    "existing-pre-1.md",
    new FakeFile(
      "existing-pre-1.md",
      serialiseNote(
        mk(
          "pre-1",
          "Written by another tool",
          "body",
          "2026-01-02T00:00:00.000Z",
        ),
      ),
    ),
  );
  const s = createFileSystemStore(root as unknown as FileSystemDirectoryHandle);

  const listed = await s.list();

  expect(listed.map((n) => n.id)).toEqual(["pre-1"]);
});

it("labels the store with the folder the user picked rather than the notes subfolder", () => {
  const root = new FakeDir();
  root.name = "my-brain";
  const s = createFileSystemStore(root as unknown as FileSystemDirectoryHandle);

  expect(s.label).toBe("my-brain");
});

/* Images sit in a subfolder beside the notes, written into the Markdown as a
   relative path. The browser cannot open a path on disk, so the store is the
   only thing that can hand those bytes back. */
it("reads a file a note points at, resolved inside the notes folder", async () => {
  const d = new FakeDir();
  const images = await d.getDirectoryHandle("images", { create: true });
  images.files.set(
    "handdrawn-002.jpg",
    new FakeFile("handdrawn-002.jpg", "JPEGBYTES"),
  );
  const s = store(d);

  const file = (await s.readAsset!("images/handdrawn-002.jpg")) as unknown as {
    name: string;
  } | null;

  expect(file?.name).toBe("handdrawn-002.jpg");
});

it("returns null for a picture that is not there, rather than throwing", async () => {
  const s = store(new FakeDir());

  await expect(s.readAsset!("images/never-existed.jpg")).resolves.toBeNull();
});

it("refuses a path that climbs out of the notes folder", async () => {
  /* This fake resolves '..' to the parent, which the stand-in above does not.
     Without it the assertion passes whether or not the store guards anything,
     because the lookup fails for the unrelated reason that no directory is
     literally named '..'. The point is to prove the refusal, not to watch a
     fake decline to implement a feature. */
  class TraversingDir extends FakeDir {
    parent: FakeDir | null = null;
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      if (name === ".." && this.parent) return this.parent;
      return super.getDirectoryHandle(name, opts);
    }
  }

  const notes = new TraversingDir();
  const root = new FakeDir();
  root.name = "picked-folder";
  root.dirs.set("notes", notes);
  notes.parent = root;
  root.files.set("secrets.md", new FakeFile("secrets.md", "PRIVATE"));
  const s = createFileSystemStore(root as unknown as FileSystemDirectoryHandle);

  // A note is a text file anything on the machine can write, so its image
  // path is untrusted. Climbing would read whatever the granted folder holds.
  await expect(s.readAsset!("../secrets.md")).resolves.toBeNull();
  await expect(s.readAsset!("images/../../secrets.md")).resolves.toBeNull();
});

it("refuses an empty path", async () => {
  const s = store(new FakeDir());

  await expect(s.readAsset!("")).resolves.toBeNull();
  await expect(s.readAsset!("/")).resolves.toBeNull();
});

/**
 * Reading a library is paced by how many files it holds, not how big they are.
 * Measured in Chrome over 570 notes, opening the handles was 61% of the cost.
 * So `list` hands over each batch as it is read, letting the nav draw its first
 * rows while the rest of the folder is still being opened.
 */
describe("list reports progress as it reads the folder", () => {
  /** More than one READ_BATCH (24), so there is genuinely more than one batch. */
  const manyNotes = (d: FakeDir, count: number) => {
    const notes = d;
    for (let i = 0; i < count; i++) {
      notes.files.set(
        `note-${i}.md`,
        new FakeFile(
          `note-${i}.md`,
          serialiseNote(
            mk(`n${i}`, `Note ${i}`, "body", "2026-01-02T00:00:00.000Z"),
          ),
        ),
      );
    }
  };

  it("delivers the first notes before it has read them all", async () => {
    const root = new FakeDir();
    const notesDir = await root.getDirectoryHandle("notes", { create: true });
    manyNotes(notesDir as FakeDir, 60);
    const s = createFileSystemStore(
      root as unknown as FileSystemDirectoryHandle,
    );

    const sizes: number[] = [];
    const listed = await s.list((batch) => sizes.push(batch.length));

    /* 60 notes at 24 per batch is three batches, so the nav hears from the
       store twice before the read is done rather than only at the end. */
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(60);
    expect(listed).toHaveLength(60);
  });

  it("reports real notes, not placeholders the nav could not draw", async () => {
    const root = new FakeDir();
    const notesDir = await root.getDirectoryHandle("notes", { create: true });
    manyNotes(notesDir as FakeDir, 30);
    const s = createFileSystemStore(
      root as unknown as FileSystemDirectoryHandle,
    );

    const seen: string[] = [];
    await s.list((batch) => {
      for (const n of batch) {
        /* A row needs exactly these. Anything less and the nav draws blanks. */
        expect(n.id).toBeTruthy();
        expect(typeof n.title).toBe("string");
        seen.push(n.id);
      }
    });

    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("finishes the read when a listener throws", async () => {
    const root = new FakeDir();
    const notesDir = await root.getDirectoryHandle("notes", { create: true });
    manyNotes(notesDir as FakeDir, 30);
    const s = createFileSystemStore(
      root as unknown as FileSystemDirectoryHandle,
    );

    /* A crash while drawing a row must not cost the reader their library. */
    const listed = await s.list(() => {
      throw new Error("render blew up");
    });

    expect(listed).toHaveLength(30);
  });

  it("skips a file it could not parse rather than reporting it as a note", async () => {
    const root = new FakeDir();
    const notesDir = (await root.getDirectoryHandle("notes", {
      create: true,
    })) as FakeDir;
    manyNotes(notesDir, 25);
    notesDir.files.set(
      "broken.md",
      new FakeFile("broken.md", "not a note at all"),
    );
    const s = createFileSystemStore(
      root as unknown as FileSystemDirectoryHandle,
    );

    const reported: string[] = [];
    const listed = await s.list((batch) =>
      reported.push(...batch.map((n) => n.id)),
    );

    expect(reported).toHaveLength(listed.length);
  });
});
