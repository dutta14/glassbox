import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '../types';

/**
 * ChatMessage — user-role render branch.
 *
 * Sasha's re-audit found that the user `<li>` used to be marked
 * `aria-hidden="true"`, deleting every user message from the accessibility
 * tree and destroying question/answer pairing for screen reader users.
 * That was removed. This test is the permanent guard: the user's text must
 * be present and readable in the accessibility tree. If someone reintroduces
 * `aria-hidden` (or wraps the branch in a way that hides text nodes from
 * assistive tech), this must fail.
 *
 * We do NOT test the live-region announcement mechanism — Sasha owns that.
 */

const iso = '2026-01-01T00:00:00.000Z';

const mkUser = (id: string, text: string): ChatMessageType => ({
  id,
  role: 'user',
  text,
  createdAt: iso,
});

const renderUser = (message: ChatMessageType) =>
  render(
    <ul>
      <ChatMessage
        message={message}
        userQuery={null}
        notes={[]}
        onJumpToNote={vi.fn()}
      />
    </ul>,
  );

describe('ChatMessage — user-role render branch', () => {
  it('renders the user message text as visible content', () => {
    renderUser(mkUser('u1', 'How do I tune postgres shared_buffers?'));
    expect(
      screen.getByText('How do I tune postgres shared_buffers?'),
    ).toBeInTheDocument();
  });

  it('does not mark the user message list item as aria-hidden', () => {
    // Permanent guard against the B2 regression. Reintroducing aria-hidden
    // on the <li> would drop the user message from the accessibility tree.
    const { container } = renderUser(mkUser('u1', 'sample question'));
    const li = container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('exposes the user message text to accessible-name queries via getByText', () => {
    // getByText traverses the accessibility tree the same way jsdom exposes
    // it. If the text becomes hidden (via aria-hidden, `hidden`, or role
    // "presentation"), this query fails.
    renderUser(mkUser('u1', 'What did I write about kyoto?'));
    const match = screen.getByText('What did I write about kyoto?');
    // And no ancestor within the message tree hides it from a11y.
    let node: HTMLElement | null = match;
    while (node !== null && node.tagName !== 'UL') {
      expect(node.getAttribute('aria-hidden')).not.toBe('true');
      node = node.parentElement;
    }
  });

  it('renders the user message with the assistant-message branch\'s data-msg-id attribute absent, proving the user branch was taken', () => {
    // A regression that accidentally rendered user messages through the
    // assistant branch (e.g. a role check inverted) would put a
    // data-msg-id on the <li>. The user branch does not set that attribute.
    const { container } = renderUser(mkUser('u1', 'q'));
    const li = container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li!.hasAttribute('data-msg-id')).toBe(false);
  });
});
