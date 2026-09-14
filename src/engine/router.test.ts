import { describe, it, expect } from 'vitest';
import {
  classify,
  route,
  createIndex,
  tierFor,
  passesGate,
  parseRecentWindow,
  GATE,
  TIERS,
} from './router';
import { COPY } from './copy';
import type { Note } from '../types';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'n1',
  title: overrides.title ?? '',
  body: overrides.body ?? '',
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

describe('classify', () => {
  it('classifies greetings', () => {
    expect(classify('hi')).toBe('greeting');
    expect(classify('Hello!')).toBe('greeting');
    expect(classify('good morning')).toBe('greeting');
    expect(classify('hey')).toBe('greeting');
  });

  it('classifies help requests', () => {
    expect(classify('help')).toBe('help');
    expect(classify('what can you do')).toBe('help');
    expect(classify('how do I use this')).toBe('help');
  });

  it('classifies count queries', () => {
    expect(classify('how many notes do I have')).toBe('count');
    expect(classify('count of notes')).toBe('count');
    expect(classify('number of entries')).toBe('count');
  });

  it('classifies tag queries', () => {
    expect(classify('show me #work notes')).toBe('tag');
    expect(classify('#ideas')).toBe('tag');
  });

  it('classifies short recent queries', () => {
    expect(classify('notes today')).toBe('recent');
    expect(classify('what did I write yesterday')).toBe('recent');
    expect(classify('this week')).toBe('recent');
  });

  it('routes a long query with a recent word to search, not recent', () => {
    expect(
      classify('what did I write recently about postgres indexing performance databases tuning')
    ).toBe('search');
  });

  it('classifies content queries as search', () => {
    expect(classify('postgres indexing')).toBe('search');
    expect(classify('why is my bread flat')).toBe('search');
  });

  it('classifies empty and all-stopword queries as unknown', () => {
    expect(classify('')).toBe('unknown');
    expect(classify('   ')).toBe('unknown');
    expect(classify('the and or of')).toBe('unknown');
  });
});

describe('parseRecentWindow', () => {
  const now = new Date('2024-06-15T12:00:00.000Z');

  it('recognises "today" as the start of the current day', () => {
    const w = parseRecentWindow('anything today', now);
    expect(w).not.toBeNull();
    expect(w!.label).toBe('today');
    expect(w!.since.getHours()).toBe(0);
    expect(w!.since.getMinutes()).toBe(0);
  });

  it('recognises "yesterday" as one day before start of today', () => {
    const w = parseRecentWindow('written yesterday', now);
    expect(w!.label).toBe('yesterday');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    expect(today - w!.since.getTime()).toBe(86_400_000);
  });

  it('recognises "this week"', () => {
    const w = parseRecentWindow('written this week', now);
    expect(w!.label).toBe('this week');
  });

  it('recognises "last week"', () => {
    const w = parseRecentWindow('written last week', now);
    expect(w!.label).toBe('last week');
  });

  it('recognises "this month"', () => {
    const w = parseRecentWindow('written this month', now);
    expect(w!.label).toBe('this month');
  });

  it('recognises "recently" and "lately"', () => {
    expect(parseRecentWindow('written recently', now)!.label).toBe('recently');
    expect(parseRecentWindow('written lately', now)!.label).toBe('recently');
  });

  it('returns null for queries with no time expression', () => {
    expect(parseRecentWindow('postgres indexing', now)).toBeNull();
    expect(parseRecentWindow('', now)).toBeNull();
  });

  it('checks "last week" before "this week" so both patterns pick the right label', () => {
    // The regex for "this week" would also match inside "last week" if evaluated first.
    // This asserts the order guarantee.
    expect(parseRecentWindow('last week', now)!.label).toBe('last week');
  });
});

describe('tierFor and passesGate', () => {
  it('rates a strong match as high confidence', () => {
    expect(tierFor({ score: 0.5, coverage: 0.8 })).toBe('high');
  });

  it('rates a medium match as medium confidence', () => {
    expect(tierFor({ score: 0.3, coverage: 0.6 })).toBe('medium');
  });

  it('falls through to low when either score or coverage is insufficient for medium', () => {
    expect(tierFor({ score: 0.9, coverage: 0.3 })).toBe('low');
    expect(tierFor({ score: 0.1, coverage: 1.0 })).toBe('low');
  });

  it('passesGate accepts a chunk that meets both thresholds', () => {
    expect(passesGate({ score: GATE.minScore, coverage: GATE.minCoverage })).toBe(true);
  });

  it('passesGate rejects a chunk below the score threshold even at full coverage', () => {
    expect(passesGate({ score: GATE.minScore - 0.01, coverage: 1 })).toBe(false);
  });

  it('passesGate rejects a chunk below the coverage threshold even at high score', () => {
    expect(passesGate({ score: 0.9, coverage: GATE.minCoverage - 0.01 })).toBe(false);
  });

  it('has a coverage floor of 0.5 and a score floor of 0.15', () => {
    expect(GATE.minCoverage).toBe(0.5);
    expect(GATE.minScore).toBe(0.15);
    expect(TIERS.high.minScore).toBe(0.4);
    expect(TIERS.high.minCoverage).toBe(0.67);
    expect(TIERS.medium.minScore).toBe(0.25);
    expect(TIERS.medium.minCoverage).toBe(0.5);
  });
});

describe('route: fixed-string intents', () => {
  it('answers a greeting with the greeting copy and no sources', () => {
    const notes: Note[] = [];
    const idx = createIndex(notes);
    const a = route('hi', notes, idx);
    expect(a.text).toBe(COPY.greeting);
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('greeting');
    expect(a.trace.reason).toBeTruthy();
  });

  it('answers help with the help copy and no sources', () => {
    const notes: Note[] = [];
    const idx = createIndex(notes);
    const a = route('help', notes, idx);
    expect(a.text).toBe(COPY.help);
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('help');
  });

  it('answers unknown queries with unknown copy and populates trace with query terms', () => {
    const notes: Note[] = [];
    const idx = createIndex(notes);
    const a = route('the and or of', notes, idx);
    expect(a.text).toBe(COPY.unknown);
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('unknown');
    expect(a.trace.queryTerms).toEqual([]);
    expect(a.trace.reason).toContain('common words');
  });
});

describe('route: count intent', () => {
  it('uses the singular copy when the library has exactly one note', () => {
    const notes = [makeNote({ id: '1', body: 'hello' })];
    const a = route('how many notes do I have', notes, createIndex(notes));
    expect(a.text).toBe(COPY.countOne);
    expect(a.text).toContain('1 note');
    expect(a.text).not.toContain('1 notes');
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('count');
  });

  it('uses the plural copy for zero notes', () => {
    const notes: Note[] = [];
    const a = route('how many notes', notes, createIndex(notes));
    expect(a.text).toBe(COPY.count(0));
    expect(a.text).toContain('0 notes');
    expect(a.sources).toEqual([]);
  });

  it('uses the plural copy for many notes', () => {
    const notes: Note[] = Array.from({ length: 7 }, (_, i) => makeNote({ id: String(i) }));
    const a = route('how many notes', notes, createIndex(notes));
    expect(a.text).toBe(COPY.count(7));
    expect(a.text).toContain('7 notes');
  });
});

describe('route: tag intent', () => {
  it('lists titles of notes carrying the tag', () => {
    const notes = [
      makeNote({ id: '1', title: 'Alpha', tags: ['work'] }),
      makeNote({ id: '2', title: 'Beta', tags: ['home'] }),
      makeNote({ id: '3', title: 'Gamma', tags: ['work'] }),
    ];
    const a = route('show me #work', notes, createIndex(notes));
    expect(a.text).toContain('Alpha');
    expect(a.text).toContain('Gamma');
    expect(a.text).not.toContain('Beta');
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('tag');
  });

  it('matches tags case-insensitively', () => {
    const notes = [makeNote({ id: '1', title: 'Alpha', tags: ['work'] })];
    const a = route('show me #Work', notes, createIndex(notes));
    expect(a.text).toContain('Alpha');
  });

  it('returns the empty-tag copy when nothing matches', () => {
    const notes = [makeNote({ id: '1', title: 'Alpha', tags: ['home'] })];
    const a = route('show me #work', notes, createIndex(notes));
    expect(a.text).toBe(COPY.tagEmpty('work'));
    expect(a.sources).toEqual([]);
  });
});

describe('route: recent intent', () => {
  const now = new Date('2024-06-15T12:00:00.000Z');

  it('lists notes updated inside the requested window, newest first', () => {
    const notes = [
      makeNote({ id: '1', title: 'Old', updatedAt: '2024-01-01T00:00:00.000Z' }),
      makeNote({ id: '2', title: 'Fresh', updatedAt: '2024-06-15T09:00:00.000Z' }),
      makeNote({ id: '3', title: 'Newest', updatedAt: '2024-06-15T11:00:00.000Z' }),
    ];
    const a = route('notes today', notes, createIndex(notes), now);
    expect(a.text).toContain('Fresh');
    expect(a.text).toContain('Newest');
    expect(a.text).not.toContain('Old');
    expect(a.text.indexOf('Newest')).toBeLessThan(a.text.indexOf('Fresh'));
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('recent');
  });

  it('returns the empty-window copy when no notes fall in the window', () => {
    const notes = [makeNote({ id: '1', updatedAt: '2020-01-01T00:00:00.000Z' })];
    const a = route('notes today', notes, createIndex(notes), now);
    expect(a.text).toBe(COPY.recentEmpty);
    expect(a.sources).toEqual([]);
  });

  it('uses "Untitled" for notes with a blank title', () => {
    const notes = [makeNote({ id: '1', title: '', updatedAt: '2024-06-15T09:00:00.000Z' })];
    const a = route('notes today', notes, createIndex(notes), now);
    expect(a.text).toContain(COPY.untitled);
  });
});

describe('route: search intent', () => {
  it('returns a passage verbatim, with no added prose, when the gate passes', () => {
    const passage = 'bread comes out flat when the starter is under-proofed';
    const notes = [
      makeNote({ id: '1', title: 'Sourdough', body: passage }),
      makeNote({ id: '2', title: 'Other', body: 'nothing to do with baking here' }),
    ];
    const a = route('why is my bread flat', notes, createIndex(notes));
    // The whole promise of the product: the answer IS the passage.
    expect(a.text).toBe(passage);
    expect(a.sources.length).toBeGreaterThan(0);
    expect(a.sources[0].text).toBe(passage);
    expect(a.trace.intent).toBe('search');
    expect(a.trace.results.length).toBeGreaterThan(0);
    expect(a.trace.candidatesConsidered).toBeGreaterThan(0);
  });

  it('refuses when no passage shares any content word with the query', () => {
    const notes = [makeNote({ id: '1', body: 'bread rises with active yeast' })];
    const a = route('quarterly revenue forecast', notes, createIndex(notes));
    expect(a.text).toBe(COPY.notFound);
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('search');
    expect(a.trace.reason).toContain('no passage');
  });

  it('refuses a high-scoring but low-coverage match, citing the coverage shortfall', () => {
    // The critical two-factor gate test. Note A repeats "revenue" so a query
    // containing "revenue" will cosine-score highly against it. But the query
    // has three distinct content words, only one of which appears in the note,
    // so coverage is 1/3 and the gate must reject. If someone removed the
    // coverage requirement, this test would fail because a false positive
    // ("revenue revenue revenue") would be quoted as the answer to a question
    // about a forecast the user never wrote about.
    const notes = [
      makeNote({ id: '1', title: 'Revenue log', body: 'revenue revenue revenue revenue' }),
      makeNote({ id: '2', title: 'Unrelated', body: 'bread and butter' }),
    ];
    const index = createIndex(notes);
    const a = route('quarterly revenue forecast', notes, index, new Date('2024-06-15T12:00:00Z'));

    expect(a.text).toBe(COPY.notFound);
    expect(a.sources).toEqual([]);
    expect(a.trace.intent).toBe('search');
    expect(a.trace.results.length).toBeGreaterThan(0);
    const top = a.trace.results[0];
    // Prove the refusal is not because the score was low: it was high.
    expect(top.score).toBeGreaterThanOrEqual(GATE.minScore);
    // And prove the refusal reason names coverage as the reason, so a future
    // engineer who removes the coverage gate must break this assertion.
    expect(top.coverage).toBeLessThan(GATE.minCoverage);
    expect(a.trace.reason).toMatch(/\d+% of your words/);
    expect(a.trace.reason).toContain('50%');
  });

  it('populates trace even on refusals', () => {
    const notes = [makeNote({ id: '1', body: 'bread rises with active yeast' })];
    const a = route('quarterly revenue forecast', notes, createIndex(notes));
    expect(a.trace.queryTerms.length).toBeGreaterThan(0);
    expect(a.trace.candidatesConsidered).toBeGreaterThan(0);
    expect(a.trace.reason).toBeTruthy();
    expect(a.trace.intent).toBe('search');
  });

  it('returns a title-only match when the body has no direct term but the title does', () => {
    const notes = [
      makeNote({
        id: '1',
        title: 'Postgres indexing tips',
        body: 'query planner scans fewer rows when the right column is chosen carefully often',
      }),
      makeNote({ id: '2', title: 'Baking', body: 'bread flat sometimes when yeast is dead here' }),
    ];
    const a = route('postgres', notes, createIndex(notes));
    // Only one query term, so coverage is 1.0, which passes the coverage gate,
    // and the title fold means the postgres-titled note scores above zero.
    expect(a.sources.length).toBeGreaterThan(0);
    expect(a.sources[0].noteId).toBe('1');
    // And the returned passage is the body chunk, not the title.
    expect(a.text).not.toContain('Postgres indexing tips');
  });

  it('never adds prose around the quoted passage', () => {
    const passage = 'exactly this text and nothing else';
    const notes = [makeNote({ id: '1', title: 'Exact', body: passage })];
    const a = route('exactly this text', notes, createIndex(notes));
    expect(a.text).toBe(passage);
    // Strict equality with the source chunk text: this is the no-hallucination guarantee.
    expect(a.text).toBe(a.sources[0].text);
  });

  it('sets confidence in the trace to the top result score on a hit', () => {
    const notes = [makeNote({ id: '1', body: 'postgres indexing tips' })];
    const a = route('postgres indexing', notes, createIndex(notes));
    expect(a.trace.confidence).toBeGreaterThan(0);
    expect(a.trace.confidence).toBe(a.sources[0]?.score);
  });
});
