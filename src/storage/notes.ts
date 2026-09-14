import type { Note } from '../types';

const STORAGE_KEY = 'glassbox.notes.v1';
const SEEDED_KEY = 'glassbox.seeded.v1';

/** The only module in the app permitted to touch localStorage. */

const isNote = (value: unknown): value is Note => {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.body === 'string' &&
    Array.isArray(n.tags) &&
    n.tags.every((t) => typeof t === 'string') &&
    typeof n.createdAt === 'string' &&
    typeof n.updatedAt === 'string'
  );
};

export const loadNotes = (): Note[] => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing and disabled-storage modes throw on access. An app that
    // cannot persist should still run, so fall back to an empty library.
    return [];
  }
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop malformed entries rather than throwing. A single corrupt record must
    // not cost the user every other note they have written.
    return parsed.filter(isNote);
  } catch {
    return [];
  }
};

export const saveNotes = (notes: Note[]): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
};

/**
 * First-run marker. An empty saved array means "the user deliberately deleted
 * everything", which is different from "the app has never run here". Only the
 * absence of this marker triggers sample seeding.
 */
export const hasSeeded = (): boolean => {
  try {
    return localStorage.getItem(SEEDED_KEY) !== null;
  } catch {
    return false;
  }
};

export const markSeeded = (): void => {
  try {
    localStorage.setItem(SEEDED_KEY, new Date().toISOString());
  } catch {
    // Non-fatal. Without persistence there is no "next run" to protect from.
  }
};

export const createId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Parses "#work #ideas" or "work, ideas" into a clean, deduped, lowercased list. */
export const parseTags = (input: string): string[] => {
  const seen = new Set<string>();
  for (const raw of input.split(/[,\s]+/)) {
    const tag = raw.replace(/^#+/, '').trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
};

export const newNote = (partial: Partial<Note> = {}): Note => {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? createId(),
    title: partial.title ?? '',
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
};
