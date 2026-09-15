import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

/**
 * AC 7 — Chat input accepts up to 2000 chars. Enter submits, Shift+Enter
 * inserts a newline.
 *
 * Edge case in the spec: hard cap 2000 chars, counter appears at 1800+.
 */

describe('ChatInput — AC 7 composer behaviour', () => {
  it('submits the trimmed text on Enter and clears the textarea', async () => {
    const onSubmit = vi.fn();
    render(<ChatInput disabled={false} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    await user.type(textarea, '  hello  ');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(textarea.value).toBe('');
  });

  it('inserts a newline character into the textarea on Shift+Enter without submitting', async () => {
    const onSubmit = vi.fn();
    render(<ChatInput disabled={false} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    await user.type(textarea, 'line1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'line2');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('line1\nline2');
  });

  it('exposes a hard cap of 2000 characters via the textarea maxLength attribute', () => {
    // Enforcement of the 2000 cap is native (maxLength on the DOM element).
    // Asserting the attribute proves the browser will refuse the 2001st keystroke.
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);
    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);
  });

  it('does not render the character counter when the current length is below 1800', async () => {
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);
    const user = userEvent.setup();
    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;

    // Fill to 1799 characters, one below the counter threshold.
    await user.click(textarea);
    // Bypass character-by-character typing which is O(n) slow; paste is fine.
    await user.paste('a'.repeat(1799));

    expect(textarea.value.length).toBe(1799);
    expect(screen.queryByText(/^1799 \/ 2000$/)).toBeNull();
  });

  it('renders the "X / 2000" counter once the current length reaches 1800', async () => {
    render(<ChatInput disabled={false} onSubmit={vi.fn()} />);
    const user = userEvent.setup();
    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;

    await user.click(textarea);
    await user.paste('a'.repeat(1800));

    expect(textarea.value.length).toBe(1800);
    expect(screen.getByText('1800 / 2000')).toBeInTheDocument();
  });

  it('does not submit when Enter is pressed on empty or whitespace-only content', async () => {
    const onSubmit = vi.fn();
    render(<ChatInput disabled={false} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    const textarea = screen.getByLabelText('Ask a question');
    await user.click(textarea);
    await user.keyboard('{Enter}');
    await user.type(textarea, '   ');
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when Enter is pressed while the input is disabled', async () => {
    const onSubmit = vi.fn();
    // Render disabled=true, then paste text via a non-disabled clone would be
    // impossible; instead we assert that a disabled textarea rejects input,
    // and Enter does not trigger submit either way.
    render(<ChatInput disabled onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();

    // Even if a user pressed Enter on a disabled element, our send() would
    // early-return; guard that too.
    textarea.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * Enter is now the only way to send, since the send button was removed.
   * An IME (Japanese, Chinese, Korean) uses Enter to confirm the highlighted
   * candidate, and that keydown reaches us with isComposing true. Treating it
   * as a submit would fire a half-typed question and, with no button left to
   * fall back on, there is no other way to send.
   */
  it('does not submit when Enter confirms an IME composition', () => {
    const onSubmit = vi.fn();
    render(<ChatInput disabled={false} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'にほん' } });
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('にほん');
  });

  it('submits on the Enter that follows a completed IME composition', () => {
    const onSubmit = vi.fn();
    render(<ChatInput disabled={false} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Ask a question') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '日本' } });
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: false });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('日本');
  });
});
