import { describe, it, expect } from 'vitest';
import {
  buildSpines,
  packShelves,
  leanOffset,
  LEAN_DEGREES,
  type Spine,
} from './shelf';
import type { Book, Note } from '../types';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? 'n1',
  title: overrides.title ?? 'Untitled',
  body: overrides.body ?? '',
  tags: overrides.tags ?? [],
  createdAt: overrides.createdAt ?? '2014-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2014-01-01T00:00:00.000Z',
});

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  id: overrides.id ?? 'b1',
  title: overrides.title ?? 'A Book',
  chapterIds: overrides.chapterIds ?? [],
  createdAt: overrides.createdAt ?? '2014-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2014-01-01T00:00:00.000Z',
  ...overrides,
});

const makeSpine = (width: number, height = 160): Spine => ({
  kind: 'year',
  id: `s${width}-${height}`,
  label: 's',
  count: 1,
  width,
  height,
  ai: false,
  tone: 0,
});

describe('buildSpines', () => {
  it('binds the loose notes of a single year into one volume', () => {
    const notes = [
      makeNote({ id: 'a', createdAt: '2014-03-01T00:00:00.000Z' }),
      makeNote({ id: 'b', createdAt: '2014-09-01T00:00:00.000Z' }),
    ];
    const spines = buildSpines(notes, []);
    expect(spines).toHaveLength(1);
    expect(spines[0].kind).toBe('year');
    expect(spines[0].label).toBe('2014');
    expect(spines[0].count).toBe(2);
  });

  it('gives a year with no loose notes no volume at all', () => {
    const notes = [makeNote({ id: 'a', createdAt: '2024-01-01T00:00:00.000Z' })];
    const books = [makeBook({ id: 'poems', chapterIds: ['a'] })];
    const spines = buildSpines(notes, books);
    expect(spines.map((s) => s.kind)).toEqual(['book']);
    expect(spines.some((s) => s.label === '2024')).toBe(false);
  });

  it('takes book membership from the book rather than from note titles', () => {
    /* The chapter titles here look nothing alike, which is exactly why a title
       pattern cannot be trusted to find them. */
    const notes = [
      makeNote({ id: 'c1', title: 'Chapter One', createdAt: '2011-01-01T00:00:00.000Z' }),
      makeNote({ id: 'c2', title: 'the long way down', createdAt: '2011-02-01T00:00:00.000Z' }),
      makeNote({ id: 'c3', title: 'II.', createdAt: '2011-03-01T00:00:00.000Z' }),
      makeNote({ id: 'loose', title: 'a note', createdAt: '2011-04-01T00:00:00.000Z' }),
    ];
    const books = [makeBook({ id: 'sh', title: 'Shaena', chapterIds: ['c1', 'c2', 'c3'] })];
    const spines = buildSpines(notes, books);
    const book = spines.find((s) => s.kind === 'book');
    const year = spines.find((s) => s.kind === 'year');
    expect(book?.count).toBe(3);
    expect(year?.count).toBe(1);
  });

  it('orders the shelf chronologically, oldest first', () => {
    const notes = [
      makeNote({ id: 'old', createdAt: '2010-01-01T00:00:00.000Z' }),
      makeNote({ id: 'new', createdAt: '2025-01-01T00:00:00.000Z' }),
      makeNote({ id: 'mid', createdAt: '2016-01-01T00:00:00.000Z' }),
    ];
    expect(buildSpines(notes, []).map((s) => s.label)).toEqual(['2010', '2016', '2025']);
  });

  it('stands a book where its earliest chapter was written', () => {
    const notes = [
      makeNote({ id: 'y', createdAt: '2010-01-01T00:00:00.000Z' }),
      makeNote({ id: 'c', createdAt: '2011-06-01T00:00:00.000Z' }),
      makeNote({ id: 'z', createdAt: '2012-01-01T00:00:00.000Z' }),
    ];
    const books = [makeBook({ id: 'b', title: 'Mid', chapterIds: ['c'] })];
    expect(buildSpines(notes, books).map((s) => s.label)).toEqual(['2010', 'Mid', '2012']);
  });

  it('draws a thicker spine for a volume holding more notes', () => {
    const notes = [
      ...Array.from({ length: 40 }, (_, i) =>
        makeNote({ id: `big${i}`, createdAt: '2011-01-01T00:00:00.000Z' }),
      ),
      makeNote({ id: 'small', createdAt: '2019-01-01T00:00:00.000Z' }),
    ];
    const [big, small] = buildSpines(notes, []);
    expect(big.width).toBeGreaterThan(small.width);
  });

  it('keeps a single-note volume thick enough to still read as a book', () => {
    const notes = [
      ...Array.from({ length: 131 }, (_, i) =>
        makeNote({ id: `big${i}`, createdAt: '2024-01-01T00:00:00.000Z' }),
      ),
      makeNote({ id: 'lonely', createdAt: '2022-01-01T00:00:00.000Z' }),
    ];
    const lonely = buildSpines(notes, []).find((s) => s.label === '2022');
    expect(lonely?.width).toBeGreaterThanOrEqual(20);
  });

  it('marks a volume as machine-written only when every note in it is', () => {
    const notes = [
      makeNote({ id: 'a', tags: ['ai-generated'], createdAt: '2024-01-01T00:00:00.000Z' }),
      makeNote({ id: 'b', tags: ['ai-generated'], createdAt: '2024-02-01T00:00:00.000Z' }),
      makeNote({ id: 'c', tags: ['verses'], createdAt: '2025-01-01T00:00:00.000Z' }),
      makeNote({ id: 'd', tags: ['ai-generated'], createdAt: '2025-02-01T00:00:00.000Z' }),
    ];
    const spines = buildSpines(notes, []);
    expect(spines.find((s) => s.label === '2024')?.ai).toBe(true);
    expect(spines.find((s) => s.label === '2025')?.ai).toBe(false);
  });

  it('gives the same volume the same height and colour on every build', () => {
    const notes = [makeNote({ id: 'a', createdAt: '2014-01-01T00:00:00.000Z' })];
    const first = buildSpines(notes, [])[0];
    const second = buildSpines(notes, [])[0];
    expect({ h: first.height, t: first.tone }).toEqual({ h: second.height, t: second.tone });
  });

  it('falls back to a readable label for an untitled book', () => {
    const notes = [makeNote({ id: 'c' })];
    const books = [makeBook({ id: 'b', title: '   ', chapterIds: ['c'] })];
    expect(buildSpines(notes, books)[0].label).toBe('Untitled');
  });

  it('ignores chapter ids that point at notes which are no longer there', () => {
    const notes = [makeNote({ id: 'c' })];
    const books = [makeBook({ id: 'b', chapterIds: ['c', 'deleted'] })];
    expect(() => buildSpines(notes, books)).not.toThrow();
    expect(buildSpines(notes, books)[0].kind).toBe('book');
  });

  it('returns an empty shelf for an empty archive', () => {
    expect(buildSpines([], [])).toEqual([]);
  });
});

describe('packShelves', () => {
  it('wraps to a new shelf when the next book will not fit', () => {
    const shelves = packShelves([makeSpine(60), makeSpine(60), makeSpine(60)], 130);
    expect(shelves).toHaveLength(2);
    expect(shelves[0]).toHaveLength(2);
    expect(shelves[1]).toHaveLength(1);
  });

  it('never splits a single book across two shelves', () => {
    const shelves = packShelves([makeSpine(200)], 100);
    expect(shelves).toEqual([[expect.objectContaining({ width: 200 })]]);
  });

  it('counts the gap between books when deciding what fits', () => {
    /* Two 50px books plus one 2px gap is 102, which does not fit 101. */
    expect(packShelves([makeSpine(50), makeSpine(51)], 101, 2)).toHaveLength(2);
  });

  it('leaves the last shelf part empty rather than spreading books out', () => {
    const shelves = packShelves([makeSpine(40), makeSpine(40), makeSpine(40)], 90);
    expect(shelves[shelves.length - 1]).toHaveLength(1);
  });

  it('returns no shelves for no books', () => {
    expect(packShelves([], 400)).toEqual([]);
  });
});

describe('leanOffset', () => {
  it('leans the last book away from the gap beside it', () => {
    /* Negative degrees: the base slides into the gap and the top tips back
       against the neighbour. A book does not fall into the hole. */
    expect(LEAN_DEGREES).toBeLessThan(0);
  });

  it('only leans when the leftover gap is wide enough to notice', () => {
    const shelf = [makeSpine(40), makeSpine(40)];
    expect(leanOffset(shelf, 90)).toBeNull();
    expect(leanOffset(shelf, 200)).not.toBeNull();
  });

  it('slides the leaning book across by its own height times the lean', () => {
    const shelf = [makeSpine(40, 180), makeSpine(40, 180)];
    /* 180 * sin(10deg) = 31.3 */
    expect(leanOffset(shelf, 300)).toBe(31);
  });

  it('never leans a shelf holding a single book', () => {
    expect(leanOffset([makeSpine(40)], 400)).toBeNull();
  });
});
