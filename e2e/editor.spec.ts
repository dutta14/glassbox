import { test, expect } from "@playwright/test";

/* The note body grows to fit its text so the section scrolls the whole note as
   one document. That arrangement is invisible to jsdom, which has no layout,
   and it is exactly the sort of thing a stray flex rule squashes back down. So
   it is measured in a real browser. */

const LONG = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i + 1}. ${"The quick brown fox jumps over it. ".repeat(3)}`,
).join("\n\n");

const VERSE = [
  "Walking the long road home in the falling light,",
  "Wondering why the lamps came on so early,",
  "",
  "I counted every window on the street,",
  "And found the one I used to know by heart,",
].join("\n");

const init = ({
  body,
  theme,
  format,
}: {
  body: string;
  theme: "light" | "dark";
  format?: "prose" | "verse";
}) => {
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
        ...(format === undefined ? {} : { format }),
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
    format = undefined as "prose" | "verse" | undefined,
  } = {},
) => {
  await page.addInitScript(init, { body, theme, format });
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
/**
 * How a reader actually starts writing. The note is rendered as prose so it can
 * carry a drop cap, and the field waits underneath until it is wanted, so the
 * prose is what receives the click. Clicking the field directly does not work
 * and is not something anyone does.
 */
const startWriting = async (page: import("@playwright/test").Page) => {
  await page.locator(".editor__read").click();
  const body = page.getByLabel("Note body");
  await expect(body).toBeFocused();
  return body;
};

test("clicking the prose hands over to the field, ready to type", async ({
  page,
}) => {
  await open(page);

  await expect(page.locator(".editor__read")).toBeVisible();
  await startWriting(page);
  // The prose steps aside rather than sitting over the text being typed.
  await expect(page.locator(".editor__read")).toHaveCount(0);
});

test("the drop cap is withheld from a note too short to carry one", async ({
  page,
}) => {
  await open(page, { title: "The older note that came before it" });

  await expect(page.locator(".editor__read")).not.toHaveAttribute(
    "data-dropcap",
  );
});

test("typing at the end of a long note keeps the caret in view", async ({
  page,
}) => {
  await open(page);

  const body = await startWriting(page);
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

/* Verse is laid out by measuring the reading view, and a measurement is only
   ever as good as the moment it was taken. jsdom has no layout at all, so none
   of this can be caught anywhere but here. */
test("a poem is centred as a block with its lines left aligned", async ({
  page,
}) => {
  await open(page, { body: VERSE, format: "verse" });
  await page.evaluate(() => document.fonts.ready);

  const read = page.locator(".editor__read");
  const box = (await read.boundingBox())!;

  // The column is exactly as wide as the poem's longest line. Measuring before
  // the serif loads reports the fallback's wider metrics and the poem then sits
  // off centre for the life of the note, which is the bug this pins.
  const widest = await read.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Math.max(...Array.from(range.getClientRects()).map((r) => r.width));
  });
  expect(Math.abs(box.width - widest)).toBeLessThan(1.5);

  // And the block is centred on the same axis as the title above it.
  const title = (await page.getByLabel("Note title").boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (title.x + title.width / 2))).toBeLessThan(2);
});

test("a poem does not shift when it is clicked to start writing", async ({
  page,
}) => {
  await open(page, { body: VERSE, format: "verse" });
  await page.evaluate(() => document.fonts.ready);

  const before = (await page.locator(".editor__read").boundingBox())!;
  await page.locator(".editor__read").click();
  await expect(page.getByLabel("Note body")).toBeFocused();
  const after = (await page.getByLabel("Note body").boundingBox())!;

  expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
  expect(Math.abs(after.width - before.width)).toBeLessThan(1.5);
});

test("a poem line longer than the column stays inside it", async ({ page }) => {
  const long = `${"A line far longer than the column can hold ".repeat(4)}\nShort one.`;
  await open(page, { body: long, format: "verse" });
  await page.evaluate(() => document.fonts.ready);

  const read = (await page.locator(".editor__read").boundingBox())!;
  const wrap = (await page.locator(".editor__bodywrap").boundingBox())!;

  expect(read.width).toBeLessThanOrEqual(wrap.width + 1);
});

test("a poem is never given a chapter drop cap", async ({ page }) => {
  await open(page, { body: VERSE, format: "verse" });

  await expect(page.locator(".editor__read")).not.toHaveAttribute("data-dropcap");
});
