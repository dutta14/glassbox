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
  const tip = button.locator(".rail-tip");

  // Keyboard focus shows the label, and does so with no transition delay.
  // Hover waits 400ms, so a delay that is not zero here means focus has been
  // put behind the same wait. Read from the style rather than timed, since a
  // stopwatch assertion flakes under load.
  await button.focus();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveCSS("transition-delay", "0s");
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
    await page.addInitScript((t) => {
      const iso = new Date("2024-01-01").toISOString();
      localStorage.setItem("glassbox.theme.v1", t);
      // One fixed note and an already-seeded library, so the shot does not
      // depend on whichever sample note the app would otherwise open.
      localStorage.setItem(
        "glassbox.notes.v1",
        JSON.stringify([
          {
            id: "n1",
            title: "Fixture",
            body: "Fixture.",
            tags: [],
            createdAt: iso,
            updatedAt: iso,
          },
        ]),
      );
      localStorage.setItem("glassbox.seeded.v1", "2024-01-01T00:00:00.000Z");
    }, theme);
    await page.goto("/");
    const search = page.getByRole("button", {
      name: "Search notes",
      exact: true,
    });
    await search.hover();
    await expect(search.locator(".rail-tip")).toBeVisible();
    // Narrower than the note column, which starts to the right of this clip.
    await expect(page).toHaveScreenshot(`tooltip-${theme}.png`, {
      clip: { x: 0, y: 0, width: 280, height: 400 },
    });
  });
}
