import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const iso = (d: string) => new Date(d).toISOString();

const NOTES = [
  {
    id: "n1",
    title: "Postgres connection pooling",
    body: "pgbouncer in transaction mode. shared_buffers at 25% of RAM.",
    tags: ["db"],
    createdAt: iso("2024-01-01"),
    updatedAt: iso("2024-03-02"),
  },
  {
    id: "n2",
    title: "Sourdough starter notes",
    body: "It was underfed. 1:5:5 at 26C fixed the rise.",
    tags: ["baking"],
    createdAt: iso("2024-01-02"),
    updatedAt: iso("2024-03-01"),
  },
  {
    id: "n3",
    title: "Reading list, spring",
    body: "Seeing Like a State. The Mushroom at the End of the World.",
    tags: [],
    createdAt: iso("2024-01-03"),
    updatedAt: iso("2024-02-20"),
  },
];

const CONVERSATIONS = [
  {
    id: "c1",
    title: "Why was the database slow last Tuesday",
    messages: [],
    createdAt: iso("2024-03-02"),
    updatedAt: iso("2024-03-02"),
  },
  {
    id: "c2",
    title: "What temperature did the starter like",
    messages: [],
    createdAt: iso("2024-03-01"),
    updatedAt: iso("2024-03-01"),
  },
  {
    id: "c3",
    title: "What am I reading this spring",
    messages: [],
    createdAt: iso("2024-02-20"),
    updatedAt: iso("2024-02-20"),
  },
];

/**
 * Seeded before the app's first paint, so the rail renders with real content
 * instead of its empty states. addInitScript runs in the page before any of
 * the bundle does.
 */
const seed = async (page: Page, theme: "dark" | "light") => {
  await page.addInitScript(
    ([notes, conversations, mode]) => {
      localStorage.setItem("glassbox.notes.v1", notes);
      localStorage.setItem("glassbox.conversations.v1", conversations);
      localStorage.setItem("glassbox.theme.v1", mode);
      // Marks the library as already seeded, so the app does not add its
      // sample notes on top of the fixture and make the shot non-deterministic.
      localStorage.setItem("glassbox.seeded.v1", "2024-01-01T00:00:00.000Z");
    },
    [JSON.stringify(NOTES), JSON.stringify(CONVERSATIONS), theme] as [
      string,
      string,
      string,
    ],
  );
};

const rail = (page: Page) => page.locator(".notes-rail");

for (const theme of ["dark", "light"] as const) {
  test.describe(`rail (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await seed(page, theme);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
    });

    test("expanded", async ({ page }) => {
      await expect(rail(page)).toHaveScreenshot(`rail-expanded-${theme}.png`);
    });

    test("chats section collapsed", async ({ page }) => {
      await page.getByRole("button", { name: /^Chats$/ }).click();
      await expect(rail(page)).toHaveScreenshot(
        `rail-chats-collapsed-${theme}.png`,
      );
    });

    test("rail collapsed to icons", async ({ page }) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(rail(page)).toHaveScreenshot(`rail-icons-${theme}.png`);
    });

    test("collapsed chats flyout open", async ({ page }) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await page.getByRole("button", { name: "Chats" }).click();
      await expect(page.getByRole("group", { name: "Chats" })).toBeVisible();
      // Clipped page rather than the rail, because the flyout is portalled to
      // the body and sits outside the rail's own box.
      await expect(page).toHaveScreenshot(`rail-flyout-${theme}.png`, {
        clip: { x: 0, y: 0, width: 420, height: 560 },
      });
    });

    test("header", async ({ page }) => {
      await expect(page.locator(".notes-rail__top-row")).toHaveScreenshot(
        `rail-header-${theme}.png`,
      );
    });
  });
}
