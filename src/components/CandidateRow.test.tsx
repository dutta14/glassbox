import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateRow } from './CandidateRow';
import type { ScoredChunk } from '../types';

/**
 * AC 11 / AC 12 — Candidate row formatting.
 *
 * AC 11: reasoning panel shows confidence to 2dp.
 * AC 12: each candidate row shows rank, score (2dp), source note title,
 *        first 140 chars.
 *
 * These are all rendered by CandidateRow.tsx. A regression to `.toFixed(1)`
 * or a locale-comma bug must fail this suite.
 */

const mkCandidate = (over: Partial<ScoredChunk> = {}): ScoredChunk => ({
  noteId: 'n1',
  noteTitle: 'Postgres tuning',
  position: 0,
  text: 'shared_buffers should be 25% of RAM.',
  score: 0.4235,
  matchedTerms: ['postgres'],
  coverage: 0.75,
  ...over,
});

describe('CandidateRow — AC 11/12 rank, score, title, snippet formatting', () => {
  it('renders the score to exactly two decimal places, not one and not three', () => {
    const c = mkCandidate({ score: 0.4235 });
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );

    // Score cell: exactly "0.42". Neither "0.4" nor "0.424".
    const scores = screen.getAllByText('0.42');
    expect(scores.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('0.4')).toBeNull();
    expect(screen.queryByText('0.424')).toBeNull();
  });

  it('renders a score of exactly 0.5 as "0.50" so the trailing zero is preserved', () => {
    // Guards against `String(score)` or `score.toFixed(1)` regressions that
    // would drop trailing zeros. toFixed(2) keeps them.
    const c = mkCandidate({ score: 0.5 });
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    expect(screen.getAllByText('0.50').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('0.5')).toBeNull();
  });

  it('renders the score as an ASCII dot decimal, not a locale comma', () => {
    // A regression that used toLocaleString() would render "0,42" in a
    // comma-locale environment. Explicit guard.
    const c = mkCandidate({ score: 0.4235 });
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    expect(screen.queryByText('0,42')).toBeNull();
  });

  it('renders the rank with a leading hash sign matching the given rank number', () => {
    const c = mkCandidate();
    render(
      <ol>
        <CandidateRow candidate={c} rank={3} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('renders the source note title when the candidate has a title', () => {
    const c = mkCandidate({ noteTitle: 'Postgres tuning' });
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    expect(screen.getByText('Postgres tuning')).toBeInTheDocument();
  });

  it('renders "Untitled note" as the source title when the candidate has an empty title', () => {
    const c = mkCandidate({ noteTitle: '   ' });
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    expect(screen.getByText('Untitled note')).toBeInTheDocument();
  });

  it('truncates the snippet to at most 140 characters including the terminating ellipsis when the passage exceeds 140 chars', () => {
    const longText = 'a'.repeat(500);
    const c = mkCandidate({ text: longText });
    const { container } = render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    const snippet = container.querySelector('.candidate__snippet');
    expect(snippet).not.toBeNull();
    const text = snippet!.textContent ?? '';
    // Total rendered length must not exceed 140.
    expect(text.length).toBeLessThanOrEqual(140);
    // And the text should end with an ellipsis, proving truncation actually
    // happened rather than the full string being under the limit.
    expect(text.endsWith('…')).toBe(true);
  });

  it('renders the full snippet text without an ellipsis when the passage is at or under 140 characters', () => {
    const short = 'shared_buffers should be about 25% of RAM.';
    const c = mkCandidate({ text: short });
    const { container } = render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={vi.fn()} />
      </ol>,
    );
    const snippet = container.querySelector('.candidate__snippet');
    expect(snippet).not.toBeNull();
    expect(snippet!.textContent).toBe(short);
    expect(snippet!.textContent!.endsWith('…')).toBe(false);
  });

  it('calls onOpen exactly once with no arguments when the candidate row button is clicked', async () => {
    const c = mkCandidate();
    const onOpen = vi.fn();
    render(
      <ol>
        <CandidateRow candidate={c} rank={1} topScore={0.5} onOpen={onOpen} />
      </ol>,
    );
    const user = userEvent.setup();
    // The row button has an accessible name that includes the note title.
    await user.click(screen.getByRole('button', { name: /Postgres tuning/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
