import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { NoteListItem } from "./NoteListItem";

const note = {
  id: "n1",
  title: "Postgres connection pooling",
  body: "pgbouncer in transaction mode.",
  tags: ["db"],
  createdAt: "2024-01-01T10:00:00.000Z",
  updatedAt: "2024-03-02T10:00:00.000Z",
};

const meta = {
  title: "Rail/NoteListItem",
  component: NoteListItem,
  decorators: [
    (Story) => (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, width: 260 }}>
        <Story />
      </ul>
    ),
  ],
  args: {
    note,
    isSelected: false,
    menuOpen: false,
    onSelect: fn(),
    onMenuOpenChange: fn(),
    onRequestDelete: fn(),
    onToggleFormat: fn(),
  },
} satisfies Meta<typeof NoteListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Postgres connection pooling" }),
    );
    await expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
};

export const Selected: Story = {
  args: { isSelected: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Postgres connection pooling" }),
    ).toHaveAttribute("aria-current", "true");
  },
};

/* axe's label-content-name-mismatch fires here by design: the row's accessible
   name is spelled out as "<title>, in <book>" because the visible spans join
   with no separator. See the aria-label comment in NoteListItem. Waived for
   this story only. */
export const InABook: Story = {
  args: { bookName: "Field notes" },
  parameters: {
    a11y: {
      config: {
        rules: [{ id: "label-content-name-mismatch", enabled: false }],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", {
        name: "Postgres connection pooling, in Field notes",
      }),
    ).toBeVisible();
  },
};

export const Untitled: Story = {
  args: { note: { ...note, title: "   " } },
};
