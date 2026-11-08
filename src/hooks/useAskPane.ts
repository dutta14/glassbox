import { useCallback, useEffect, useState } from "react";

/**
 * Whether the Ask pane is open, and how wide it is.
 *
 * Ask is an accessory to the notes app rather than a peer of it, so the pane
 * is not a route. Nothing about it belongs in the address bar: a question is
 * something you do while reading, not somewhere you go. That also means its
 * state has to be remembered somewhere, or every reload would slam it shut on
 * someone mid-conversation.
 *
 * Width is remembered for the same reason a window size is. Someone who drags
 * the pane wide to read a long passage means it, and should not have to do it
 * again tomorrow.
 */

const OPEN_KEY = "glassbox.ask.open.v1";
const WIDTH_KEY = "glassbox.ask.width.v1";

/** Wide enough for a passage to breathe, narrow enough to leave the note readable. */
export const DEFAULT_WIDTH = 400;
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 720;

/**
 * Below this the history drawer stops being a drawer. At 400px a 224px drawer
 * covers well over half the pane, which reads as a broken full-screen swap
 * rather than something sliding over, so under this width it becomes an
 * honest full-pane view with a way back.
 */
export const DRAWER_SWAP_WIDTH = 480;

export const clampWidth = (width: number): number =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === "true";
  } catch {
    return false;
  }
};

/**
 * A stored width outside the allowed range, or not a number at all, falls back
 * to the default rather than being clamped into something the user never chose.
 * Hand-edited or corrupt storage should look like a fresh install, not like a
 * setting they cannot explain.
 */
const readWidth = (): number => {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (raw === null) return DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
    if (parsed < MIN_WIDTH || parsed > MAX_WIDTH) return DEFAULT_WIDTH;
    return Math.round(parsed);
  } catch {
    return DEFAULT_WIDTH;
  }
};

export interface AskPaneState {
  open: boolean;
  width: number;
  openPane: () => void;
  closePane: () => void;
  setWidth: (width: number) => void;
}

export const useAskPane = (): AskPaneState => {
  const [open, setOpen] = useState<boolean>(readOpen);
  const [width, setWidthState] = useState<number>(readWidth);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      /* A full or blocked store costs the memory of the pane, nothing more. */
    }
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* As above. The pane still works at this width for this session. */
    }
  }, [width]);

  const openPane = useCallback(() => setOpen(true), []);
  const closePane = useCallback(() => setOpen(false), []);
  const setWidth = useCallback(
    (next: number) => setWidthState(clampWidth(next)),
    [],
  );

  return { open, width, openPane, closePane, setWidth };
};
