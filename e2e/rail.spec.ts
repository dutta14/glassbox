import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const iso = (d: string) => new Date(d).toISOString();

const NOTES = [
  {
    id: "n1",
    title: "Postgres connection pooling",
    body: "pgbouncer in transaction mode. shared_buffers at 25% of RAM.",
    tags: ["db"],
    // Local noon, so the year heading holds in any timezone.
    createdAt: iso("2024-01-01T12:00:00"),
    updatedAt: iso("2024-03-02"),
  },
  {
    id: "n2",
    title: "Sourdough starter notes",
    body: "It was underfed. 1:5:5 at 26C fixed the rise.",
    tags: ["baking"],
    // Local noon, so the year heading holds in any timezone.
    createdAt: iso("2024-01-02T12:00:00"),
    updatedAt: iso("2024-03-01"),
  },
  {
    id: "n3",
    title: "Reading list, spring",
    body: "Seeing Like a State. The Mushroom at the End of the World.",
    tags: [],
    // Local noon, so the year heading holds in any timezone.
    createdAt: iso("2024-01-03T12:00:00"),
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

const BOOKS = [
  {
    id: "b1",
    title: "Spring shelf",
    chapterIds: ["n3"],
    createdAt: iso("2024-02-21"),
    updatedAt: iso("2024-02-21"),
  },
];

/**
 * Seeded before the app's first paint, so the rail renders with real content
 * instead of its empty states. addInitScript runs in the page before any of
 * the bundle does, and again on every reload, so only the fixture is written
 * here and anything the rail remembers for itself survives a reload.
 */
const seed = async (
  page: Page,
  theme: "dark" | "light",
  extra: Record<string, string> = {},
) => {
  await page.addInitScript(
    ([notes, conversations, books, mode, more]) => {
      localStorage.setItem("glassbox.notes.v1", notes);
      localStorage.setItem("glassbox.conversations.v1", conversations);
      localStorage.setItem("glassbox.books.v1", books);
      localStorage.setItem("glassbox.theme.v1", mode);
      // Marks the library as already seeded, so the app does not add its
      // sample notes on top of the fixture and make the shot non-deterministic.
      localStorage.setItem("glassbox.seeded.v1", "2024-01-01T00:00:00.000Z");
      for (const [key, value] of Object.entries(
        JSON.parse(more) as Record<string, string>,
      )) {
        localStorage.setItem(key, value);
      }
    },
    [
      JSON.stringify(NOTES),
      JSON.stringify(CONVERSATIONS),
      JSON.stringify(BOOKS),
      theme,
      JSON.stringify(extra),
    ] as [string, string, string, string, string],
  );
};

const rail = (page: Page) => page.locator(".notes-rail");
/** The one tabpanel: Posts or Collections, whichever tab is open. */
const noteList = (page: Page) => rail(page).getByRole("tabpanel");
const tab = (page: Page, name: "Posts" | "Collections") =>
  rail(page).getByRole("tab", { name });
const yearButton = (page: Page) =>
  rail(page).getByRole("heading", { level: 3 }).first().getByRole("button");

/* The third seeded note is shelved in a collection, so Posts does not list it. */
const NOTE_TITLES = ["Postgres connection pooling", "Sourdough starter notes"];

/** The rail is the Posts / Collections tabs. Questions live in the Ask pane. */
const expectExpandedRail = async (page: Page) => {
  await expect(tab(page, "Posts")).toHaveAttribute("aria-selected", "true");
  await expect(noteList(page).getByRole("listitem")).toHaveCount(
    NOTE_TITLES.length,
  );
};

for (const theme of ["dark", "light"] as const) {
  test.describe(`rail (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await seed(page, theme);
      await page.goto("/");
      await expectExpandedRail(page);
    });

    test("expanded", async ({ page }) => {
      await expect(rail(page)).toHaveScreenshot(`rail-expanded-${theme}.png`);
    });

    test("year collapsed", async ({ page }) => {
      // The year holding the open post stays open, so nothing is open here.
      await page.goto("/#/books");
      await yearButton(page).click();
      await expect(yearButton(page)).toHaveAttribute("aria-expanded", "false");
      await expect(noteList(page).getByRole("listitem")).toHaveCount(0);
      await expect(rail(page)).toHaveScreenshot(
        `rail-notes-collapsed-${theme}.png`,
      );
    });

    test("rail collapsed to the menu button", async ({ page }) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(
        page.getByRole("button", { name: "Open sidebar" }),
      ).toBeVisible();
      await expect(page).toHaveScreenshot(`rail-collapsed-${theme}.png`, {
        clip: { x: 0, y: 0, width: 420, height: 240 },
      });
    });

    test("header", async ({ page }) => {
      await expect(page.locator(".notes-rail__mast")).toHaveScreenshot(
        `rail-header-${theme}.png`,
      );
    });
  });
}

test.describe("rail behaviour", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, "light");
  });

  test("lists the posts under a year heading with the Collections tab beside them, and leaves past questions to the Ask pane", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);

    for (const title of NOTE_TITLES) {
      await expect(
        noteList(page).getByRole("button", { name: title, exact: true }),
      ).toBeVisible();
    }
    await expect(tab(page, "Collections")).toBeVisible();
    await expect(
      rail(page).getByRole("button", { name: "Collections" }),
    ).toHaveCount(0);
    await expect(
      rail(page).getByRole("button", { name: "Settings" }),
    ).toBeVisible();

    // The rail used to carry a Chats section. Seeded questions must not leak
    // back into it, and must still be reachable where they now live.
    await expect(
      rail(page).getByRole("heading", { name: /chats|questions/i }),
    ).toHaveCount(0);
    for (const c of CONVERSATIONS) {
      await expect(rail(page).getByText(c.title)).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Ask your notes" }).click();
    await page.getByRole("button", { name: "Past questions" }).click();
    const past = page.getByRole("group", { name: "Past questions" });
    for (const c of CONVERSATIONS) {
      await expect(
        past.getByRole("button", { name: c.title, exact: true }),
      ).toBeVisible();
    }
  });

  test("opening a note from the rail marks it as the current one", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);

    const row = noteList(page).getByRole("button", {
      name: "Sourdough starter notes",
      exact: true,
    });
    await row.click();

    await expect(page).toHaveURL(/#\/note\/n2$/);
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(
      page.getByRole("article", { name: "Sourdough starter notes" }),
    ).toBeVisible();
    // Exactly one row is current, so the previous note is not still marked.
    await expect(noteList(page).locator('[aria-current="true"]')).toHaveCount(
      1,
    );
  });

  test("a year heading folds its posts and the open tab survives a reload", async ({
    page,
  }) => {
    // The year holding the open post stays open, and the feed always has one,
    // so this starts on a page with no open post.
    await page.goto("/#/books");
    await expectExpandedRail(page);
    await expect(yearButton(page)).toHaveAttribute("aria-expanded", "true");

    await yearButton(page).click();
    await expect(yearButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(noteList(page).getByRole("listitem")).toHaveCount(0);

    await yearButton(page).click();
    await expect(noteList(page).getByRole("listitem")).toHaveCount(
      NOTE_TITLES.length,
    );

    await tab(page, "Collections").click();
    await page.reload();
    await expect(tab(page, "Collections")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("Collections lists the collection and Posts leaves shelved notes out", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      noteList(page).getByRole("button", { name: /Reading list/ }),
    ).toHaveCount(0);

    await tab(page, "Collections").click();
    await expect(
      noteList(page).getByRole("button", { name: /^Spring shelf/ }),
    ).toBeVisible();
    await expect(noteList(page).getByRole("heading")).toHaveCount(0);

    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "Posts")).toBeFocused();
    await expect(tab(page, "Posts")).toHaveAttribute("aria-selected", "true");
  });

  test("New collection turns into a name field, Esc cancels, Enter creates and opens an empty collection", async ({
    page,
  }) => {
    await page.goto("/");
    await tab(page, "Collections").click();
    await expect(
      noteList(page).getByRole("button", { name: /^Spring shelf/ }),
    ).toContainText("1 chapter");

    await noteList(page)
      .getByRole("button", { name: "New collection" })
      .click();
    const field = noteList(page).getByRole("textbox", {
      name: "Collection name",
    });
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);

    await noteList(page)
      .getByRole("button", { name: "New collection" })
      .click();
    await page.keyboard.press("Enter");
    await expect(field).toBeVisible();
    await page.keyboard.type("Winter drafts");
    await page.keyboard.press("Enter");

    const created = noteList(page).getByRole("button", {
      name: /^Winter drafts/,
    });
    await expect(created).toContainText("Empty");
    await expect(created).toHaveAttribute("aria-current", "true");
    await expect(page).toHaveURL(/#\/book\//);
  });

  test("Search opens inline over every note, marks the hit, and Esc puts the tabs back", async ({
    page,
  }) => {
    await page.goto("/");
    await rail(page).getByRole("button", { name: "Search notes" }).click();

    const field = rail(page).getByRole("searchbox", { name: "Search notes" });
    await expect(field).toBeFocused();
    await expect(rail(page).getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // "seeing" is only in the body of the shelved note, so it must still be found.
    await field.fill("seeing");
    const results = rail(page).getByRole("region", { name: "Search results" });
    await expect(results.getByText("1 result")).toBeVisible();
    await expect(results.locator(".note-item__snippet mark")).toHaveText(
      "Seeing",
    );
    await expect(results.locator(".note-item__meta")).toContainText(
      "January 3, 2024",
    );
    await expect(results.locator(".note-item__meta")).toContainText(
      "Spring shelf",
    );

    await field.fill("zzz");
    await expect(results.getByText("Nothing matches “zzz”.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
    await expect(tab(page, "Posts")).toHaveAttribute("aria-selected", "true");
    await expect(
      rail(page).getByRole("button", { name: "Search notes" }),
    ).toBeFocused();
  });

  test("collapsing the sidebar removes the rail and leaves a menu button, and the choice survives a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Open sidebar" }),
    ).toBeVisible();
    await expect(noteList(page)).toHaveCount(0);
    await expect(rail(page).getByText("Glassbox")).toHaveCount(0);
    await expect(rail(page).getByRole("tab")).toHaveCount(0);
    for (const name of ["New note", "Search notes", "Settings"]) {
      await expect(
        rail(page).getByRole("button", { name, exact: true }),
      ).toHaveCount(0);
    }

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Open sidebar" }),
    ).toBeVisible();
    await expect(noteList(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expectExpandedRail(page);
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
  });
});

const EMPTY_NOTES_COPY = "Nothing here yet. Start with the first line.";
const SMALL = { width: 390, height: 800 };
const EMPTY_LIBRARY = {
  "glassbox.notes.v1": "[]",
  "glassbox.books.v1": "[]",
};

test.describe("rail on a small screen", () => {
  test.use({ viewport: SMALL });
  test.beforeEach(async ({ page }) => {
    await seed(page, "light");
    await page.goto("/");
  });

  test("starts closed, and the menu button opens a drawer over a scrim", async ({
    page,
  }) => {
    await expect(noteList(page)).toHaveCount(0);
    const menu = page.getByRole("button", { name: "Open sidebar" });
    await menu.click();
    await expectExpandedRail(page);
    await expect(rail(page)).toHaveClass(/notes-rail--drawer/);
    await expect(page.locator(".notes-rail__scrim")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close sidebar" }),
    ).toBeFocused();
  });

  test("choosing a row closes the drawer and scrolls the feed to that post", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await noteList(page).getByText("Sourdough starter notes").click();
    await expect(noteList(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open sidebar" }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Sourdough starter notes" }).first(),
    ).toBeInViewport();
  });

  test("Esc closes the drawer and returns focus to the menu button", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expectExpandedRail(page);
    await page.keyboard.press("Escape");
    await expect(noteList(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open sidebar" }),
    ).toBeFocused();
  });

  test("clicking the scrim closes the drawer", async ({ page }) => {
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await page
      .locator(".notes-rail__scrim")
      .click({ position: { x: 370, y: 400 } });
    await expect(noteList(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open sidebar" }),
    ).toBeFocused();
  });

  test("Tab stays inside the open drawer", async ({ page }) => {
    await page.getByRole("button", { name: "Open sidebar" }).click();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest(".notes-rail"),
        ),
      ).toBe(true);
    }
  });

  test("the feed has 20px side padding, 32px titles and 96px between posts", async ({
    page,
  }) => {
    const inner = page.locator(".note-feed__inner");
    await expect(inner).toHaveCSS("padding-left", "20px");
    await expect(inner).toHaveCSS("padding-right", "20px");
    const posts = page.locator(".note-article");
    await expect(posts.first().getByRole("heading").first()).toHaveCSS(
      "font-size",
      "32px",
    );
    await expect(posts.nth(1)).toHaveCSS("margin-top", "96px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("the editor's Done button is at least 44px square", async ({ page }) => {
    await page.goto("/#/note/n2?edit=1");
    const done = page.getByRole("button", { name: "Done" });
    await expect(done).toBeVisible();
    await expect
      .poll(async () => (await done.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(44);
    await expect
      .poll(async () => (await done.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  });
});

test.describe("rail empty and first-run states", () => {
  test("with no notes the rail says so, the feed message is centred and New stays available", async ({
    page,
  }) => {
    await seed(page, "light", EMPTY_LIBRARY);
    await page.goto("/");
    await expect(noteList(page)).toContainText(EMPTY_NOTES_COPY);
    const message = page.locator(".note-feed__empty");
    await expect(message).toHaveText(EMPTY_NOTES_COPY);
    await expect(message).toHaveCSS("text-align", "center");
    await expect(
      rail(page).getByRole("button", { name: "New note", exact: true }),
    ).toBeEnabled();
  });

  test("with no collections the Collections tab says how to start one", async ({
    page,
  }) => {
    await seed(page, "light", { "glassbox.books.v1": "[]" });
    await page.goto("/");
    await tab(page, "Collections").click();
    await expect(noteList(page)).toContainText("No collections yet.");
  });

  test("an empty collection's page says it is empty", async ({ page }) => {
    await seed(page, "light", {
      "glassbox.books.v1": JSON.stringify([
        {
          id: "b2",
          title: "Winter",
          chapterIds: [],
          createdAt: iso("2024-02-21"),
          updatedAt: iso("2024-02-21"),
        },
      ]),
    });
    await page.goto("/#/book/b2");
    await expect(page.getByText("No chapters yet.")).toBeVisible();
  });

  test("search prompts before typing and says 'Nothing to show.' when nothing matches", async ({
    page,
  }) => {
    await seed(page, "light");
    await page.goto("/");
    await rail(page).getByRole("button", { name: "Search notes" }).click();
    await expect(page.locator(".note-feed__empty")).toHaveText(
      "Results open here as you type.",
    );
    await rail(page).getByRole("searchbox").fill("zzzzz");
    await expect(page.locator(".note-feed__empty")).toHaveText(
      "Nothing to show.",
    );
    await expect(page.locator(".notes-rail__status")).toContainText("Nothing");
  });
});

test.describe("rail keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, "light");
    await page.goto("/");
  });

  test("the tablist moves with the arrow keys, Home and End, and the focused tab opens", async ({
    page,
  }) => {
    await tab(page, "Posts").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Collections")).toBeFocused();
    await expect(tab(page, "Collections")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Posts")).toBeFocused();
    await page.keyboard.press("End");
    await expect(tab(page, "Collections")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tab(page, "Posts")).toBeFocused();
    await expect(noteList(page)).toHaveAttribute("aria-labelledby", /.+/);
  });

  test("the open post's row carries aria-current and a visible focus ring on Tab", async ({
    page,
  }) => {
    await page.goto("/#/note/n2");
    await expect(
      noteList(page).locator('[aria-current="true"], [aria-current="page"]'),
    ).toHaveCount(1);
    await tab(page, "Posts").focus();
    await page.keyboard.press("Tab");
    const shadow = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).boxShadow,
    );
    expect(shadow).not.toBe("none");
  });

  test("Tab leaves the search field without a trap", async ({ page }) => {
    await rail(page).getByRole("button", { name: "Search notes" }).click();
    const field = rail(page).getByRole("searchbox");
    await expect(field).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field).not.toBeFocused();
  });
});
