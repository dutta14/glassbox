import { defineConfig, devices } from "@playwright/test";

/**
 * Exists because vitest runs with `css: false`, so nothing in the unit suite
 * ever sees a stylesheet. Layout, spacing and colour were unverifiable until
 * a real browser rendered them. These specs are the only place styling is
 * observed.
 */
export default defineConfig({
  testDir: "./e2e",
  // A rail that renders differently under load is a bug worth failing on, and
  // screenshots are order-independent anyway.
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    // Pinned so a screenshot taken today is comparable to one taken later.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // strictPort, because silently landing on another port would serve a
    // different app than the one under test.
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
