import { test, expect } from "@playwright/test";

/* The note body grows to fit its text so the section scrolls the whole note as
   one document. That arrangement is invisible to jsdom, which has no layout,
   and it is exactly the sort of thing a stray flex rule squashes back down. So
   it is measured in a real browser. */

const LONG = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i + 1}. ${"The quick brown fox jumps over it. ".repeat(3)}`,
).join("\n\n");

const init = ({ body, theme }: { body: string; theme: "light" | "dark" }) => {
  const now = new Date("2024-03-01T10:00:00Z").toISOString();
  localStorage.setItem("glassbox.seeded.v1", "true");
  localStorage.setItem("glassbox.theme.v1", theme);
  localStorage.setItem(
    "glassbox.notes.v1",
    JSON.stringify([
      {
        id: "n2",
        title: "A note with a great deal to say",
        body,
        tags: ["evaluation", "ambiguity"],
        createdAt: new Date("2024-02-02T10:00:00Z").toISOString(),
        updatedAt: now,
      },
      {
        id: "n1",
        title: "The older note that came before it",
        body: "Short.",
        tags: [],
        createdAt: new Date("2024-02-01T10:00:00Z").toISOString(),
        updatedAt: now,
      },
      {
        id: "n3",
        title: "The newer note that came after it",
        body: "Also short.",
        tags: [],
        createdAt: new Date("2024-02-03T10:00:00Z").toISOString(),
        updatedAt: now,
      },
    ]),
  );
};

const NOTE = "A note with a great deal to say";

/**
 * Installs the fixture, loads the app and opens a note from the rail.
 *
 * The fixture lives in here rather than in each test because forgetting it does
 * not fail in any way that points at the cause: the app injects its sample
 * notes over an unseeded store, the wanted title never appears, and all you get
 * is a thirty second timeout on a click. The explicit check below turns that
 * into an immediate and legible failure if the seed ever stops taking.
 */
const open = async (
  page: import("@playwright/test").Page,
  {
    body = LONG,
    theme = "light" as "light" | "dark",
    title = NOTE,
  } = {},
) => {
  await page.addInitScript(init, { body, theme });
  await page.goto("/");
  await expect(page.getByText("These are sample notes")).toHaveCount(0);
  // Targeted by data attribute rather than accessible name: the rail's notes
  // section can start collapsed, and the name would then match nothing.
  await page.locator(`[data-note-id]`, { hasText: title }).first().click();
  await expect(page.getByLabel("Note body")).toBeVisible();
};

test("the body grows to fit its text instead of scrolling inside itself", async ({
  page,
}) => {
  await open(page);

  const body = page.getByLabel("Note body");
  await expect(body).toBeVisible();

  const box = await body.evaluate((el: HTMLTextAreaElement) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));

  // If these diverge the text is cropped and unreachable, since the field no
  // longer offers a scrollbar of its own.
  expect(box.clientHeight).toBeGreaterThanOrEqual(box.scrollHeight - 2);
  // And it really is a long note, so the check above had something to catch.
  expect(box.clientHeight).toBeGreaterThan(2000);
});

test("the section scrolls the whole note, navigation included", async ({
  page,
}) => {
  await open(page);

  const section = page.locator(".editor");
  const metrics = await section.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 100);

  const nav = page.locator(".note-nav");
  await expect(nav).not.toBeInViewport();
  await section.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(nav).toBeInViewport();
});

/**
 * The field no longer scrolls itself, so keeping the caret in view is now the
 * section's job. Browsers scroll the nearest scrollable ancestor to reveal the
 * caret, and this asserts that the ancestor is in fact the section and that
 * nothing between them traps the scroll.
 */
test("typing at the end of a long note keeps the caret in view", async ({
  page,
}) => {
  await open(page, "A note with a great deal to say");

  const body = page.getByLabel("Note body");
  await body.click();
  // Collapsing a select-all to its right edge lands at the very end on any
  // platform, unlike the Ctrl/Cmd+End pair which differ on macOS.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("XYZZY");

  await expect(body).toHaveValue(/XYZZY$/);

  const grew = await body.evaluate((el: HTMLTextAreaElement) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(grew.clientHeight).toBeGreaterThanOrEqual(grew.scrollHeight - 2);

  // The last line of the note sits inside the section's visible window.
  const visible = await page.locator(".editor").evaluate((section, sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const bottom =
      el.getBoundingClientRect().bottom - section.getBoundingClientRect().top;
    return bottom <= section.clientHeight + 4 && bottom > 0;
  }, "textarea.editor__body");
  expect(visible).toBe(true);
});

test("moving to a neighbour starts you at the top of it", async ({ page }) => {
  await open(page);

  const section = page.locator(".editor");
  await section.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await section.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

  await page.locator(".note-nav__link").first().click();

  await expect(page.getByLabel("Note title")).toHaveValue(
    "The older note that came before it",
  );
  expect(await section.evaluate((el) => el.scrollTop)).toBe(0);
});

test("the note reads the way the blog post does", async ({ page }) => {
  await open(page, { body: "A short note.\n\nWith two paragraphs." });
  await page.waitForFunction(() => document.fonts.ready.then(() => true));

  const title = page.getByLabel("Note title");
  const styles = await title.evaluate((el) => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight };
  });
  expect(styles.family).toContain("EB Garamond");
  expect(styles.size).toBe("40px");
  expect(styles.weight).toBe("400");

  const bodyStyles = await page.getByLabel("Note body").evaluate((el) => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, height: s.lineHeight };
  });
  expect(bodyStyles.family).toContain("EB Garamond");
  expect(bodyStyles.size).toBe("19px");
  expect(bodyStyles.height).toBe("33.25px");

  await expect(page.locator(".editor__reading-time")).toHaveText("1 min read");
  // The hash is how you write a tag, not what a tag is.
  await expect(page.locator(".editor__tags")).not.toContainText("#");
});

for (const theme of ["light", "dark"] as const) {
  test(`the note page holds together in ${theme}`, async ({ page }) => {
    await open(page, {
      body: "A short note.\n\nWith two paragraphs to look at.",
      theme,
    });
    await page.waitForFunction(() => document.fonts.ready.then(() => true));
    await expect(page.locator(".note-nav")).toBeVisible();
    await expect(page.locator(".editor")).toHaveScreenshot(
      `editor-${theme}.png`,
    );
  });
}
