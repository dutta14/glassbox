import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessage } from './ChatMessage';
import type { Answer, ChatMessage as ChatMessageType, ScoredChunk } from '../types';

/**
 * AC 13 — Collapsed by default, EXCEPT the first assistant message of a
 * session, which is expanded.
 *
 * Wiring:
 *   App → ChatPanel (isFirstAssistantMessage) → ChatMessage
 *   (defaultReasoningExpanded) → ReasoningDisclosure (defaultExpanded)
 * seeding `useState(defaultExpanded)`.
 *
 * These tests target the wired behaviour at the ChatMessage boundary. That
 * is close enough to the reasoning panel to catch a controlled-prop
 * regression (see the "collapse then re-render" test), but not so close
 * that we couple to ReasoningDisclosure's internal state.
 */

const iso = '2026-01-01T00:00:00.000Z';

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

const mkAssistant = (id: string): ChatMessageType => ({
  id,
  role: 'assistant',
  text: mkAnswer().text,
  answer: mkAnswer(),
  createdAt: iso,
});

const renderChatMessage = (props: {
  message: ChatMessageType;
  defaultReasoningExpanded: boolean;
}) =>
  render(
    <ul>
      <ChatMessage
        message={props.message}
        userQuery="how do I tune postgres"
        notes={[]}
        onJumpToNote={vi.fn()}
        defaultReasoningExpanded={props.defaultReasoningExpanded}
      />
    </ul>,
  );

const getSummaryButton = (container: HTMLElement): HTMLButtonElement => {
  // The reasoning disclosure summary is the only element in the tree with an
  // aria-expanded attribute; other buttons (Open note, candidate rows) do not
  // carry that state. This is precise and does not rely on tier-label text.
  const el = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
  if (el === null) throw new Error('reasoning summary button not found');
  return el;
};

describe('ChatMessage — AC 13 initial reasoning expanded state', () => {
  it('renders the reasoning disclosure with aria-expanded="true" when defaultReasoningExpanded is true', () => {
    const { container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: true,
    });
    const summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the reasoning disclosure with aria-expanded="false" when defaultReasoningExpanded is false', () => {
    const { container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: false,
    });
    const summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('false');
  });

  it('makes the ranked-passages panel content reachable on first paint when defaultReasoningExpanded is true, and hidden via inert when false', () => {
    const { unmount, container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: true,
    });
    const summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    const region = container.querySelector('[role="group"]');
    expect(region).not.toBeNull();
    expect(region!.hasAttribute('inert')).toBe(false);
    unmount();

    const { container: container2 } = renderChatMessage({
      message: mkAssistant('m2'),
      defaultReasoningExpanded: false,
    });
    const summary2 = getSummaryButton(container2);
    expect(summary2.getAttribute('aria-expanded')).toBe('false');
    const region2 = container2.querySelector('[role="group"]');
    expect(region2).not.toBeNull();
    expect(region2!.hasAttribute('inert')).toBe(true);
  });

  it('keeps a reasoning disclosure collapsed across an unrelated re-render after the user has collapsed it, proving defaultExpanded seeds initial state and does not control it', async () => {
    const user = userEvent.setup();
    const { rerender, container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: true,
    });
    let summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('true');

    await user.click(summary);
    summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('false');

    rerender(
      <ul>
        <ChatMessage
          message={mkAssistant('m1')}
          userQuery="how do I tune postgres"
          notes={[]}
          onJumpToNote={vi.fn()}
          defaultReasoningExpanded={true}
        />
      </ul>,
    );

    summary = getSummaryButton(container);
    expect(summary.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not spring an already-collapsed first message back open when defaultReasoningExpanded flips to false on a subsequent render', async () => {
    const user = userEvent.setup();
    const { rerender, container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: true,
    });
    await user.click(getSummaryButton(container));
    expect(getSummaryButton(container).getAttribute('aria-expanded')).toBe('false');

    rerender(
      <ul>
        <ChatMessage
          message={mkAssistant('m1')}
          userQuery="how do I tune postgres"
          notes={[]}
          onJumpToNote={vi.fn()}
          defaultReasoningExpanded={false}
        />
      </ul>,
    );
    expect(getSummaryButton(container).getAttribute('aria-expanded')).toBe('false');
  });

  it('does not spontaneously collapse an already-expanded first message when defaultReasoningExpanded flips to false on a subsequent render', () => {
    const { rerender, container } = renderChatMessage({
      message: mkAssistant('m1'),
      defaultReasoningExpanded: true,
    });
    expect(getSummaryButton(container).getAttribute('aria-expanded')).toBe('true');

    rerender(
      <ul>
        <ChatMessage
          message={mkAssistant('m1')}
          userQuery="how do I tune postgres"
          notes={[]}
          onJumpToNote={vi.fn()}
          defaultReasoningExpanded={false}
        />
      </ul>,
    );
    expect(getSummaryButton(container).getAttribute('aria-expanded')).toBe('true');
  });
});
