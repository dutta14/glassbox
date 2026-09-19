import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NoteImage } from "./NoteImage";

/* jsdom implements neither, and the component's whole job is to turn bytes
   into something an <img> can point at. Stubbed so the exchange is
   observable, including that what is created is later given back. */
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  let next = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:fake/${(next += 1)}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
  });
});

afterEach(() => vi.unstubAllGlobals());

const blob = () => new Blob(["bytes"], { type: "image/jpeg" });

describe("a picture stored beside the notes", () => {
  it("reads the file through the folder and shows it", async () => {
    const readAsset = vi.fn(async () => blob());

    render(
      <NoteImage
        src="images/handdrawn-002.jpg"
        alt="Fishing at Sunrise"
        readAsset={readAsset}
      />,
    );

    await waitFor(() => expect(created).toHaveLength(1));
    expect(readAsset).toHaveBeenCalledWith("images/handdrawn-002.jpg");
    const img = document.querySelector("img.note-image");
    expect(img).toHaveAttribute("src", created[0]);
  });

  it("hands the object URL back when the note is left", async () => {
    const readAsset = vi.fn(async () => blob());
    const { unmount } = render(
      <NoteImage src="images/a.jpg" alt="A" readAsset={readAsset} />,
    );
    await waitFor(() => expect(created).toHaveLength(1));

    unmount();

    // Reading through 566 notes without this leaks every picture opened.
    expect(revoked).toEqual([created[0]]);
  });

  it("does not ask the folder for a picture that is already a web address", async () => {
    const readAsset = vi.fn(async () => blob());

    render(
      <NoteImage
        src="https://example.com/sketch.jpg"
        alt="Sketch"
        readAsset={readAsset}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector("img.note-image")).toHaveAttribute(
        "src",
        "https://example.com/sketch.jpg",
      ),
    );
    expect(readAsset).not.toHaveBeenCalled();
  });
});

describe("when the picture cannot be read", () => {
  it("keeps the sketch's name, so the note does not open on a sentence about nothing", async () => {
    // The state a browser-storage library is permanently in: the images live
    // in the folder, so there is nothing to read until it is connected.
    const readAsset = vi.fn(async () => null);

    render(
      <NoteImage
        src="images/handdrawn-001.jpg"
        alt="Sultry Days"
        readAsset={readAsset}
      />,
    );

    expect(await screen.findByText("Sultry Days")).toBeInTheDocument();
    expect(document.querySelector("img.note-image")).toBeNull();
  });

  it("creates no object URL it would then have to release", async () => {
    render(
      <NoteImage
        src="images/missing.jpg"
        alt="Gone"
        readAsset={async () => null}
      />,
    );

    await screen.findByText("Gone");
    expect(created).toHaveLength(0);
    expect(revoked).toHaveLength(0);
  });
});
