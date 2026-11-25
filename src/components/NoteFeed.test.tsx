import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, Note } from "../types";
import { NoteFeed } from "./NoteFeed";

interface Watcher {
  cb: (entries: Partial<IntersectionObserverEntry>[]) => void;
  options: IntersectionObserverInit | undefined;
  targets: Element[];
}

/* jsdom has no IntersectionObserver, so the feed's two observers are stood in
   for. They are told apart by the margin each was given. */
const installObserver = () => {
  const watchers: Watcher[] = [];
  const original = window.IntersectionObserver;
  class FakeIO {
    private watcher: Watcher;
    constructor(cb: Watcher["cb"], options?: IntersectionObserverInit) {
      this.watcher = { cb, options, targets: [] };
      watchers.push(this.watcher);
    }
    observe(el: Element) {
      this.watcher.targets.push(el);
    }
    unobserve() {}
    disconnect() {
      this.watcher.targets = [];
    }
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  const live = (margin: string) =>
    watchers.filter(
      (w) => w.options?.rootMargin === margin && w.targets.length > 0,
    );
  return {
    /** Something enters the reading band. */
    cross(el: Element) {
      const band = live("-25% 0px -65% 0px").find((w) =>
        w.targets.includes(el),
      );
      if (!band) throw new Error("Nothing is watching that article");
      act(() => band.cb([{ isIntersecting: true, target: el }]));
    },
    /** The end of the feed comes within reach. */
    reachEnd() {
      const watcher = live("0px 0px 400px 0px").at(-1);
      if (!watcher) throw new Error("No sentinel is being watched");
      act(() =>
        watcher.cb([{ isIntersecting: true, target: watcher.targets[0] }]),
      );
    },
    restore() {
      window.IntersectionObserver = original;
    },
  };
};

const makeNotes = (count: number): Note[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `n${i + 1}`,
    title: `Post ${i + 1}`,
    body: `Body of post ${i + 1} mentions lanterns.`,
    tags: [],
    createdAt: new Date(2026, 5, 30 - i).toISOString(),
    updatedAt: new Date(2026, 5, 30 - i).toISOString(),
  }));

const readAsset = async () => null;

interface Overrides {
  list?: Note[];
  query?: string | null;
  currentId?: string | null;
  bookByNoteId?: Map<string, Book>;
  onCurrentChange?: (id: string) => void;
}

const renderFeed = (overrides: Overrides = {}) => {
  const list = overrides.list ?? makeNotes(10);
  const onCurrentChange = overrides.onCurrentChange ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <NoteFeed
        list={list}
        query={overrides.query ?? null}
        currentId={
          overrides.currentId === undefined ? list[0]?.id : overrides.currentId
        }
        scrollRequest={null}
        bookByNoteId={overrides.bookByNoteId ?? new Map()}
        readAsset={readAsset}
        onCurrentChange={onCurrentChange}
      />
    </MemoryRouter>,
  );
  return { ...utils, onCurrentChange };
};

const articleTitles = () =>
  screen.queryAllByRole("article").map((a) => a.getAttribute("data-post-id"));

describe("NoteFeed", () => {
  let io: ReturnType<typeof installObserver>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    io = installObserver();
  });

  afterEach(() => {
    io.restore();
    vi.useRealTimers();
  });

  it("shows the first four posts and no more until the end is near", () => {
    renderFeed();

    expect(articleTitles()).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("labels each post by its title", () => {
    renderFeed();

    expect(screen.getByRole("article", { name: "Post 2" })).toBeInTheDocument();
  });

  it("loads four more after a short wait once the end comes within reach", () => {
    renderFeed();

    io.reachEnd();
    expect(screen.getByRole("status")).toHaveTextContent("Loading more…");
    expect(articleTitles()).toHaveLength(4);

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(articleTitles()).toHaveLength(8);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says it is finished once every post is showing", () => {
    renderFeed({ list: makeNotes(6) });

    io.reachEnd();
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(articleTitles()).toHaveLength(6);
    expect(screen.getByRole("status")).toHaveTextContent("That’s everything.");
  });

  it("opens with the post it was given already loaded, however far down", () => {
    renderFeed({ currentId: "n9" });

    expect(articleTitles()).toHaveLength(9);
  });

  it("makes the post crossing the reading band the open one", () => {
    const { onCurrentChange } = renderFeed();

    io.cross(screen.getByRole("article", { name: "Post 3" }));

    expect(onCurrentChange).toHaveBeenCalledTimes(1);
    expect(onCurrentChange).toHaveBeenCalledWith("n3");
  });

  it("does not report a post that is already the open one", () => {
    const { onCurrentChange } = renderFeed();

    io.cross(screen.getByRole("article", { name: "Post 1" }));

    expect(onCurrentChange).not.toHaveBeenCalled();
  });

  it("falls back to the first post when the open note is not a post", () => {
    const { onCurrentChange } = renderFeed({ currentId: "elsewhere" });

    expect(onCurrentChange).toHaveBeenCalledWith("n1");
  });

  it("links each post to the editor", () => {
    renderFeed();

    expect(screen.getByRole("link", { name: "Edit Post 2" })).toHaveAttribute(
      "href",
      "/note/n2?edit=1",
    );
  });

  it("says so, centred, when there is nothing to read", () => {
    renderFeed({ list: [], currentId: null });

    expect(
      screen.getByText("Nothing here yet. Start with the first line."),
    ).toBeInTheDocument();
  });

  describe("while searching", () => {
    it("marks every hit in the title and the body", () => {
      renderFeed({ query: "lantern" });

      const article = screen.getAllByRole("article")[0];
      const marks = Array.from(article.querySelectorAll("mark")).map(
        (m) => m.textContent,
      );
      expect(marks).toEqual(["lantern"]);
    });

    it("marks a hit in the title too", () => {
      renderFeed({ list: makeNotes(2), query: "post 2" });

      const article = screen.getByRole("article", { name: "Post 2" });
      expect(within(article).getAllByText("Post 2")[0].tagName).toBe("MARK");
    });

    it("names the collection on a result that is in one", () => {
      const book: Book = {
        id: "b1",
        title: "Winter drafts",
        chapterIds: ["n2"],
        createdAt: "",
        updatedAt: "",
      } as Book;
      renderFeed({
        query: "lantern",
        bookByNoteId: new Map([["n2", book]]),
      });

      const [first, second] = screen.getAllByRole("article");
      expect(within(first).queryByText(/In the collection/)).toBeNull();
      expect(
        within(second).getByRole("link", { name: "Winter drafts" }),
      ).toHaveAttribute("href", "/book/b1");
    });

    it("starts on the first result", () => {
      const { onCurrentChange } = renderFeed({
        list: makeNotes(3).slice(1),
        query: "lantern",
        currentId: "n1",
      });

      expect(onCurrentChange).toHaveBeenCalledWith("n2");
    });

    it("asks for a search before there is one, and says when nothing matches", () => {
      const { unmount } = renderFeed({ list: [], query: "", currentId: null });
      expect(screen.getByText("Results open here as you type.")).toBeVisible();
      unmount();

      renderFeed({ list: [], query: "zzz", currentId: null });
      expect(screen.getByText("Nothing to show.")).toBeVisible();
    });
  });

  it("does not need the user to do anything for a list shorter than a page", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderFeed({ list: makeNotes(2) });

    await user.tab();

    expect(articleTitles()).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("That’s everything.");
  });
});
