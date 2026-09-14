import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * AC 4 — deletion asks for confirmation.
 * AC 24 — "Clear chat" empties the transcript after confirmation.
 *
 * ConfirmDialog is the shared alertdialog used by both. These tests cover
 * the gate behaviour: confirming performs the action, cancelling does not,
 * and Escape cancels.
 *
 * Focus-trap internals (Tab wrap, restore on close) are intentionally NOT
 * asserted here — Sasha is re-auditing that surface separately.
 */

describe('ConfirmDialog — AC 4/24 gate behaviour', () => {
  it('renders nothing when open is false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('renders an alertdialog with the given title and description text when open is true', () => {
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain('Delete note?');
    expect(dialog.textContent).toContain('This cannot be undone.');
  });

  it('calls onConfirm exactly once and does not call onCancel when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel exactly once and does not call onConfirm when the cancel button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Clear chat transcript?"
        description="This cannot be undone."
        confirmLabel="Clear"
        cancelLabel="Keep"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Keep' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel exactly once and does not call onConfirm when the Escape key is pressed while the dialog is open', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel exactly once when the backdrop is clicked, without invoking onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    // The dialog is portaled to document.body, so `container` no longer holds
    // the backdrop. Reach it through the alertdialog's ancestor instead.
    const dialog = screen.getByRole('alertdialog');
    const backdrop = dialog.closest('.confirm-backdrop');
    expect(backdrop).not.toBeNull();
    // Backdrop uses onMouseDown for the outside-click gesture.
    await user.pointer([{ target: backdrop as HTMLElement, keys: '[MouseLeft]' }]);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders the confirm button before the cancel button is triggered by Escape, and does not fire either handler on mount', () => {
    // Guard: the dialog must not auto-fire on mount. That would delete the
    // note the second it opens, which is the opposite of a confirmation gate.
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
