import type { ScoredChunk } from '../types';
import { tierFor, type ConfidenceTier } from '../engine/router';
import '../styles/CandidateRow.css';

interface CandidateRowProps {
  candidate: ScoredChunk;
  rank: number;
  topScore: number;
  onOpen: () => void;
}

const SNIPPET_MAX = 140;
const BAR_FLOOR = 0.08;

const TIER_TEXT: Record<ConfidenceTier, string> = {
  high: 'high',
  medium: 'med',
  low: 'low',
};

const truncate = (text: string, max: number): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
};

const accessibleName = (
  candidate: ScoredChunk,
  rank: number,
  tier: ConfidenceTier,
  coveragePct: number,
): string => {
  const raw = candidate.noteTitle.trim();
  const scoreLabel = candidate.score.toFixed(2);
  const tierLabel = TIER_TEXT[tier];
  if (raw.length > 0) {
    return `Open source note ${raw}, rank ${rank}, ${tierLabel} confidence, score ${scoreLabel}, coverage ${coveragePct}%`;
  }
  const snippet = truncate(candidate.text, 60);
  return `Open untitled note, rank ${rank}, ${tierLabel} confidence, score ${scoreLabel}, coverage ${coveragePct}%. ${snippet}`;
};

export const CandidateRow = ({
  candidate,
  rank,
  topScore,
  onOpen,
}: CandidateRowProps) => {
  const tier = tierFor(candidate);
  const rawTitle = candidate.noteTitle.trim();
  const title = rawTitle || 'Untitled note';
  const denominator = topScore > 0 ? topScore : 1;
  const fill = Math.max(BAR_FLOOR, Math.min(1, candidate.score / denominator));
  const coveragePct = Math.round(candidate.coverage * 100);

  return (
    <li className="candidate" data-tier={tier}>
      <button
        type="button"
        className="candidate__button"
        onClick={onOpen}
        aria-label={accessibleName(candidate, rank, tier, coveragePct)}
      >
        <div className="candidate__head">
          <span className="candidate__rank">#{rank}</span>
          <span className="candidate__score">{candidate.score.toFixed(2)}</span>
          <span className="candidate__tier-text" aria-hidden="true">
            {TIER_TEXT[tier]}
          </span>
          <span className="candidate__bar" aria-hidden="true">
            <span
              className="candidate__bar-fill"
              style={{ width: `${fill * 100}%` }}
            />
          </span>
          <span className="candidate__source">{title}</span>
          <span className="candidate__coverage" aria-hidden="true">
            {coveragePct}% match
          </span>
        </div>
        <p className="candidate__snippet">
          {truncate(candidate.text, SNIPPET_MAX)}
        </p>
      </button>
    </li>
  );
};
