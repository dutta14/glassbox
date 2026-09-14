import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReasoningDisclosure } from './ReasoningDisclosure';
import type { Answer, ScoredChunk } from '../types';

/**
 * A11y finding B8 — the reasoning panel must be `inert` from its very first
 * paint, not from a post-commit effect.
 *
 * A new assistant message is appended into a `role="log"` region, which is
 * implicitly polite. If the collapsed panel is in the DOM for even one frame
 * without `inert`, a screen reader can sweep the entire reasoning trace into
 * that append announcement. The user asked a question and hears the ranked
 * passage list read at them.
 *
 * The regression this guards against is subtle: applying `inert` imperatively
 * in an effect LOOKS correct in a normal test, because React Testing Library
 * flushes effects inside `act()` before any assertion runs. So a plain
 * `render` + `toHaveAttribute` check passes under BOTH the broken and the
 * fixed implementation, and is therefore worthless here.
 *
 * Server rendering runs no effects at all. If `inert` appears in static
 * markup, it can only have come from the render pass itself. That is the
 * distinction B8 is actually about.
 */

const mkChunk = (): ScoredChunk => ({
  noteId: 'n1',
  noteTitle: 'Postgres tuning',
  position: 0,
  text: 'shared_buffers should be 25% of RAM.',
  score: 0.42,
  matchedTerms: ['postgres'],
  coverage: 0.75,
});

const mkAnswer = (): Answer => {
  const source = mkChunk();
  return {
    text: source.text,
    sources: [source],
    trace: {
      intent: 'search',
      confidence: 0.42,
      queryTerms: ['postgres'],
      candidatesConsidered: 3,
      results: [source],
      reason: 'quoted the highest scoring passage',
    },
  };
};

describe('ReasoningDisclosure inert behaviour (B8)', () => {
  it('marks the collapsed panel inert during the render pass, before any effect runs', () => {
    const html = renderToStaticMarkup(
      <ReasoningDisclosure
        answer={mkAnswer()}
        userQuery="postgres tuning"
        onOpenCandidate={vi.fn()}
      />,
    );

    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
  });

  it('does not mark the panel inert during the render pass when it starts expanded', () => {
    const html = renderToStaticMarkup(
      <ReasoningDisclosure
        answer={mkAnswer()}
        userQuery="postgres tuning"
        onOpenCandidate={vi.fn()}
        defaultExpanded
      />,
    );

    expect(html).not.toContain('inert=""');
    expect(html).toContain('aria-hidden="false"');
  });

  it('clears inert from the panel when the user expands it', async () => {
    const user = userEvent.setup();
    render(
      <ReasoningDisclosure
        answer={mkAnswer()}
        userQuery="postgres tuning"
        onOpenCandidate={vi.fn()}
      />,
    );

    const summary = screen.getByRole('button', { expanded: false });
    const panel = document.getElementById(
      summary.getAttribute('aria-controls') ?? '',
    );
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('inert');

    await user.click(summary);

    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('inert');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });
});
