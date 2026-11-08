import { defineConfig, devices } from "@playwright/test";

const PAGES_SMOKE = Boolean(process.env.PAGES_SMOKE);
const PREVIEW_URL = "http://localhost:4173";

/**
 * Exists because vitest runs with `css: false`, so nothing in the unit suite
 * ever sees a stylesheet. Layout, spacing and colour were unverifiable until
 * a real browser rendered them. These specs are the only place styling is
 * observed.
 *
 * PAGES_SMOKE=1 swaps the dev server for `vite preview` over a build made with
 * DEPLOY_TARGET=pages, and runs only the smoke spec. That is the one place the
 * /glassbox/ base path is exercised, and a wrong base deploys a blank page.
 */
export default defineConfig({
  testDir: "./e2e",
  // A rail that renders differently under load is a bug worth failing on, and
  // screenshots are order-independent anyway.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: PAGES_SMOKE ? PREVIEW_URL : "http://localhost:5199",
    // Pinned so a screenshot taken today is comparable to one taken later.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
  },
  projects: [
    PAGES_SMOKE
      ? {
          name: "pages-smoke",
          testMatch: /pages-smoke\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        }
      : {
          name: "chromium",
          testIgnore: /pages-smoke\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
  ],
  webServer: PAGES_SMOKE
    ? {
        // DEPLOY_TARGET must match the build, because preview serves dist under
        // whatever base the config resolves, and "/" would 404 every asset.
        command:
          "DEPLOY_TARGET=pages npm run preview -- --port 4173 --strictPort",
        url: `${PREVIEW_URL}/glassbox/`,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : {
        // strictPort, because silently landing on another port would serve a
        // different app than the one under test.
        command: "npm run dev -- --port 5199 --strictPort",
        url: "http://localhost:5199",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
