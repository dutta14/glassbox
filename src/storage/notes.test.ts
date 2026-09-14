import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadNotes, saveNotes, createId, parseTags, newNote } from './notes';
import type { Note } from '../types';

const STORAGE_KEY = 'glassbox.notes.v1';

const validNote = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'a',
  title: overrides.title ?? 'Title',
  body: overrides.body ?? 'Body',
  tags: overrides.tags ?? ['work'],
  createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
});

describe('loadNotes', () => {
  it('returns an empty array when the key is absent', () => {
    expect(loadNotes()).toEqual([]);
  });

  it('returns an empty array when the stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadNotes()).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: [] }));
    expect(loadNotes()).toEqual([]);
  });

  it('returns an empty array when localStorage access throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });
    expect(loadNotes()).toEqual([]);
    spy.mockRestore();
  });

  it('filters out malformed entries while keeping valid siblings', () => {
    const good = validNote({ id: 'good' });
    const bad = { id: 5, title: 'missing fields' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([good, bad, null, 'string', good]));
    const loaded = loadNotes();
    expect(loaded).toHaveLength(2);
    expect(loaded.every((n) => n.id === 'good')).toBe(true);
  });

  it('drops entries with a non-string-element tags array', () => {
    const bad = { ...validNote(), tags: ['ok', 42] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([bad]));
    expect(loadNotes()).toEqual([]);
  });

  it('returns valid notes intact', () => {
    const notes = [validNote({ id: '1' }), validNote({ id: '2' })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    expect(loadNotes()).toEqual(notes);
  });
});

describe('saveNotes', () => {
  it('round-trips notes through localStorage', () => {
    const notes = [validNote({ id: '1' }), validNote({ id: '2', title: 'Second' })];
    expect(saveNotes(notes)).toBe(true);
    expect(loadNotes()).toEqual(notes);
  });

  it('overwrites previously-stored notes', () => {
    saveNotes([validNote({ id: '1' })]);
    saveNotes([validNote({ id: '2' })]);
    const loaded = loadNotes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('2');
  });

  it('returns false when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveNotes([validNote()])).toBe(false);
    spy.mockRestore();
  });
});

describe('createId', () => {
  it('produces distinct values across successive calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId()));
    expect(ids.size).toBe(200);
  });

  it('produces non-empty string ids', () => {
    const id = createId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('parseTags', () => {
  it('parses space-separated hash-prefixed tags', () => {
    expect(parseTags('#work #ideas')).toEqual(['work', 'ideas']);
  });

  it('parses comma-separated tags without hashes', () => {
    expect(parseTags('work, ideas')).toEqual(['work', 'ideas']);
  });

  it('lowercases tags', () => {
    expect(parseTags('#Work #IDEAS')).toEqual(['work', 'ideas']);
  });

  it('dedupes tags, preserving first occurrence order', () => {
    expect(parseTags('#work #Work work')).toEqual(['work']);
  });

  it('strips leading # characters even when repeated', () => {
    expect(parseTags('##work')).toEqual(['work']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('   ')).toEqual([]);
  });

  it('handles mixed comma and whitespace separators', () => {
    expect(parseTags('#a, #b   #c,#d')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('newNote', () => {
  it('applies default empty title and body when no overrides are given', () => {
    const n = newNote();
    expect(n.title).toBe('');
    expect(n.body).toBe('');
    expect(n.tags).toEqual([]);
    expect(typeof n.id).toBe('string');
    expect(n.id.length).toBeGreaterThan(0);
    expect(n.createdAt).toBe(n.updatedAt);
  });

  it('sets createdAt and updatedAt to an ISO string parseable as a valid date', () => {
    const n = newNote();
    expect(Number.isNaN(Date.parse(n.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(n.updatedAt))).toBe(false);
  });

  it('respects overrides', () => {
    const n = newNote({
      id: 'fixed-id',
      title: 'T',
      body: 'B',
      tags: ['x'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
    expect(n).toEqual({
      id: 'fixed-id',
      title: 'T',
      body: 'B',
      tags: ['x'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
  });

  it('produces distinct ids across successive calls when no id is provided', () => {
    const a = newNote();
    const b = newNote();
    expect(a.id).not.toBe(b.id);
  });
});
