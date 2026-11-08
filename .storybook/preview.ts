import type { Preview } from "@storybook/react-vite";
import "../src/styles/fonts.css";
import "../src/styles/tokens.css";

/* The app themes through a `dark` class on <body>, so the toolbar does the
   same rather than inventing a second mechanism. */
const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Colour theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: ["light", "dark"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      document.body.classList.toggle("dark", context.globals.theme === "dark");
      return Story();
    },
  ],
  parameters: {
    layout: "centered",
    // A violation fails the story test instead of only appearing in the panel.
    a11y: { test: "error" },
  },
};

export default preview;
