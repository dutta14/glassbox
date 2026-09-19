import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteEditor } from "./NoteEditor";
import type { Note } from "../types";

/**
 * Seven notes in the archive are sketches: a picture, then a paragraph about
 * it. These pin what a reader sees and, just as importantly, what the file
 * keeps.
 */

const PROSE =
  "With no work at home, I have resorted to sketching. This one is from the " +
  "village we visited during holidays.";

const SKETCH_BODY = `![Fishing at Sunrise](images/handdrawn-002.jpg)\n\n${PROSE}`;

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Fishing at Sunrise",
  body: SKETCH_BODY,
  tags: ["sketches"],
  createdAt: "2011-06-07T15:46:18.000Z",
  updatedAt: "2011-06-07T15:46:18.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake/1"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => vi.unstubAllGlobals());

const renderEditor = (
  note: Note = makeNote(),
  readAsset = vi.fn(async () => new Blob(["bytes"], { type: "image/jpeg" })),
) => {
  const onChangeBody = vi.fn();
  render(
    <NoteEditor
      readAsset={readAsset}
      note={note}
      scrollToOffset={null}
      previousNote={null}
      nextNote={null}
      onChangeTitle={vi.fn()}
      onChangeBody={onChangeBody}
      onScrollHandled={vi.fn()}
      onSelectNote={vi.fn()}
    />,
  );
  return { onChangeBody, readAsset };
};

const readView = () => document.querySelector(".editor__read") as HTMLElement;
const field = () => screen.getByLabelText("Note body") as HTMLTextAreaElement;

describe("a sketch note shows its picture", () => {
  it("asks the folder for the file the note points at", async () => {
    const { readAsset } = renderEditor();

    await waitFor(() =>
      expect(readAsset).toHaveBeenCalledWith("images/handdrawn-002.jpg"),
    );
  });

  it("stops printing the picture's own source line as text", async () => {
    renderEditor();

    await waitFor(() =>
      expect(document.querySelector("img.note-image")).not.toBeNull(),
    );
    // The bug this fixes: the reader saw the Markdown instead of the drawing.
    expect(readView().textContent).not.toContain("![Fishing at Sunrise]");
    expect(readView().textContent).not.toContain("images/handdrawn-002.jpg");
  });

  it("opens the note on its prose", async () => {
    renderEditor();

    await waitFor(() => expect(readView().textContent).toBe(PROSE));
  });

  it("keeps the whole file in the field, Markdown and all", async () => {
    renderEditor();

    // The file is what is being edited. Hiding a line from the reading view
    // must never quietly rewrite the note.
    expect(field()).toHaveValue(SKETCH_BODY);
  });

  it("still shows the picture once the note is being typed into", async () => {
    renderEditor();
    await waitFor(() =>
      expect(document.querySelector("img.note-image")).not.toBeNull(),
    );

    await userEvent.click(field());

    // Lifted clear of the text, so clicking in does not make the drawing
    // vanish and pull everything above the reader's eye.
    expect(document.querySelector("img.note-image")).not.toBeNull();
  });
});

describe("clicking the prose puts the caret where it was pointed", () => {
  it("counts the click from the whole note, not from the text left after the picture", async () => {
    renderEditor();
    await waitFor(() => expect(readView().textContent).toBe(PROSE));

    /* jsdom has no caret-from-point, and the reading view is the only thing
       that can report a position, so the browser's answer is stood in for.
       It returns an offset into the text on screen, which begins after the
       picture that was lifted off the top. */
    const node = readView().firstChild;
    const doc = document as unknown as { caretPositionFromPoint?: unknown };
    const original = doc.caretPositionFromPoint;
    doc.caretPositionFromPoint = () => ({ offsetNode: node, offset: 5 });

    fireEvent.mouseDown(readView(), { clientX: 10, clientY: 10 });

    // Without the picture's length added back, the caret lands 47 characters
    // earlier than the word the reader aimed at.
    const expected = 5 + SKETCH_BODY.indexOf(PROSE);
    await waitFor(() => expect(field().selectionStart).toBe(expected));
    doc.caretPositionFromPoint = original;
  });
});

describe("the drop cap follows the words, not the Markdown", () => {
  it("measures the sunk capital from the prose the reader sees", async () => {
    renderEditor();

    await waitFor(() => expect(readView()).toHaveAttribute("data-dropcap"));
  });
});

describe("a note with no picture is untouched", () => {
  it("shows its body exactly as written", () => {
    renderEditor(makeNote({ body: PROSE }));

    expect(readView().textContent).toBe(PROSE);
    expect(document.querySelector("img.note-image")).toBeNull();
  });

  it("never asks the folder for anything", () => {
    const { readAsset } = renderEditor(makeNote({ body: PROSE }));

    expect(readAsset).not.toHaveBeenCalled();
  });
});
