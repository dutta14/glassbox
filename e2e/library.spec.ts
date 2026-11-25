import { test, expect } from "@playwright/test";

/**
 * Needs a real browser and a real pointer. The room is a 3D scene, and
 * whether a spine receives a click depends on what paints over it, which
 * jsdom does not model. Scenery once covered the shelf and swallowed every
 * click, while a programmatic click() on the same button still worked.
 */

test("clicking a book on the shelf opens that book", async ({ page }) => {
  await page.addInitScript(() => {
    const iso = new Date("2024-01-01").toISOString();
    localStorage.setItem(
      "glassbox.books.v1",
      JSON.stringify([
        {
          id: "b1",
          title: "Trip notes",
          chapterIds: [],
          createdAt: iso,
          updatedAt: iso,
        },
      ]),
    );
    localStorage.setItem("glassbox.theme.v1", "light");
  });
  await page.goto("/#/books");

  const spine = page.getByRole("button", { name: /Trip notes/ });
  await expect(spine).toBeVisible();
  const box = await spine.boundingBox();
  if (!box) throw new Error("the spine has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page).toHaveURL(/#\/book\/b1$/);
});

test("the scenery lets pointer events through to the shelf", async ({
  page,
}) => {
  await page.goto("/#/books");
  const events = await page
    .locator(".library .lamp .glow")
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(events).toBe("none");
});

test("a fresh app is empty: no sample notes, no banner", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Nothing here yet.").first()).toBeVisible();
  await expect(page.locator("[data-note-id]")).toHaveCount(0);
  await expect(page.getByText("These are sample notes")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("glassbox.notes.v1")),
  ).toBeNull();
});
