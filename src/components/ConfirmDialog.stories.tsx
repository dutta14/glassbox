import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent } from "storybook/test";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Dialogs/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    title: "Delete note?",
    description: "This cannot be undone.",
    confirmLabel: "Delete",
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/* The dialog is portalled to <body>, so it is queried through `screen` rather
   than the story canvas. */

export const Default: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("alertdialog");
    await expect(dialog).toHaveTextContent("Delete note?");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

export const Destructive: Story = {
  args: { destructive: true },
};

export const CancelledWithEscape: Story = {
  play: async ({ args }) => {
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

export const FocusStartsOnCancel: Story = {
  play: async () => {
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await expect(cancel).toHaveFocus();
  },
};
