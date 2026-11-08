import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

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

const seed = async (page: Page, conversations: unknown[] = []) => {
  await page.addInitScript(
    ([iso, stored]) => {
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
        ]),
      );
      localStorage.setItem("glassbox.seeded.v1", "x");
      localStorage.setItem("glassbox.theme.v1", "light");
      if (stored) localStorage.setItem("glassbox.conversations.v1", stored);
    },
    [ISO, conversations.length ? JSON.stringify(conversations) : ""],
  );
  await page.goto("/");
  // Sample notes would mean the fixture never landed. Fail here, not on a
  // 30s locator timeout pointing nowhere.
  await expect(page.getByText("These are sample notes")).toHaveCount(0);
  await openAsk(page);
};

/** Ask lives in a side pane that starts shut, opened by the floating button. */
const openAsk = async (page: Page) => {
  await page.getByRole("button", { name: "Ask your notes" }).click();
  await expect(page.getByRole("complementary", { name: "Ask" })).toBeVisible();
};

const ask = async (page: Page, q: string) => {
  const input = page.getByRole("textbox", { name: "Ask a question" });
  await input.fill(q);
  await input.press("Enter");
};

const newQuestion = async (page: Page) => {
  await page.getByRole("button", { name: "New question" }).click();
  // A draft has no transcript, so the composer sits under the empty state.
  await expect(
    page.getByRole("heading", { name: "Ask what you've written" }),
  ).toBeVisible();
};

/** Past questions are a drawer over the pane; picking a row closes it again. */
const reopenThread = async (page: Page, title: string) => {
  await page.getByRole("button", { name: "Past questions" }).click();
  await page
    .getByRole("group", { name: "Past questions" })
    .getByRole("button", { name: title, exact: true })
    .click();
  await expect(page.getByRole("group", { name: "Past questions" })).toHaveCount(
    0,
  );
};

/**
 * The disclosure summary is named by its confidence line ("High confidence ·
 * from Sourdough starter · 1 of 1 passages"), so match on that rather than on
 * a label it does not have.
 */
const reasoningPanels = (page: Page) =>
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
    "false",
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

  await newQuestion(page);
  await ask(page, "six hours");
  await expect(reasoningPanels(page)).toHaveCount(1);

  await reopenThread(page, "starter");

  // The first thread is what is on screen, not the second one.
  const log = page.getByRole("list", { name: "Conversation" });
  const sent = (text: RegExp) =>
    log.getByRole("listitem").filter({ hasText: text });
  await expect(sent(/^starter$/)).toBeVisible();
  await expect(sent(/^six hours$/)).toHaveCount(0);
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("a second conversation does not expand its own first answer", async ({
  page,
}) => {
  await seed(page);

  await ask(page, "starter");
  await newQuestion(page);
  await ask(page, "six hours");

  await expect(reasoningPanels(page)).toHaveCount(1);
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

/**
 * Isolates the clearing done by select(). The test above happens to route
 * through "New question", which does not clear, so it cannot cover for it.
 * Here the only navigation is between two existing threads, so nothing else
 * can.
 */
test("switching to another thread and back does not re-expand", async ({
  page,
}) => {
  const iso = ISO;
  // A thread that already exists, so the user can move between two
  // conversations without ever starting a draft.
  await seed(page, [
    {
      id: "c-old",
      title: "An older thread",
      messages: [],
      createdAt: iso,
      updatedAt: iso,
    },
  ]);

  await ask(page, "starter");
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await reopenThread(page, "An older thread");
  // The older thread has no answers, which proves the switch happened.
  await expect(reasoningPanels(page)).toHaveCount(0);

  await reopenThread(page, "starter");

  await expect(reasoningPanels(page)).toHaveCount(1);
  await expect(reasoningPanels(page).first()).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
