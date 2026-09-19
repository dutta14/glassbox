import { describe, expect, it } from "vitest";
import { isExternalAsset, leadingImage } from "./noteImage";

const SKETCH = `![Fishing at Sunrise](images/handdrawn-002.jpg)

With no work at home, I have resorted to sketching.`;

describe("a picture that opens a note is lifted out of the prose", () => {
  it("reads the name and the path from the opening line", () => {
    const found = leadingImage(SKETCH);

    expect(found).not.toBeNull();
    expect(found!.alt).toBe("Fishing at Sunrise");
    expect(found!.src).toBe("images/handdrawn-002.jpg");
  });

  it("starts the prose after the picture, not on the blank line it left behind", () => {
    const found = leadingImage(SKETCH)!;

    // The offset is the contract: everything the reader sees is sliced at it.
    expect(SKETCH.slice(found.bodyOffset)).toBe(
      "With no work at home, I have resorted to sketching.",
    );
  });

  it("skips blank lines an importer may have left above the picture", () => {
    const body = `\n\n![Sad Mornings](images/handdrawn-005.jpg)\n\nA grey day.`;

    const found = leadingImage(body)!;

    expect(found.alt).toBe("Sad Mornings");
    expect(body.slice(found.bodyOffset)).toBe("A grey day.");
  });

  it("never points past the end of a note that is only a picture", () => {
    const body = "![Sultry Days](images/handdrawn-001.jpg)";

    const found = leadingImage(body)!;

    // Counting line lengths plus a newline runs one past a body that has no
    // trailing newline, which would slice out of bounds.
    expect(found.bodyOffset).toBe(body.length);
    expect(body.slice(found.bodyOffset)).toBe("");
  });
});

describe("everything else is left as the text it is", () => {
  it("leaves a picture further down the note alone", () => {
    const body = `The sketch below took an afternoon.

![Later](images/handdrawn-003.jpg)`;

    // Lifting this to the top would move it away from the sentence that
    // introduces it, which is a silent edit to the writing.
    expect(leadingImage(body)).toBeNull();
  });

  it("leaves a picture inside a sentence alone", () => {
    expect(
      leadingImage("Here it is ![Sultry Days](images/handdrawn-001.jpg) below."),
    ).toBeNull();
  });

  it("leaves a plain link alone, which is not a picture", () => {
    expect(leadingImage("[images](images/handdrawn-001.jpg)")).toBeNull();
  });

  it("returns nothing for prose", () => {
    expect(leadingImage("With no work at home, I have resorted to sketching."))
      .toBeNull();
  });

  it("returns nothing for an empty note", () => {
    expect(leadingImage("")).toBeNull();
  });
});

describe("paths the browser can open on its own", () => {
  it("recognises the web and inline data, which need no folder", () => {
    expect(isExternalAsset("https://example.com/a.jpg")).toBe(true);
    expect(isExternalAsset("http://example.com/a.jpg")).toBe(true);
    expect(isExternalAsset("data:image/png;base64,AAA")).toBe(true);
  });

  it("treats a path inside the folder as something to be read", () => {
    expect(isExternalAsset("images/handdrawn-001.jpg")).toBe(false);
  });
});
