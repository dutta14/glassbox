import { describe, it, expect } from 'vitest';
import { chunkNote, buildIndex, search } from './tfidf';
import { tokenize } from './tokenize';
import type { Note } from '../types';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'n1',
  title: overrides.title ?? 'Untitled',
  body: overrides.body ?? '',
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

describe('chunkNote', () => {
  it('splits a note body on blank lines into separate chunks', () => {
    const note = makeNote({ title: 'T', body: 'first paragraph.\n\nsecond paragraph.\n\nthird one.' });
    const chunks = chunkNote(note);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.text)).toEqual(['first paragraph.', 'second paragraph.', 'third one.']);
  });

  it('assigns ascending positions from zero', () => {
    const chunks = chunkNote(makeNote({ body: 'a\n\nb\n\nc' }));
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('collapses runs of spaces and tabs inside a paragraph', () => {
    const chunks = chunkNote(makeNote({ body: 'a   b\t\tc' }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('a b c');
  });

  it('falls back to the note title when the body is empty', () => {
    const chunks = chunkNote(makeNote({ title: 'Only Title', body: '' }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Only Title');
  });

  it('falls back to the title when the body is only whitespace', () => {
    const chunks = chunkNote(makeNote({ title: 'Only Title', body: '   \n\n   \t  ' }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Only Title');
  });

  it('carries noteId and noteTitle onto every chunk', () => {
    const chunks = chunkNote(makeNote({ id: 'abc', title: 'MyNote', body: 'para one\n\npara two' }));
    for (const c of chunks) {
      expect(c.noteId).toBe('abc');
      expect(c.noteTitle).toBe('MyNote');
    }
  });
});

describe('buildIndex', () => {
  it('returns an empty index when there are no notes', () => {
    const index = buildIndex([]);
    expect(index.size).toBe(0);
    expect(index.chunks).toEqual([]);
    expect(index.vectors).toEqual([]);
    expect(index.idf.size).toBe(0);
  });

  it('handles a single note with a single paragraph', () => {
    const index = buildIndex([makeNote({ body: 'postgres indexes speed up lookups' })]);
    expect(index.size).toBe(1);
    expect(index.chunks).toHaveLength(1);
    expect(index.vectors).toHaveLength(1);
    expect(index.idf.size).toBeGreaterThan(0);
  });

  it('computes smoothed IDF so a term present in every chunk still scores above zero', () => {
    // Derive the key from the same tokenizer the index uses, so this test
    // does not silently break (or worse, silently pass) if the stemmer
    // changes. The lookup key must be whatever "postgres" tokenises to.
    const [key] = tokenize('postgres');
    expect(key).toBeDefined();
    const index = buildIndex([
      makeNote({ id: '1', body: 'postgres' }),
      makeNote({ id: '2', body: 'postgres' }),
    ]);
    expect(index.idf.has(key)).toBe(true);
    const idf = index.idf.get(key)!;
    expect(idf).toBeGreaterThan(0);
  });
});

describe('search', () => {
  it('returns an empty array when the index is empty', () => {
    const index = buildIndex([]);
    expect(search(index, 'anything')).toEqual([]);
  });

  it('returns an empty array when the query is only stopwords', () => {
    const index = buildIndex([makeNote({ body: 'postgres indexing tips' })]);
    expect(search(index, 'the and of it')).toEqual([]);
  });

  it('returns an empty array when the query has no content words at all', () => {
    const index = buildIndex([makeNote({ body: 'postgres' })]);
    expect(search(index, '   ')).toEqual([]);
  });

  it('orders results by descending score', () => {
    const index = buildIndex([
      makeNote({ id: '1', title: 'A', body: 'postgres postgres postgres tuning' }),
      makeNote({ id: '2', title: 'B', body: 'postgres brief mention' }),
      makeNote({ id: '3', title: 'C', body: 'nothing about databases here' }),
    ]);
    const results = search(index, 'postgres tuning');
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    expect(results[0].noteId).toBe('1');
  });

  it('computes coverage as the fraction of distinct query terms that matched', () => {
    // Derive expected matched terms from the tokenizer so this test tracks
    // stemmer changes without silent drift. Query has 3 distinct tokens.
    const queryTokens = tokenize('postgres tuning forecast');
    expect(queryTokens).toHaveLength(3);
    const [postgres, tuning] = tokenize('postgres tuning');
    const index = buildIndex([makeNote({ body: 'postgres tuning notes here' })]);
    const [top] = search(index, 'postgres tuning forecast');
    expect(top).toBeDefined();
    expect(top.matchedTerms.sort()).toEqual([postgres, tuning].sort());
    expect(top.coverage).toBeCloseTo(2 / 3, 5);
  });

  it('reports full coverage when every distinct query term matches', () => {
    const index = buildIndex([makeNote({ body: 'postgres tuning notes' })]);
    const [top] = search(index, 'postgres tuning');
    expect(top.coverage).toBeCloseTo(1, 5);
  });

  it('respects topK by returning at most that many results', () => {
    const notes: Note[] = Array.from({ length: 8 }, (_, i) =>
      makeNote({ id: `n${i}`, title: `T${i}`, body: 'postgres notes here' })
    );
    const index = buildIndex(notes);
    const results = search(index, 'postgres', 3);
    expect(results).toHaveLength(3);
  });

  it('retrieves a chunk that matches only via its note title', () => {
    // Body has no "postgres" token. Only the folded title supplies the match.
    const index = buildIndex([
      makeNote({ id: '1', title: 'Postgres indexing', body: 'lookups run faster with careful column choice' }),
      makeNote({ id: '2', title: 'Baking', body: 'bread rises when the yeast is alive' }),
    ]);
    const results = search(index, 'postgres');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].noteId).toBe('1');
  });

  it('does not include the folded title in the returned chunk.text (kept clean for display)', () => {
    const index = buildIndex([
      makeNote({ title: 'Postgres indexing', body: 'lookups run faster with careful column choice' }),
    ]);
    const [top] = search(index, 'postgres column');
    expect(top.text).toBe('lookups run faster with careful column choice');
    expect(top.text).not.toContain('Postgres indexing');
  });

  it('excludes chunks that share no term with the query', () => {
    const index = buildIndex([
      makeNote({ id: '1', body: 'postgres tuning' }),
      makeNote({ id: '2', body: 'bread and butter' }),
    ]);
    const results = search(index, 'postgres');
    expect(results.map((r) => r.noteId)).toEqual(['1']);
  });
});
