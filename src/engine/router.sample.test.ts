import { describe, expect, it } from 'vitest';
import { createIndex, route } from './router';
import type { Note } from '../types';

/**
 * Gap #7 — AC 20: routing `#sample` returns notes whose `tags` include
 * "sample" even though NO note body contains the literal string "#sample".
 *
 * This guards the exact regression we've already fixed once: earlier logic
 * would only surface tag results if the tag appeared as a literal token in
 * the body. Provenance tags like "sample" are attached to notes without
 * ever appearing in the note text.
 */

const now = new Date('2026-01-01T00:00:00.000Z');
const iso = now.toISOString();

const mk = (id: string, title: string, body: string, tags: string[]): Note => ({
  id,
  title,
  body,
  tags,
  createdAt: iso,
  updatedAt: iso,
});

describe('router — Gap #7 / AC 20 #sample tag intent over provenance tags', () => {
  it('returns titles of all notes tagged "sample" when the query is "#sample" and no note body contains the literal string "#sample"', () => {
    const notes: Note[] = [
      mk('a', 'Postgres tuning', 'shared_buffers and work_mem tradeoffs.', [
        'postgres',
        'performance',
        'sample',
      ]),
      mk('b', '1:1 with Priya', 'Discussed career growth.', ['work', '1on1', 'sample']),
      mk('c', 'Kyoto trip', 'Fushimi Inari at dawn.', ['travel', 'kyoto', 'sample']),
      // A non-sample note that should NOT appear in the result.
      mk('d', 'Grocery list', 'milk, bread, eggs', ['personal']),
    ];

    // Assert the fixture premise: no note body contains "#sample" as a literal.
    for (const n of notes) {
      expect(n.body).not.toContain('#sample');
      expect(n.title).not.toContain('#sample');
    }

    const index = createIndex(notes);
    const answer = route('#sample', notes, index, now);

    expect(answer.trace.intent).toBe('tag');
    // The three sample notes' titles appear.
    expect(answer.text).toContain('Postgres tuning');
    expect(answer.text).toContain('1:1 with Priya');
    expect(answer.text).toContain('Kyoto trip');
    // And the non-sample note does NOT.
    expect(answer.text).not.toContain('Grocery list');
  });

  it('routes "#sample" to the tag intent, not to search, when no note body contains the literal "#sample"', () => {
    const notes: Note[] = [
      mk('a', 'Postgres tuning', 'shared_buffers tradeoffs.', ['sample']),
      mk('b', 'Trip notes', 'Fushimi Inari at dawn.', ['sample']),
    ];
    for (const n of notes) expect(n.body).not.toContain('#sample');

    const index = createIndex(notes);
    const answer = route('#sample', notes, index, now);

    // Explicit: intent must be 'tag'. A regression that fell through to
    // 'search' would return a passage or notFound copy, not a title list.
    expect(answer.trace.intent).toBe('tag');
    expect(answer.trace.reason).toBe('filtered notes by tag #sample');
  });
});
