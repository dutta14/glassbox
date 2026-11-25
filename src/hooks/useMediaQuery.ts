import { useSyncExternalStore } from "react";

/** False where matchMedia does not exist (jsdom), so a query-driven layout
    falls back to the wide one. */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false,
  );
