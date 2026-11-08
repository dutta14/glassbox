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
const noteList = (page: Page) =>
  page.getByRole("navigation", { name: "Note list" });
const notesButton = (page: Page) =>
  rail(page).getByRole("button", { name: "Notes", exact: true });
const flyoutPanel = (page: Page, name: "Notes" | "Books") =>
  page.getByRole("group", { name });

const NOTE_TITLES = [
  "Postgres connection pooling",
  "Sourdough starter notes",
  // A shelved note is named with its book, which is how the row reads aloud.
  "Reading list, spring, in Spring shelf",
];

/** The rail is the notes and books list. Questions live in the Ask pane. */
const expectExpandedRail = async (page: Page) => {
  await expect(
    rail(page).getByRole("heading", { name: "Notes" }),
  ).toBeVisible();
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

    test("notes section collapsed", async ({ page }) => {
      await notesButton(page).click();
      await expect(notesButton(page)).toHaveAttribute("aria-expanded", "false");
      await expect(noteList(page)).toBeHidden();
      await expect(rail(page)).toHaveScreenshot(
        `rail-notes-collapsed-${theme}.png`,
      );
    });

    test("rail collapsed to icons", async ({ page }) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(
        page.getByRole("button", { name: "Expand sidebar" }),
      ).toBeVisible();
      await expect(rail(page)).toHaveScreenshot(`rail-icons-${theme}.png`);
    });

    test("collapsed notes flyout open", async ({ page }) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await notesButton(page).click();
      await expect(flyoutPanel(page, "Notes")).toBeVisible();
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

test.describe("rail behaviour", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, "light");
  });

  test("lists the notes and the Books entry, and leaves past questions to the Ask pane", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);

    for (const title of NOTE_TITLES) {
      await expect(
        noteList(page).getByRole("button", { name: title, exact: true }),
      ).toBeVisible();
    }
    await expect(
      rail(page).getByRole("button", { name: "Books" }),
    ).toBeVisible();
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
    await expect(page.getByLabel("Note title")).toHaveValue(
      "Sourdough starter notes",
    );
    // Exactly one row is current, so the previous note is not still marked.
    await expect(noteList(page).locator('[aria-current="true"]')).toHaveCount(
      1,
    );
  });

  test("the Notes heading collapses the list and the choice survives a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);
    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "true");

    await notesButton(page).click();
    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(noteList(page)).toBeHidden();

    await page.reload();
    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(noteList(page)).toBeHidden();

    await notesButton(page).click();
    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(noteList(page).getByRole("listitem")).toHaveCount(
      NOTE_TITLES.length,
    );
  });

  test("organizing by book gives books their own collapsible section and takes shelved notes out of the Notes list", async ({
    page,
  }) => {
    await seed(page, "light", { "glassbox.notesOrganize.v1": "book" });
    await page.goto("/");

    const booksToggle = rail(page).getByRole("button", {
      name: "Books",
      exact: true,
    });
    const bookList = page.getByRole("navigation", { name: "Books" });
    await expect(booksToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      bookList.getByRole("button", { name: /^Spring shelf/ }),
    ).toBeVisible();
    // n3 is shelved, so only the two loose notes remain in the Notes list.
    await expect(noteList(page).getByRole("listitem")).toHaveCount(2);
    await expect(
      noteList(page).getByRole("button", { name: /Reading list/ }),
    ).toHaveCount(0);

    await booksToggle.click();
    await expect(booksToggle).toHaveAttribute("aria-expanded", "false");
    await expect(bookList).toBeHidden();
  });

  test("collapsing the sidebar swaps the labelled list for icon buttons, and the choice survives a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expectExpandedRail(page);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");
    // Nothing in a one-icon-wide rail can show a list or a title.
    await expect(noteList(page)).toHaveCount(0);
    await expect(rail(page).getByText("Glassbox")).toHaveCount(0);
    for (const name of [
      "New note",
      "Search notes",
      "Books",
      "Notes",
      "Settings",
    ]) {
      await expect(
        rail(page).getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" }),
    ).toBeVisible();
    await expect(noteList(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expectExpandedRail(page);
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("the collapsed Notes flyout lists every note, opens one, and closes itself", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    await notesButton(page).click();
    const panel = flyoutPanel(page, "Notes");
    await expect(panel).toBeVisible();
    for (const title of NOTE_TITLES) {
      await expect(
        panel.getByRole("button", { name: title, exact: true }),
      ).toBeVisible();
    }

    await panel
      .getByRole("button", { name: "Sourdough starter notes", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/note\/n2$/);
    await expect(page.getByLabel("Note title")).toHaveValue(
      "Sourdough starter notes",
    );
    await expect(panel).toHaveCount(0);
  });

  test("Escape closes the collapsed Notes flyout and returns focus to its icon", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    const trigger = notesButton(page);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(flyoutPanel(page, "Notes")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(flyoutPanel(page, "Notes")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("the collapsed Books flyout lists the book with its chapter count and opens it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    await rail(page)
      .getByRole("button", { name: "Books", exact: true })
      .click();
    const panel = flyoutPanel(page, "Books");
    const book = panel.getByRole("button", { name: /^Spring shelf/ });
    await expect(book).toContainText("1 chapter");

    await book.click();
    await expect(page).toHaveURL(/#\/book\/b1$/);
    await expect(panel).toHaveCount(0);
  });
});
