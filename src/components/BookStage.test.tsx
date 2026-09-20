import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BookStage } from "./BookStage";
import type { Book, Note, StoryMark } from "../types";

const makeNote = (over: Partial<Note> & { id: string }): Note => ({
  title: "",
  body: "",
  tags: [],
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
  ...over,
});

const makeBook = (chapterIds: string[]): Book => ({
  id: "bk1",
  title: "My Book",
  chapterIds,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
});

const noop = () => {};

interface StageOverrides {
  book?: Book;
  chapters?: (Note | null)[];
  onReorder?: (ids: string[]) => void;
  onRemoveChapter?: (id: string) => void;
  onSetNumbered?: (id: string, numbered: boolean) => void;
  onSetStory?: (id: string, title: string | null) => void;
  onApplyStories?: (stories: StoryMark[]) => void;
  onRename?: (title: string) => void;
  resumeChapterId?: string | null;
  onReadChapter?: (id: string) => void;
}

/** BookStage links chapter titles to their notes, so it needs a router. */
const renderStage = (over: StageOverrides = {}) =>
  render(
    <MemoryRouter>
      <BookStage
        book={over.book ?? makeBook([])}
        chapters={over.chapters ?? []}
        onReorder={over.onReorder ?? noop}
        onSetNumbered={over.onSetNumbered ?? noop}
        onSetStory={over.onSetStory ?? noop}
        onApplyStories={over.onApplyStories ?? noop}
        onRemoveChapter={over.onRemoveChapter ?? noop}
        onRename={over.onRename ?? noop}
        resumeChapterId={over.resumeChapterId ?? null}
        onReadChapter={over.onReadChapter ?? noop}
      />
    </MemoryRouter>,
  );

const chapterHeadings = (): string[] =>
  screen
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "")
    .filter((t) => t.startsWith("Chapter "));

/**
 * BookStage runs two IntersectionObservers: one over the chapters and one over
 * the front matter. A test that grabbed the first callback would silently start
 * driving the wrong one if their order ever changed, so this fake records what
 * each observer watches and hands back the one watching a given element.
 */
const installFakeObserver = () => {
  type IOEntry = { isIntersecting: boolean; target: Element };
  const observers: { cb: (e: IOEntry[]) => void; targets: Element[] }[] = [];
  const original = window.IntersectionObserver;

  class FakeIO {
    private record: { cb: (e: IOEntry[]) => void; targets: Element[] };
    constructor(cb: (e: IOEntry[]) => void) {
      this.record = { cb, targets: [] };
      observers.push(this.record);
    }
    observe(el: Element) {
      this.record.targets.push(el);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;

  return {
    /** Reports `el` as intersecting to whichever observer is watching it. */
    intersect(el: Element) {
      const found = observers.find((o) => o.targets.includes(el));
      if (!found) throw new Error("No observer is watching that element");
      act(() => {
        found.cb([{ isIntersecting: true, target: el }]);
      });
    },
    restore() {
      window.IntersectionObserver = original;
    },
  };
};

const articleFor = (headingName: string): HTMLElement =>
  screen
    .getByRole("heading", { name: headingName })
    .closest("article") as HTMLElement;

/** jsdom has no scrollIntoView, so the stage's optional call needs a stand-in. */
const stubScrollIntoView = () => {
  const original = Element.prototype.scrollIntoView;
  const spy = vi.fn();
  Element.prototype.scrollIntoView = spy;
  return {
    spy,
    restore() {
      Element.prototype.scrollIntoView = original;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BookStage — chapters", () => {
  it("renders chapters in the book's order, not by title or date", () => {
    // Book order is Beta, Gamma, Alpha: not alphabetical (Alpha, Beta, Gamma)
    // and not by createdAt (Alpha 2010, Gamma 2015, Beta 2020). If any of those
    // orders showed instead, the reader would be handed a different book.
    const beta = makeNote({ id: "n1", title: "Beta", createdAt: "2020-01-01" });
    const alpha = makeNote({
      id: "n2",
      title: "Alpha",
      createdAt: "2010-01-01",
    });
    const gamma = makeNote({
      id: "n3",
      title: "Gamma",
      createdAt: "2015-01-01",
    });
    renderStage({
      book: makeBook(["n1", "n3", "n2"]),
      chapters: [beta, gamma, alpha],
    });
    expect(chapterHeadings()).toEqual([
      "Chapter 1 Beta",
      "Chapter 2 Gamma",
      "Chapter 3 Alpha",
    ]);
  });

  it("reports a missing chapter in place rather than dropping it", () => {
    const first = makeNote({ id: "n1", title: "First" });
    const last = makeNote({ id: "n3", title: "Last" });
    renderStage({
      book: makeBook(["n1", "gone", "n3"]),
      chapters: [first, null, last],
    });
    expect(
      screen.getByText(/This chapter's note was deleted/),
    ).toBeInTheDocument();
    const headings = chapterHeadings();
    // Still three chapters, and the survivors keep their positions around the
    // gap. Silently dropping the missing one would leave a two-chapter book
    // with no explanation.
    expect(headings).toHaveLength(3);
    expect(headings[1]).toBe("Chapter 2 Missing chapter");
    expect(headings[2]).toBe("Chapter 3 Last");
  });

  it("keeps the line breaks of a verse chapter", () => {
    const poem = makeNote({
      id: "n1",
      title: "Rain",
      body: "v one\nv two",
      format: "verse",
    });
    renderStage({ book: makeBook(["n1"]), chapters: [poem] });
    // The raw normalizer keeps the newline, so this only matches if the break
    // survives into the DOM rather than being collapsed to a space.
    expect(
      screen.getByText("v one\nv two", { normalizer: (str) => str }),
    ).toBeInTheDocument();
  });

  it("collapses the soft line breaks of a prose chapter into flowing text", () => {
    const note = makeNote({ id: "n1", title: "Note", body: "p one\np two" });
    renderStage({ book: makeBook(["n1"]), chapters: [note] });
    expect(screen.getByText("p one p two")).toBeInTheDocument();
    // The unbroken newline must be gone, which is what separates prose from
    // verse. If it survived, prose would be set line-for-line like a poem.
    expect(
      screen.queryByText("p one\np two", { normalizer: (str) => str }),
    ).toBeNull();
  });

  it("links a chapter title to its note", () => {
    const note = makeNote({ id: "n1", title: "Only" });
    renderStage({ book: makeBook(["n1"]), chapters: [note] });
    // The title is the only route into the note now that the per-chapter
    // buttons are gone, so it has to be a real link: middle-clickable and
    // copyable as an address, which a button would not be.
    expect(screen.getByRole("link", { name: "Only" })).toHaveAttribute(
      "href",
      "/note/n1",
    );
  });

  it("does not link a missing chapter to a note that is not there", () => {
    renderStage({ book: makeBook(["gone"]), chapters: [null] });
    expect(screen.queryByRole("link", { name: "Missing chapter" })).toBeNull();
  });

  it("separates chapters with an ornament but never opens the book with one", () => {
    const one = makeNote({ id: "n1", title: "One" });
    const two = makeNote({ id: "n2", title: "Two" });
    const { container } = renderStage({
      book: makeBook(["n1", "n2"]),
      chapters: [one, two],
    });
    // Two chapters means one join between them. An ornament above the first
    // would divide the opening chapter from the contents it already follows.
    expect(container.querySelectorAll(".book-chapter__ornament")).toHaveLength(
      1,
    );
    expect(
      articleFor("Chapter 1 One").querySelector(".book-chapter__ornament"),
    ).toBeNull();
  });
});

describe("BookStage — front matter", () => {
  it("shows an empty state that says how to add a chapter", () => {
    renderStage({ book: makeBook([]), chapters: [] });
    expect(
      screen.getByText(/This book has no chapters yet/),
    ).toBeInTheDocument();
    // No contents and no chapters, so nothing pretends the book has content.
    expect(screen.queryByRole("navigation", { name: "Contents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Contents" })).toBeNull();
  });

  it("counts the chapters and the time to read them", () => {
    const long = makeNote({
      id: "n1",
      title: "Long",
      body: "word ".repeat(460),
    });
    const short = makeNote({ id: "n2", title: "Short", body: "a few words" });
    renderStage({ book: makeBook(["n1", "n2"]), chapters: [long, short] });
    // 460 words is two minutes at 230wpm, plus the one-minute floor for the
    // short chapter.
    expect(screen.getByText("2 chapters · 3 min")).toBeInTheDocument();
  });

  it("counts a single chapter in the singular", () => {
    const one = makeNote({ id: "n1", title: "One", body: "a word" });
    renderStage({ book: makeBook(["n1"]), chapters: [one] });
    expect(screen.getByText(/^1 chapter · /)).toBeInTheDocument();
  });
});

describe("BookStage — renaming", () => {
  it("does not save the title on every keystroke", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderStage({ book: makeBook([]), onRename });
    const field = screen.getByLabelText("Book title");
    await user.clear(field);
    await user.type(field, "Autumn");
    // Each rename writes the book's file. Committing per keystroke would put a
    // dozen writes on disk for one retitling.
    expect(onRename).not.toHaveBeenCalled();
  });

  it("saves the title when the field is left", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderStage({ book: makeBook([]), onRename });
    const field = screen.getByLabelText("Book title");
    await user.clear(field);
    await user.type(field, "  Autumn  ");
    await user.tab();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Autumn");
  });

  it("does not save a title that was opened and left unchanged", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderStage({ book: makeBook([]), onRename });
    await user.click(screen.getByLabelText("Book title"));
    await user.tab();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("abandons the edit on Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderStage({ book: makeBook([]), onRename });
    const field = screen.getByLabelText("Book title");
    await user.clear(field);
    await user.type(field, "Discarded{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(field).toHaveValue("My Book");
  });

  it("saves a title still being edited when the book is navigated away from", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const { unmount } = renderStage({ book: makeBook([]), onRename });
    const field = screen.getByLabelText("Book title");
    await user.clear(field);
    await user.type(field, "Autumn");
    // No blur: the reader clicked straight through to something else. Losing
    // the rename because the field never lost focus would be silent data loss.
    unmount();
    expect(onRename).toHaveBeenCalledWith("Autumn");
  });
});

describe("BookStage — contents", () => {
  it("removes a chapter through the contents", async () => {
    const user = userEvent.setup();
    const onRemoveChapter = vi.fn();
    renderStage({
      book: makeBook(["gone"]),
      chapters: [null],
      onRemoveChapter,
    });
    await user.click(
      screen.getByRole("button", {
        name: "Remove Missing chapter from this book",
      }),
    );
    expect(onRemoveChapter).toHaveBeenCalledWith("gone");
  });

  it("scrolls the chosen chapter into view when its contents entry is clicked", async () => {
    const scroll = stubScrollIntoView();
    try {
      const user = userEvent.setup();
      const first = makeNote({ id: "n1", title: "First" });
      const second = makeNote({ id: "n2", title: "Second" });
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: [first, second],
      });
      await user.click(screen.getByRole("button", { name: /^Go to Second$/ }));
      expect(scroll.spy).toHaveBeenCalledTimes(1);
      // Scrolled to the second chapter's article, not just any element.
      const target = scroll.spy.mock.instances[0] as HTMLElement;
      expect(target.dataset.chapterId).toBe("n2");
    } finally {
      scroll.restore();
    }
  });

  it("opens the contents panel from the bar", async () => {
    const user = userEvent.setup();
    const one = makeNote({ id: "n1", title: "One" });
    renderStage({ book: makeBook(["n1"]), chapters: [one] });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Contents" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("marks the chapter reported by the intersection observer as current", () => {
    const io = installFakeObserver();
    try {
      const first = makeNote({ id: "n1", title: "First" });
      const second = makeNote({ id: "n2", title: "Second" });
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: [first, second],
      });
      io.intersect(articleFor("Chapter 2 Second"));
      expect(
        screen.getByRole("button", { name: /^Go to Second$/ }),
      ).toHaveAttribute("aria-current", "true");
      expect(
        screen.getByRole("button", { name: /^Go to First$/ }),
      ).not.toHaveAttribute("aria-current");
    } finally {
      io.restore();
    }
  });
});

describe("BookStage — reading position", () => {
  it("records the chapter that comes into view", () => {
    const io = installFakeObserver();
    try {
      const onReadChapter = vi.fn();
      const first = makeNote({ id: "n1", title: "First" });
      const second = makeNote({ id: "n2", title: "Second" });
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: [first, second],
        onReadChapter,
      });
      io.intersect(articleFor("Chapter 2 Second"));
      expect(onReadChapter).toHaveBeenCalledWith("n2");
    } finally {
      io.restore();
    }
  });

  it("opens the book at the chapter last read", () => {
    const scroll = stubScrollIntoView();
    try {
      const notes = ["n1", "n2", "n3"].map((id) =>
        makeNote({ id, title: id.toUpperCase() }),
      );
      renderStage({
        book: makeBook(["n1", "n2", "n3"]),
        chapters: notes,
        resumeChapterId: "n2",
      });
      expect(scroll.spy).toHaveBeenCalledTimes(1);
      expect(
        (scroll.spy.mock.instances[0] as HTMLElement).dataset.chapterId,
      ).toBe("n2");
    } finally {
      scroll.restore();
    }
  });

  it("does not resume onto the first chapter", () => {
    const scroll = stubScrollIntoView();
    try {
      const notes = ["n1", "n2"].map((id) => makeNote({ id, title: id }));
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: notes,
        resumeChapterId: "n1",
      });
      // Jumping past the title and the contents to land on chapter one reads
      // as the book having lost its front matter, not as being resumed.
      expect(scroll.spy).not.toHaveBeenCalled();
    } finally {
      scroll.restore();
    }
  });

  it("ignores a remembered chapter that is no longer in the book", () => {
    const scroll = stubScrollIntoView();
    try {
      const notes = ["n1", "n2"].map((id) => makeNote({ id, title: id }));
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: notes,
        resumeChapterId: "removed",
      });
      /* Pins that a stale position opens the book at the front and scrolls
         nowhere. It would fail against an implementation that fell back to a
         nearby chapter or to the first one when the id did not resolve. */
      expect(scroll.spy).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Book title")).toBeInTheDocument();
    } finally {
      scroll.restore();
    }
  });

  it("starts at the front when there is nothing remembered", () => {
    const scroll = stubScrollIntoView();
    try {
      const notes = ["n1", "n2"].map((id) => makeNote({ id, title: id }));
      renderStage({
        book: makeBook(["n1", "n2"]),
        chapters: notes,
        resumeChapterId: null,
      });
      expect(scroll.spy).not.toHaveBeenCalled();
    } finally {
      scroll.restore();
    }
  });
});

describe("BookStage — numbering", () => {
  /** Every chapter heading, less the contents heading that shares its level. */
  const headings = (): string[] =>
    screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "")
      .filter((t) => t !== "Contents");

  /**
   * A prologue is not chapter one. It sits at the front of the book and takes
   * no number, and the chapter behind it keeps the number its author gave it.
   */
  it("counts only the chapters that are numbered", () => {
    renderStage({
      book: {
        ...makeBook(["p", "a", "b"]),
        unnumberedIds: ["p"],
      },
      chapters: [
        makeNote({ id: "p", title: "Prologue" }),
        makeNote({ id: "a", title: "The Fallen Nest" }),
        makeNote({ id: "b", title: "The Long Road" }),
      ],
    });

    expect(headings()).toEqual([
      "Prologue",
      "Chapter 1 The Fallen Nest",
      "Chapter 2 The Long Road",
    ]);
  });

  it("gives an unnumbered chapter no number at all, not a dash or a zero", () => {
    renderStage({
      book: { ...makeBook(["p"]), unnumberedIds: ["p"] },
      chapters: [makeNote({ id: "p", title: "Prologue" })],
    });

    expect(headings()).toEqual(["Prologue"]);
  });

  /**
   * Front matter has nothing but its own name, so that name has to be the way
   * into the note. Were it plain text the chapter would be unreachable from
   * the book.
   */
  it("links an unnumbered chapter through its name", () => {
    renderStage({
      book: { ...makeBook(["p"]), unnumberedIds: ["p"] },
      chapters: [makeNote({ id: "p", title: "Prologue" })],
    });

    expect(screen.getByRole("link", { name: "Prologue" })).toHaveAttribute(
      "href",
      "/note/p",
    );
  });

  /**
   * Authors number their own titles. Printing ours above theirs gave every
   * chapter two numbers that disagreed as soon as anything moved.
   */
  it("does not print a number above a number the author already wrote", () => {
    renderStage({
      book: makeBook(["a", "b"]),
      chapters: [
        makeNote({ id: "a", title: "#1 – The Fallen Nest" }),
        makeNote({ id: "b", title: "Chapter 2: The Long Road" }),
      ],
    });

    expect(headings()).toEqual([
      "Chapter 1 The Fallen Nest",
      "Chapter 2 The Long Road",
    ]);
  });

  /**
   * "Chapter 3" is a number and nothing else, so once the number moves to the
   * grey line there is no title left. The line stands alone and carries the
   * link, rather than leaving an empty heading behind it.
   */
  it("shows the number alone when the chapter is named only by its number", () => {
    renderStage({
      book: makeBook(["a"]),
      chapters: [makeNote({ id: "a", title: "Chapter 3" })],
    });

    expect(headings()).toEqual(["Chapter 1"]);
    expect(screen.getByRole("link", { name: "Chapter 1" })).toHaveAttribute(
      "href",
      "/note/a",
    );
  });

  it("numbers a missing chapter like any other, so the ones after it do not shift", () => {
    renderStage({
      book: makeBook(["a", "gone", "b"]),
      chapters: [
        makeNote({ id: "a", title: "First" }),
        null,
        makeNote({ id: "b", title: "Third" }),
      ],
    });

    expect(headings()).toEqual([
      "Chapter 1 First",
      "Chapter 2 Missing chapter",
      "Chapter 3 Third",
    ]);
  });
});

describe("BookStage — anthologies", () => {
  const anthology = () => ({
    book: {
      ...makeBook(["n1", "n2", "n3"]),
      stories: [
        { startsAt: "n1", title: "Echoes" },
        { startsAt: "n3", title: "Fracture" },
      ],
    },
    chapters: [
      makeNote({ id: "n1", title: "Echoes – Chapter 1", body: "One." }),
      makeNote({ id: "n2", title: "Echoes – Chapter 2", body: "Two." }),
      makeNote({ id: "n3", title: "Fracture – Chapter 1", body: "Three." }),
    ],
  });

  it("announces each story above the chapter that opens it", () => {
    const { container } = renderStage(anthology());

    const breaks = Array.from(
      container.querySelectorAll(".book-story__title"),
    ).map((el) => el.textContent);
    expect(breaks).toEqual(["Echoes", "Fracture"]);
  });

  it("starts the numbering again in each story", () => {
    renderStage(anthology());

    const numbers = Array.from(
      document.querySelectorAll(".book-chapter__number"),
    ).map((el) => el.textContent);
    expect(numbers).toEqual(["Chapter 1", "Chapter 2", "Chapter 1"]);
  });

  it("drops a chapter's story prefix when it agrees with the story", () => {
    renderStage(anthology());

    expect(screen.queryByText(/Echoes – Chapter/)).not.toBeInTheDocument();
  });

  it("keeps a prefix that names a different story, so a misfiled chapter shows", () => {
    const base = anthology();
    renderStage({
      ...base,
      chapters: [
        base.chapters[0],
        makeNote({ id: "n2", title: "Fracture – Chapter 2", body: "Two." }),
        base.chapters[2],
      ],
    });

    expect(
      screen.getByRole("link", { name: /Fracture – Chapter 2/ }),
    ).toBeInTheDocument();
  });

  it("puts no ornament above the chapter that opens a story", () => {
    const { container } = renderStage(anthology());

    // Three chapters, but two of them open a story, so only the middle one
    // is separated from what came before by an ornament.
    expect(container.querySelectorAll(".book-chapter__ornament")).toHaveLength(
      1,
    );
  });

  it("names the stories in the contents as well as the page", () => {
    renderStage(anthology());

    // The contents is the only place a reader can see the whole shape of an
    // anthology at once, so the divisions have to reach it.
    expect(screen.getAllByRole("button", { name: /Echoes/ })).not.toHaveLength(
      0,
    );
    expect(
      screen.getAllByRole("button", { name: /Fracture/ }),
    ).not.toHaveLength(0);
  });

  it("leaves a book with no stories reading as it always did", () => {
    const { container } = renderStage({
      book: makeBook(["n1", "n2"]),
      chapters: [
        makeNote({ id: "n1", title: "One" }),
        makeNote({ id: "n2", title: "Two" }),
      ],
    });

    expect(container.querySelectorAll(".book-story")).toHaveLength(0);
    expect(container.querySelectorAll(".book-chapter__ornament")).toHaveLength(
      1,
    );
  });

  it("does not separate a story that opens the book from what is above it", () => {
    const { container } = renderStage(anthology());

    const breaks = container.querySelectorAll(".book-story");
    expect(breaks[0]).toHaveClass("book-story--first");
    expect(breaks[1]).not.toHaveClass("book-story--first");
  });
});

describe("BookStage — offering to divide a book", () => {
  const imported = () => ({
    book: makeBook(["n1", "n2", "n3", "n4"]),
    chapters: [
      makeNote({ id: "n1", title: "Echoes – Chapter 1" }),
      makeNote({ id: "n2", title: "Echoes – Chapter 2" }),
      makeNote({ id: "n3", title: "Fracture – Chapter 1" }),
      makeNote({ id: "n4", title: "Fracture – Chapter 2" }),
    ],
  });

  it("names the stories it has found in the chapter titles", () => {
    renderStage(imported());

    expect(
      screen.getByText(
        /These chapters look like 2 stories: Echoes, Fracture\./,
      ),
    ).toBeInTheDocument();
  });

  it("divides the book only when the offer is accepted", async () => {
    const onApplyStories = vi.fn();
    renderStage({ ...imported(), onApplyStories });

    expect(onApplyStories).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Divide the book" }),
    );

    expect(onApplyStories).toHaveBeenCalledWith([
      { startsAt: "n1", title: "Echoes" },
      { startsAt: "n3", title: "Fracture" },
    ]);
  });

  it("makes no offer once the book has been divided", () => {
    const base = imported();
    renderStage({
      ...base,
      book: { ...base.book, stories: [{ startsAt: "n1", title: "Echoes" }] },
    });

    expect(
      screen.queryByRole("button", { name: "Divide the book" }),
    ).not.toBeInTheDocument();
  });

  it("makes no offer when the titles name no stories", () => {
    renderStage({
      book: makeBook(["n1", "n2"]),
      chapters: [
        makeNote({ id: "n1", title: "Chapter 1" }),
        makeNote({ id: "n2", title: "Chapter 2" }),
      ],
    });

    expect(
      screen.queryByRole("button", { name: "Divide the book" }),
    ).not.toBeInTheDocument();
  });
});
