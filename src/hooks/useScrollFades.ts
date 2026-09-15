import { useCallback, useEffect, type RefObject } from "react";

/** Scroll offsets are rarely whole numbers, so the ends need a little slack. */
const EDGE_TOLERANCE = 1;

/**
 * Marks a scroll container with data-fade-top and data-fade-bottom according to
 * whether content is currently cut off in that direction. The paired CSS in
 * tokens.css turns those into edge fades.
 *
 * The attributes are written straight to the DOM rather than held in state,
 * because this runs on every scroll event and none of it needs a React render.
 *
 * `deps` covers content the hook cannot observe on its own, such as a new chat
 * message or switching to a different note.
 */
export const useScrollFades = (
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = [],
): void => {
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const overflows = max > EDGE_TOLERANCE;
    el.dataset.fadeTop = String(overflows && el.scrollTop > EDGE_TOLERANCE);
    el.dataset.fadeBottom = String(
      overflows && el.scrollTop < max - EDGE_TOLERANCE,
    );
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();

    el.addEventListener("scroll", update, { passive: true });
    // Typing changes a textarea's scroll height without touching the DOM, so
    // no observer would see it.
    el.addEventListener("input", update);

    // Absent in jsdom, and the tests drive updates directly instead.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    // The container's own box often stays put while its contents grow.
    const content = el.firstElementChild;
    if (content) observer?.observe(content);

    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("input", update);
      observer?.disconnect();
    };
  }, [ref, update]);

  useEffect(() => {
    update();
  }, [update, ...deps]);
};
