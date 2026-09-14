import { describe, expect, it } from 'vitest';
import { route, createIndex } from './router';
import type { Note } from '../types';

const mkNote = (id: string, body: string, title = `Title ${id}`): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

describe('AC 11 — route surfaces at most five candidates in the reasoning trace', () => {
  it('caps trace.results at five even when the index has many candidates that all match', () => {
    // Ten notes, each with a paragraph containing the query term "postgres".
    // TF-IDF will produce a candidate per chunk; route must slice to 5.
    const notes: Note[] = [];
    for (let i = 0; i < 10; i += 1) {
      notes.push(mkNote(`n${i}`, `postgres query number ${i} with distinctive filler word ${i}`));
    }
    const idx = createIndex(notes);
    const a = route('postgres query', notes, idx);
    expect(a.trace.results.length).toBeLessThanOrEqual(5);
    expect(a.trace.results.length).toBeGreaterThan(0);
    // And they are ordered by descending score.
    for (let i = 1; i < a.trace.results.length; i += 1) {
      expect(a.trace.results[i - 1].score).toBeGreaterThanOrEqual(a.trace.results[i].score);
    }
  });
});
