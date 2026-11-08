import { test, expect } from "@playwright/test";

/* Runs against `vite preview` of a DEPLOY_TARGET=pages build, served under
   /glassbox/ exactly as GitHub Pages will serve it. Every asset the page asks
   for has to resolve under that prefix, or the deploy ships a blank page that
   no other test would notice. */

test("the production build boots under /glassbox/ with every asset resolving", async ({
  page,
}) => {
  const failed: string[] = [];
  const errors: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/glassbox/");
  await expect(page).toHaveTitle(/Glassbox/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Glassbox: ask your notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "1:1 with Priya", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const faces = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter((f) => f.status === "loaded")
      .map((f) => f.family),
  );
  expect(faces.join(" ")).toContain("EB Garamond");

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
