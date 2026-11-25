import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Book, Note } from "../types";
import { COPY } from "../engine/copy";
import { useScrollFades } from "../hooks/useScrollFades";
import { normalizeQuery } from "../utils/searchNotes";
import { NoteArticle } from "./NoteArticle";
import "../styles/NoteFeed.css";

/** How many posts arrive at a time, and how many are there to begin with. */
const PAGE_SIZE = 4;
/** A short pause before more posts appear, so the page reads as being fetched
    rather than as having jumped. */
const LOAD_DELAY_MS = 450;
/** The sentinel counts as reached a little before it is on screen. */
const SENTINEL_MARGIN = "0px 0px 400px 0px";
/** A thin strip in the upper part of the pane. The post crossing it is the
    one being read. */
const READING_BAND = "-25% 0px -65% 0px";
/** Where a post's top edge lands when the feed scrolls to it. */
const SCROLL_OFFSET_PX = 40;
/** While the feed scrolls itself, the spy stays quiet so it does not argue
    with the destination. Smooth scrolls take longer, and there is no event to
    say when one has finished. */
const SMOOTH_LOCK_MS = 1200;
const INSTANT_LOCK_MS = 300;

export interface ScrollRequest {
  id: string;
  /** Lets the same post be asked for twice in a row. */
  n: number;
}

interface NoteFeedProps {
  /** The posts to read, in reading order. */
  list: readonly Note[];
  /** Null while reading the feed, the search text while the rail is searching. */
  query: string | null;
  /** The post the app considers open. */
  currentId: string | null;
  scrollRequest: ScrollRequest | null;
  bookByNoteId: ReadonlyMap<string, Book>;
  readAsset: (path: string) => Promise<Blob | null>;
  /** The reader has moved to another post, or the feed had to pick one. */
  onCurrentChange: (id: string) => void;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const initialCount = (list: readonly Note[], currentId: string | null) =>
  Math.max(PAGE_SIZE, list.findIndex((n) => n.id === currentId) + 1);

const articleFor = (scroller: HTMLElement, id: string): HTMLElement | null =>
  Array.from(scroller.querySelectorAll<HTMLElement>("[data-post-id]")).find(
    (el) => el.dataset.postId === id,
  ) ?? null;

/**
 * The reading pane: posts one after another, newest first, loading as the
 * reader nears the end. The post across the reading band is the open one, and
 * the route follows it. Asking for a post (a rail click, a link, the back
 * button) scrolls to it, loading forward first if it is further down.
 *
 * It is keyed on what it is showing, so a new search or a return to the feed
 * starts from a clean scroll position and a fresh first page.
 */
export const NoteFeed = (props: NoteFeedProps) => {
  const searching = props.query !== null;
  const q = searching ? normalizeQuery(props.query ?? "") : "";
  return <Feed key={searching ? `search:${q}` : "posts"} {...props} />;
};

const Feed = ({
  list,
  query,
  currentId,
  scrollRequest,
  bookByNoteId,
  readAsset,
  onCurrentChange,
}: NoteFeedProps) => {
  const searching = query !== null;
  const q = searching ? normalizeQuery(query) : "";
  const hasObserver = typeof IntersectionObserver !== "undefined";

  const [loaded, setLoaded] = useState(() => initialCount(list, currentId));
  const [loading, setLoading] = useState(false);
  const shown = hasObserver ? Math.min(loaded, list.length) : list.length;
  const more = shown < list.length;
  const visible = useMemo(() => list.slice(0, shown), [list, shown]);

  const scrollerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  /** The post the feed believes is open. Set the moment it decides, so the
      route echoing it back is not mistaken for a request to scroll. */
  const shownIdRef = useRef<string | null>(
    list.some((n) => n.id === currentId) ? currentId : null,
  );
  const lockUntilRef = useRef(0);
  const pendingRef = useRef<{ id: string; smooth: boolean } | null>(null);
  const handledRequestRef = useRef(scrollRequest?.n ?? 0);
  const latestRef = useRef({ list, currentId, searching, onCurrentChange });

  useLayoutEffect(() => {
    latestRef.current = { list, currentId, searching, onCurrentChange };
  });

  const scrollToPost = (id: string, smooth: boolean): boolean => {
    const scroller = scrollerRef.current;
    const el = scroller && articleFor(scroller, id);
    if (!scroller || !el) return false;
    const top = Math.max(
      0,
      el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        SCROLL_OFFSET_PX,
    );
    // Already there: nothing moves, so there is nothing to wait out.
    if (Math.abs(top - scroller.scrollTop) < 1) return true;
    const animate =
      smooth &&
      !prefersReducedMotion() &&
      typeof scroller.scrollTo === "function";
    lockUntilRef.current =
      performance.now() + (animate ? SMOOTH_LOCK_MS : INSTANT_LOCK_MS);
    if (animate) scroller.scrollTo({ top, behavior: "smooth" });
    else scroller.scrollTop = top;
    return true;
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    if (pending && scrollToPost(pending.id, pending.smooth)) {
      pendingRef.current = null;
    }
  };

  const requestScroll = (id: string, smooth: boolean) => {
    const index = list.findIndex((n) => n.id === id);
    if (index < 0) return;
    shownIdRef.current = id;
    pendingRef.current = { id, smooth };
    if (index >= shown) setLoaded(index + 1);
    else flushPending();
  };

  // Once the posts a request was waiting for have been drawn.
  useLayoutEffect(() => {
    flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, list]);

  // Arriving: a search starts on its first result, the feed on the open post.
  useLayoutEffect(() => {
    const {
      list: posts,
      currentId: id,
      searching: isSearch,
    } = latestRef.current;
    if (isSearch) {
      const first = posts[0];
      shownIdRef.current = first?.id ?? null;
      if (first) latestRef.current.onCurrentChange(first.id);
    } else if (id) {
      requestScroll(id, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A rail click or link asked for a post.
  useEffect(() => {
    if (!scrollRequest || scrollRequest.n === handledRequestRef.current) return;
    handledRequestRef.current = scrollRequest.n;
    requestScroll(scrollRequest.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  // The route moved on its own (back, forward, a pasted address).
  useEffect(() => {
    if (!currentId || currentId === shownIdRef.current) return;
    if (!list.some((n) => n.id === currentId)) {
      // Not a post: a note inside a collection, or one that is gone. Falling
      // back to the first post keeps the address and the pane in agreement.
      if (!searching && list[0]) {
        shownIdRef.current = list[0].id;
        onCurrentChange(list[0].id);
      }
      return;
    }
    requestScroll(currentId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Scroll-spy.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!hasObserver || !scroller) return;
    const crossing = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.postId;
          if (!id) continue;
          if (entry.isIntersecting) crossing.add(id);
          else crossing.delete(id);
        }
        if (performance.now() < lockUntilRef.current) return;
        const current = shownIdRef.current;
        if (crossing.size === 0 || (current && crossing.has(current))) return;
        const next = latestRef.current.list.find((n) => crossing.has(n.id));
        if (!next) return;
        shownIdRef.current = next.id;
        latestRef.current.onCurrentChange(next.id);
      },
      { root: scroller, rootMargin: READING_BAND },
    );
    scroller
      .querySelectorAll("[data-post-id]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [hasObserver, visible]);

  // Loading more.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (!hasObserver || !more || !scroller || !sentinel) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        setLoading(true);
        timer = setTimeout(() => {
          setLoaded((n) => n + PAGE_SIZE);
          setLoading(false);
        }, LOAD_DELAY_MS);
      },
      { root: scroller, rootMargin: SENTINEL_MARGIN },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [hasObserver, more, shown]);

  useScrollFades(scrollerRef, [shown, q]);

  const label = searching ? COPY.feedSearchLabel : COPY.feedLabel;

  if (list.length === 0) {
    const empty = !searching
      ? COPY.feedEmpty
      : q
        ? COPY.feedNoResults
        : COPY.feedSearchPrompt;
    return (
      <section
        ref={scrollerRef}
        className="note-feed note-feed--empty"
        aria-label={label}
      >
        <p className="note-feed__empty">{empty}</p>
      </section>
    );
  }

  return (
    <section
      ref={scrollerRef}
      className="note-feed scroll-fades"
      aria-label={label}
      tabIndex={-1}
    >
      <div className="note-feed__inner">
        <h2 className="sr-only">{label}</h2>
        {visible.map((note) => (
          <NoteArticle
            key={note.id}
            note={note}
            book={bookByNoteId.get(note.id) ?? null}
            query={q}
            readAsset={readAsset}
          />
        ))}
        <div ref={sentinelRef} className="note-feed__sentinel" aria-hidden />
        <div className="note-feed__foot" role="status">
          {more ? (loading ? COPY.feedLoading : "") : COPY.feedEnd}
        </div>
      </div>
    </section>
  );
};
