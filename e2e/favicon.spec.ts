import { test, expect } from "@playwright/test";

/* The favicon is the one asset that is never exercised by the app's own
   rendering, so it gets looked at directly. */
for (const scheme of ["light", "dark"] as const) {
  test(`favicon renders at tab size (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    /* setContent leaves the page on about:blank, where a root-relative src
       resolves to nothing, so the document is served from the dev server. */
    await page.goto("/");
    await page.setContent(`
      <body style="margin:0;background:${scheme === "dark" ? "#161616" : "#f6f5f3"};
                   display:flex;gap:24px;align-items:flex-end;padding:24px">
        <img src="/favicon.svg" width="16" height="16">
        <img src="/favicon.svg" width="32" height="32">
        <img src="/favicon.svg" width="64" height="64">
        <img src="/favicon.svg" width="128" height="128">
      </body>`);
    await page.evaluate(() =>
      Promise.all(Array.from(document.images, (img) => img.decode())),
    );
    await expect(page.locator("body")).toHaveScreenshot(
      `favicon-${scheme}.png`,
    );
  });
}
