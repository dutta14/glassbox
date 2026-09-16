import { test, expect } from "@playwright/test";

/* The collapsed rail is one icon wide and names nothing, so these labels are
   the only thing standing between the icons and a guessing game. They are
   absolutely positioned out of a narrow container, which is exactly the kind
   of thing that silently clips, so they are checked in a real browser. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("glassbox.rail.v1", "collapsed");
    localStorage.setItem("glassbox.theme.v1", "light");
  });
});

test("a label appears beside the icon it belongs to", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "New note", exact: true });
  const tip = button.locator(".rail-tip");

  await expect(tip).toBeHidden();
  await button.hover();
  await expect(tip).toBeVisible();

  const icon = (await button.boundingBox())!;
  const label = (await tip.boundingBox())!;
  // Beside, not on top of: a label covering its own icon defeats the point.
  expect(label.x).toBeGreaterThan(icon.x + icon.width);
  // Fully on screen. Clipping is the failure mode this file exists to catch.
  expect(label.x + label.width).toBeLessThan(page.viewportSize()!.width);
  expect(label.width).toBeGreaterThan(20);
});

test("keyboard focus shows the label without the hover delay", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "New note", exact: true });
  await button.focus();
  // Well inside the 400ms hover delay, so passing here means focus skipped it.
  await page.waitForTimeout(120);
  await expect(button.locator(".rail-tip")).toBeVisible();
});

test("the flyout labels give way to the panel they open", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Notes", exact: true });
  await button.hover();
  await expect(button.locator(".rail-tip")).toBeVisible();

  await button.click();
  await expect(page.locator(".rail-flyout__panel")).toBeVisible();
  await expect(button.locator(".rail-tip")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`labelled icon column (${theme})`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem("glassbox.theme.v1", t), theme);
    await page.goto("/");
    await page.getByRole("button", { name: "Search notes", exact: true }).hover();
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot(`tooltip-${theme}.png`, {
      clip: { x: 0, y: 0, width: 420, height: 400 },
    });
  });
}
