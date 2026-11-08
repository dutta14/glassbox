import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../hooks/useTheme";

const Stateful = ({ initial }: { initial: Theme }) => {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <ThemeToggle
      theme={theme}
      onToggle={() => setTheme(theme === "light" ? "dark" : "light")}
    />
  );
};

const meta = {
  title: "Controls/ThemeToggle",
  component: ThemeToggle,
  args: { theme: "light", onToggle: () => {} },
  render: (args) => <Stateful initial={args.theme} />,
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /light/i }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const Dark: Story = { args: { theme: "dark" } };

export const SwitchesToDark: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /dark/i }));
    await expect(canvas.getByRole("button", { name: /dark/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      canvas.getByRole("button", { name: /light/i }),
    ).toHaveAttribute("aria-pressed", "false");
  },
};

export const ReselectingTheActiveThemeChangesNothing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /light/i }));
    await expect(
      canvas.getByRole("button", { name: /light/i }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};
