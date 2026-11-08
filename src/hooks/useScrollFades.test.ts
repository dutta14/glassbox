import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrollFades } from "./useScrollFades";

interface Metrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * jsdom reports 0 for every layout metric, so the element gets its scroll box
 * defined by hand. Everything the hook reads is covered by these three.
 */
const makeElement = ({ scrollTop, scrollHeight, clientHeight }: Metrics) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  let top = scrollTop;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (next: number) => {
      top = next;
    },
    configurable: true,
  });
  document.body.append(el);
  return el;
};

const renderFades = (metrics: Metrics, deps: readonly unknown[] = []) => {
  const el = makeElement(metrics);
  const ref = { current: el as HTMLElement | null };
  const view = renderHook(
    ({ d }: { d: readonly unknown[] }) => {
      useScrollFades(ref, d);
    },
    { initialProps: { d: deps } },
  );
  return { el, view };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useScrollFades", () => {
  it("marks neither edge when the content fits inside the container", () => {
    const { el } = renderFades({
      scrollTop: 0,
      scrollHeight: 200,
      clientHeight: 200,
    });

    expect(el.dataset.fadeTop).toBe("false");
    expect(el.dataset.fadeBottom).toBe("false");
  });

  it("marks only the bottom edge when resting at the top of overflowing content", () => {
    const { el } = renderFades({
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300,
    });

    expect(el.dataset.fadeTop).toBe("false");
    expect(el.dataset.fadeBottom).toBe("true");
  });

  it("marks both edges when scrolled to the middle of overflowing content", () => {
    const { el } = renderFades({
      scrollTop: 300,
      scrollHeight: 900,
      clientHeight: 300,
    });

    expect(el.dataset.fadeTop).toBe("true");
    expect(el.dataset.fadeBottom).toBe("true");
  });

  it("marks only the top edge when scrolled to the very bottom", () => {
    const { el } = renderFades({
      scrollTop: 600,
      scrollHeight: 900,
      clientHeight: 300,
    });

    expect(el.dataset.fadeTop).toBe("true");
    expect(el.dataset.fadeBottom).toBe("false");
  });

  it("treats a sub-pixel gap at the bottom as having reached the bottom", () => {
    const { el } = renderFades({
      scrollTop: 599.4,
      scrollHeight: 900,
      clientHeight: 300,
    });

    expect(el.dataset.fadeBottom).toBe("false");
  });

  it("recomputes both edges when the container is scrolled", () => {
    const { el } = renderFades({
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300,
    });
    expect(el.dataset.fadeTop).toBe("false");

    el.scrollTop = 450;
    el.dispatchEvent(new Event("scroll"));

    expect(el.dataset.fadeTop).toBe("true");
    expect(el.dataset.fadeBottom).toBe("true");
  });

  it("recomputes when typing grows the content without changing the DOM", () => {
    const { el } = renderFades({
      scrollTop: 0,
      scrollHeight: 200,
      clientHeight: 200,
    });
    expect(el.dataset.fadeBottom).toBe("false");

    Object.defineProperty(el, "scrollHeight", {
      value: 800,
      configurable: true,
    });
    el.dispatchEvent(new Event("input"));

    expect(el.dataset.fadeBottom).toBe("true");
  });

  it("recomputes when a dependency changes, such as a new message arriving", () => {
    const { el, view } = renderFades(
      { scrollTop: 0, scrollHeight: 200, clientHeight: 200 },
      [0],
    );
    expect(el.dataset.fadeBottom).toBe("false");

    Object.defineProperty(el, "scrollHeight", {
      value: 800,
      configurable: true,
    });
    view.rerender({ d: [1] });

    expect(el.dataset.fadeBottom).toBe("true");
  });

  it("stops listening once the component unmounts", () => {
    const el = makeElement({
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300,
    });
    const remove = vi.spyOn(el, "removeEventListener");
    const ref = { current: el as HTMLElement | null };
    const { unmount } = renderHook(() => {
      useScrollFades(ref);
    });

    unmount();

    const events = remove.mock.calls.map(([name]) => name);
    expect(events).toContain("scroll");
    expect(events).toContain("input");
  });

  it("does nothing when the ref was never attached to an element", () => {
    const ref = { current: null as HTMLElement | null };

    expect(() => renderHook(() => useScrollFades(ref))).not.toThrow();
  });
});
