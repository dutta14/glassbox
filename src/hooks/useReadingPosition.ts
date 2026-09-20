import { useCallback, useRef } from 'react';

const READING_POSITION_KEY = 'glassbox.reading.v1';

type ReadingPositions = Record<string, string>;

export interface ReadingPositionApi {
  /** The chapter id last read in this book, or null if none recorded. */
  positionFor: (bookId: string) => string | null;
  /** Records the chapter currently being read. */
  remember: (bookId: string, chapterId: string) => void;
  /** Drops the record for a book, e.g. when the book is deleted. */
  forget: (bookId: string) => void;
}

const isReadingPositions = (value: unknown): value is ReadingPositions => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((chapterId) => typeof chapterId === 'string');
};

const readPositions = (): ReadingPositions => {
  try {
    const raw = localStorage.getItem(READING_POSITION_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return isReadingPositions(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writePositions = (positions: ReadingPositions): void => {
  try {
    localStorage.setItem(READING_POSITION_KEY, JSON.stringify(positions));
  } catch {
    // Non-fatal. Losing a scroll restore point is better than failing to open the reader.
  }
};

export const useReadingPosition = (): ReadingPositionApi => {
  /* Reading position is per-device UI state, not user content. It deliberately
     stays in localStorage and never enters the File System Access folder where
     the user's notes and books live. */
  const positionsRef = useRef<ReadingPositions | null>(null);

  const positions = useCallback((): ReadingPositions => {
    if (positionsRef.current === null) positionsRef.current = readPositions();
    return positionsRef.current;
  }, []);

  const positionFor = useCallback(
    (bookId: string): string | null => positions()[bookId] ?? null,
    [positions]
  );

  const remember = useCallback(
    (bookId: string, chapterId: string): void => {
      /* Scroll updates can fire frequently while a long book is visible. Keeping
         the map in a ref preserves callback stability and avoids re-rendering
         the reading column for every chapter boundary crossed. */
      const next = { ...positions(), [bookId]: chapterId };
      positionsRef.current = next;
      writePositions(next);
    },
    [positions]
  );

  const forget = useCallback(
    (bookId: string): void => {
      const current = positions();
      const next = { ...current };
      delete next[bookId];
      positionsRef.current = next;
      writePositions(next);
    },
    [positions]
  );

  return { positionFor, remember, forget };
};
