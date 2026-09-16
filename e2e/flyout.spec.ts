import { test, expect } from "@playwright/test";

/**
 * Both of these need a real browser. The panel is portalled out of the rail,
 * so its list resets and its overflow only exist once a stylesheet is
 * applied, and vitest runs with css: false.
 */

test("the flyout scrolls its own list without dismissing itself", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const iso = new Date("2024-01-01").toISOString();
    const notes = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`,
      title: `Note number ${i} about something`,
      body: "body",
      tags: [],
      createdAt: iso,
      updatedAt: iso,
    }));
    localStorage.setItem("glassbox.notes.v1", JSON.stringify(notes));
    localStorage.setItem("glassbox.seeded.v1", "x");
    localStorage.setItem("glassbox.theme.v1", "light");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();

  const panel = page.getByRole("group", { name: "Notes" });
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  const metrics = await panel.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  // The test is only meaningful if the list actually overflows.
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  // A real wheel over the middle of the panel.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);

  const after = await panel.evaluate((el) => el.scrollTop);
  expect(after).toBeGreaterThan(0);
  await expect(panel).toBeVisible();
});

test("the flyout list renders without bullets", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("glassbox.theme.v1", "light");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();

  const ul = page.getByRole("group", { name: "Notes" }).locator("ul");
  await expect(ul).toHaveCSS("list-style-type", "none");
  await expect(ul).toHaveCSS("padding-left", "0px");
  await expect(ul.locator("li").first()).toHaveCSS("list-style-type", "none");
});
