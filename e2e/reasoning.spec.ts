import { test, expect } from "@playwright/test";

/**
 * AC 13 says the first assistant message of a *session* opens its reasoning
 * expanded. The hook tests pin that rule, but only the browser proves the
 * wiring through App -> ChatPanel -> ChatMessage -> ReasoningDisclosure, and
 * only the browser can reopen a conversation the way a user does.
 *
 * The reported bug lived in that reopening: every thread has a first answer,
 * so scoping the rule per conversation reopened a panel the user had closed.
 */

const ISO = new Date("2024-01-01").toISOString();

const seed = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(
    ([iso]) => {
      localStorage.setItem(
        "glassbox.notes.v1",
        JSON.stringify([
          {
            id: "n1",
            title: "Sourdough starter",
            body: "The starter doubles in about six hours at room temperature.",
            tags: [],
            createdAt: iso,
            updatedAt: iso,
          },
        ])
      );
      localStorage.setItem("glassbox.seeded.v1", "x");
      localStorage.setItem("glassbox.theme.v1", "light");
    },
    [ISO]
  );
  await page.goto("/");
  // Sample notes would mean the fixture never landed. Fail here, not on a
  // 30s locator timeout pointing nowhere.
  await expect(page.getByText("These are sample notes")).toHaveCount(0);
};

const ask = async (page: import("@playwright/test").Page, q: string) => {
  const input = page.getByRole("textbox", { name: /ask/i });
  await input.fill(q);
  await input.press("Enter");
};

/**
 * The disclosure summary is named by its confidence line ("High confidence ·
 * from Sourdough starter · 1 of 1 passages"), so match on that rather than on
 * a label it does not have.
 */
const reasoningPanels = (page: import("@playwright/test").Page) =>
  page.getByRole("button", {
    // Anchored: an expanded panel also contains "Open source note ... high
    // confidence ...", which an unanchored match would count as a panel.
    name: /^(High|Medium|Low) confidence|^No match/,
  });

test("the first answer of the session expands its reasoning, later ones do not", async ({
  page,
}) => {
  await seed(page);

  await ask(page, "starter");
  const first = reasoningPanels(page).first();
  await expect(first).toHaveAttribute("aria-expanded", "true");

  await ask(page, "room temperature");
  await expect(reasoningPanels(page)).toHaveCount(2);
  await expect(reasoningPanels(page).nth(1)).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});

test("reopening a conversation does not re-expand reasoning the user closed", async ({
  page,
}) => {
  await seed(page);

  await ask(page, "starter");
  const panel = reasoningPanels(page).first();
  await expect(panel).toHaveAttribute("aria-expanded", "true");

  // The user closes it. That choice has to survive leaving and coming back.
  await panel.click();
  await expect(panel).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: /new chat/i }).click();
  await ask(page, "six hours");

  // Back to the first thread.
  await page
    .getByRole("button", { name: /starter/i })
    .first()
    .click();

  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});

test("a second conversation does not expand its own first answer", async ({
  page,
}) => {
  await seed(page);

  await ask(page, "starter");
  await page.getByRole("button", { name: /new chat/i }).click();
  await ask(page, "six hours");

  await expect(reasoningPanels(page)).toHaveCount(1);
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});

/**
 * Isolates the clearing done by select(). The test above happens to route
 * through "New chat", which clears too, so it passed even with select's clear
 * removed. Here the only navigation is between two existing threads, so
 * nothing else can cover for it.
 */
test("switching to another thread and back does not re-expand", async ({
  page,
}) => {
  await page.addInitScript(
    ([iso]) => {
      localStorage.setItem(
        "glassbox.notes.v1",
        JSON.stringify([
          {
            id: "n1",
            title: "Sourdough starter",
            body: "The starter doubles in about six hours at room temperature.",
            tags: [],
            createdAt: iso,
            updatedAt: iso,
          },
        ])
      );
      localStorage.setItem("glassbox.seeded.v1", "x");
      localStorage.setItem("glassbox.theme.v1", "light");
      // A thread that already exists, so the user can move between two
      // conversations without ever starting a draft.
      localStorage.setItem(
        "glassbox.conversations.v1",
        JSON.stringify([
          {
            id: "c-old",
            title: "An older thread",
            messages: [],
            createdAt: iso,
            updatedAt: iso,
          },
        ])
      );
    },
    [ISO]
  );
  await page.goto("/");
  await expect(page.getByText("These are sample notes")).toHaveCount(0);

  await ask(page, "starter");
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "true"
  );

  await page
    .getByRole("button", { name: "An older thread", exact: true })
    .click();
  await page.getByRole("button", { name: "starter", exact: true }).click();

  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});
