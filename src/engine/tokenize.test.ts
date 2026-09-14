import { describe, it, expect } from 'vitest';
import { tokenize, stem, displayTerms, isStopword } from './tokenize';

describe('isStopword', () => {
  it('recognises common English stopwords', () => {
    expect(isStopword('the')).toBe(true);
    expect(isStopword('and')).toBe(true);
    expect(isStopword('i')).toBe(true);
  });

  it('returns false for content words', () => {
    expect(isStopword('postgres')).toBe(false);
    expect(isStopword('bread')).toBe(false);
    expect(isStopword('42')).toBe(false);
  });
});

describe('stem', () => {
  it('leaves words of four characters or fewer untouched', () => {
    expect(stem('was')).toBe('was');
    expect(stem('does')).toBe('does');
    expect(stem('runs')).toBe('runs');
    expect(stem('flat')).toBe('flat');
  });

  it('collapses index / indexes / indexing to the same stem', () => {
    const a = stem('index');
    const b = stem('indexes');
    const c = stem('indexing');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('strips -es after a sibilant, so "boxes" -> "box"', () => {
    expect(stem('boxes')).toBe('box');
    expect(stem('watches')).toBe('watch');
    expect(stem('dishes')).toBe('dish');
    expect(stem('buzzes')).toBe('buzz');
  });

  it('collapses the doubled consonant in "running" to reach "run"', () => {
    expect(stem('running')).toBe('run');
    expect(stem('stopped')).toBe('stop');
  });

  it('preserves ll/ss/ff doubles so "falling" -> "fall" not "fal"', () => {
    expect(stem('falling')).toBe('fall');
    expect(stem('passing')).toBe('pass');
    expect(stem('stuffing')).toBe('stuff');
  });

  it('rewrites -ies to -y for longer words', () => {
    expect(stem('parties')).toBe('party');
    expect(stem('stories')).toBe('story');
  });

  it('collapses -ational / -ization / -ations family suffixes', () => {
    expect(stem('rational')).toBe('r');
    expect(stem('organization')).toBe('organ');
    expect(stem('operations')).toBe('oper');
  });

  it('strips a trailing -ly on longer words but leaves -ss and -us intact', () => {
    expect(stem('quickly')).toBe('quick');
    expect(stem('progress')).toBe('progress');
    expect(stem('bonus')).toBe('bonus');
  });
});

describe('tokenize', () => {
  it('lowercases, drops stopwords, and stems content words', () => {
    expect(tokenize('The Running Boxes')).toEqual(['run', 'box']);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   \t\n  ')).toEqual([]);
  });

  it('returns an empty array when every word is a stopword', () => {
    expect(tokenize('the and or of it')).toEqual([]);
  });

  it('drops single-character tokens', () => {
    expect(tokenize('a b c postgres')).toEqual(['postgr']);
  });

  it('preserves multi-digit numbers as content tokens in source order', () => {
    // "shipped" -> "ship" (ed stripped, then doubled p collapsed);
    // "features" -> "featur" (trailing s stripped, then silent e dropped);
    // "42" is kept as-is.
    expect(tokenize('shipped 42 features')).toEqual(['ship', '42', 'featur']);
  });

  it('splits on punctuation and treats apostrophes as absent', () => {
    expect(tokenize("don't panic, everyone!")).toEqual(['dont', 'panic', 'everyon']);
  });

  it('is case-insensitive', () => {
    expect(tokenize('POSTGRES Postgres postgres')).toEqual(['postgr', 'postgr', 'postgr']);
  });

  it('routes indexes and indexing to the same term as index', () => {
    const [a] = tokenize('index');
    const [b] = tokenize('indexes');
    const [c] = tokenize('indexing');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('stem: silent-e collapse (regression)', () => {
  // A base word like "tune" was previously returned unstemmed because it is
  // only 4 characters, while "tuning" stemmed to "tun". They never matched.
  // These families must all reduce to the same stem after the silent-e fix.

  it('collapses tune / tuning / tuned to a single stem', () => {
    expect(stem('tune')).toBe(stem('tuning'));
    expect(stem('tuning')).toBe(stem('tuned'));
  });

  it('collapses write / writing to a single stem', () => {
    expect(stem('write')).toBe(stem('writing'));
  });

  it('collapses store / storing / stored to a single stem', () => {
    expect(stem('store')).toBe(stem('storing'));
    expect(stem('storing')).toBe(stem('stored'));
  });

  it('collapses note / notes / noting to a single stem', () => {
    expect(stem('note')).toBe(stem('notes'));
    expect(stem('notes')).toBe(stem('noting'));
  });

  it('keeps free and frees on the same stem AND that stem is still "free"', () => {
    // Guard against over-stripping: "free" ends in -e preceded by another
    // vowel, so the silent-e pass must NOT drop it. If someone removes the
    // vowel-precedes check, this test fails because "free" collapses to "fre".
    expect(stem('free')).toBe('free');
    expect(stem('frees')).toBe('free');
  });

  it('leaves a word intact when dropping -e would leave under 3 characters', () => {
    // "ace": 3 chars, ends -e preceded by consonant 'c'. Dropping would leave
    // "ac" (2 chars), so the silent-e pass must refuse. This test fails if
    // someone drops the length guard.
    expect(stem('ace')).toBe('ace');
    // "toe": ends -e preceded by vowel 'o', so kept for the vowel-precedes
    // reason. Included to show the two guards are independent.
    expect(stem('toe')).toBe('toe');
  });
});

describe('displayTerms', () => {
  it('keeps the pre-stemming form so the UI can highlight real words', () => {
    expect(displayTerms('The Running Boxes')).toEqual(['running', 'boxes']);
  });

  it('drops stopwords and single characters like tokenize does', () => {
    expect(displayTerms('a b the postgres')).toEqual(['postgres']);
  });

  it('returns an empty array for empty or all-stopword input', () => {
    expect(displayTerms('')).toEqual([]);
    expect(displayTerms('the and of')).toEqual([]);
  });
});
