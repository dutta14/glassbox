import type { Answer, IntentName, Note, ScoredChunk } from '../types';
import { buildIndex, search, type TfIdfIndex } from './tfidf';
import { tokenize } from './tokenize';
import { COPY } from './copy';

/**
 * Retrieval gate.
 *
 * Cosine similarity alone cannot separate a good answer from a bad one. Measured
 * on a real corpus:
 *
 *   "why is my bread flat"       score 0.306  coverage 0.50  <- correct answer
 *   "quarterly revenue forecast" score 0.339  coverage 0.33  <- wrong answer
 *
 * The wrong result scores higher, so any single cosine threshold either accepts
 * the false positive or rejects the true one. Coverage, the fraction of the
 * user's content words the passage actually contains, is what separates them.
 *
 * So the gate is two-factor, and coverage is the hard requirement: at least half
 * of what you asked about has to appear in the passage.
 */
export const GATE = { minScore: 0.15, minCoverage: 0.5 } as const;

/**
 * Tier thresholds are calibrated to the range TF-IDF cosine actually produces on
 * short natural-language queries, which clusters between 0.1 and 0.5. Treating
 * the raw score as if it spanned 0 to 1 would label almost every correct answer
 * "low confidence" and make an accurate product feel broken.
 */
export const TIERS = {
  high: { minScore: 0.4, minCoverage: 0.67 },
  medium: { minScore: 0.25, minCoverage: 0.5 },
} as const;

export type ConfidenceTier = 'high' | 'medium' | 'low';

export const tierFor = (chunk: Pick<ScoredChunk, 'score' | 'coverage'>): ConfidenceTier => {
  if (chunk.score >= TIERS.high.minScore && chunk.coverage >= TIERS.high.minCoverage) return 'high';
  if (chunk.score >= TIERS.medium.minScore && chunk.coverage >= TIERS.medium.minCoverage) return 'medium';
  return 'low';
};

export const passesGate = (chunk: Pick<ScoredChunk, 'score' | 'coverage'>): boolean =>
  chunk.score >= GATE.minScore && chunk.coverage >= GATE.minCoverage;

const GREETINGS = /^(hi|hey|hello|yo|good (morning|afternoon|evening))\b[\s!.?]*$/i;
const HELP = /\b(help|what can you do|how do (i|you) use|what do you do)\b/i;
const COUNT = /\b(how many|number of|count)\b.*\b(notes?|entries)\b/i;
const RECENT = /\b(today|yesterday|this week|last week|this month|recent(ly)?|lately)\b/i;
const TAG = /#([a-z0-9][a-z0-9-]*)/i;

export interface RecentWindow {
  label: string;
  since: Date;
}

export const parseRecentWindow = (query: string, now: Date): RecentWindow | null => {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (n: number) => new Date(startOfDay(now).getTime() - n * 86_400_000);

  if (/\btoday\b/i.test(query)) return { label: 'today', since: startOfDay(now) };
  if (/\byesterday\b/i.test(query)) return { label: 'yesterday', since: days(1) };
  if (/\blast week\b/i.test(query)) return { label: 'last week', since: days(14) };
  if (/\bthis week\b/i.test(query)) return { label: 'this week', since: days(7) };
  if (/\bthis month\b/i.test(query)) return { label: 'this month', since: days(30) };
  if (/\brecent(ly)?\b|\blately\b/i.test(query)) return { label: 'recently', since: days(7) };
  return null;
};

export const classify = (query: string): IntentName => {
  const q = query.trim();
  if (q.length === 0) return 'unknown';
  if (GREETINGS.test(q)) return 'greeting';
  if (HELP.test(q)) return 'help';
  if (COUNT.test(q)) return 'count';
  if (TAG.test(q)) return 'tag';
  if (RECENT.test(q) && tokenize(q).length <= 4) return 'recent';
  if (tokenize(q).length === 0) return 'unknown';
  return 'search';
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const listTitles = (notes: Note[]): string =>
  notes.map((n) => `${n.title.trim() || COPY.untitled} (${formatDate(n.updatedAt)})`).join('\n');

const answer = (
  text: string,
  intent: IntentName,
  reason: string,
  extras: Partial<Answer['trace']> = {},
  sources: ScoredChunk[] = []
): Answer => ({
  text,
  sources,
  trace: {
    intent,
    confidence: sources[0]?.score ?? 0,
    queryTerms: extras.queryTerms ?? [],
    candidatesConsidered: extras.candidatesConsidered ?? 0,
    results: extras.results ?? sources,
    reason,
  },
});

export const route = (query: string, notes: Note[], index: TfIdfIndex, now = new Date()): Answer => {
  const intent = classify(query);
  const terms = tokenize(query);

  if (intent === 'greeting') return answer(COPY.greeting, intent, 'matched a greeting pattern');
  if (intent === 'help') return answer(COPY.help, intent, 'matched a help pattern');

  if (intent === 'count') {
    const n = notes.length;
    return answer(
      n === 1 ? COPY.countOne : COPY.count(n),
      intent,
      'counted notes directly, no retrieval needed'
    );
  }

  if (intent === 'tag') {
    const tag = (query.match(TAG)?.[1] ?? '').toLowerCase();
    const matches = notes.filter((n) => n.tags.includes(tag));
    return answer(
      matches.length === 0 ? COPY.tagEmpty(tag) : listTitles(matches),
      intent,
      `filtered notes by tag #${tag}`,
      { candidatesConsidered: notes.length }
    );
  }

  if (intent === 'recent') {
    const window = parseRecentWindow(query, now) ?? { label: 'recently', since: new Date(0) };
    const matches = notes
      .filter((n) => new Date(n.updatedAt) >= window.since)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return answer(
      matches.length === 0 ? COPY.recentEmpty : listTitles(matches),
      intent,
      `filtered notes updated since ${window.since.toDateString()}`,
      { candidatesConsidered: notes.length }
    );
  }

  if (intent === 'unknown' || terms.length === 0) {
    return answer(COPY.unknown, 'unknown', 'no content words in query after removing common words', {
      queryTerms: terms,
    });
  }

  const results = search(index, query, 5);
  const top = results[0];
  const base = { queryTerms: terms, candidatesConsidered: index.size, results };

  if (!top || !passesGate(top)) {
    return answer(COPY.notFound, 'search', notFoundReason(top), base);
  }

  // The answer IS the passage. No connector prose is added, because any sentence
  // the user did not write is a sentence this product could be wrong about.
  return answer(top.text, 'search', 'quoted the highest scoring passage', base, results);
};

const notFoundReason = (top: ScoredChunk | undefined): string => {
  if (!top) return 'no passage shared any content word with the query';
  if (top.coverage < GATE.minCoverage) {
    return `best passage matched only ${Math.round(top.coverage * 100)}% of your words, below the ${Math.round(
      GATE.minCoverage * 100
    )}% needed`;
  }
  return `best passage scored ${top.score.toFixed(2)}, below the ${GATE.minScore} threshold`;
};

export const createIndex = (notes: Note[]): TfIdfIndex => buildIndex(notes);
