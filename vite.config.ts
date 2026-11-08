/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// base is '/glassbox/' so the built assets resolve correctly on GitHub Pages,
// which serves this repo from https://<user>.github.io/glassbox/.
export default defineConfig({
  base: process.env.DEPLOY_TARGET === "pages" ? "/glassbox/" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
    // Playwright owns e2e/. Without this vitest tries to run those specs in
    // jsdom, where @playwright/test has no runner to attach to.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/storybook-static/**",
      "e2e/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.tsx",
        "src/test/**",
        "src/**/*.d.ts",
      ],
      reporter: ["text-summary", "html"],
      // Set just under the measured baseline (86.3 / 80.0 / 86.6 / 88.4) so the
      // gate catches a slide without failing on noise. Raise it as it improves.
      thresholds: { statements: 85, branches: 78, functions: 85, lines: 87 },
    },
  },
});
