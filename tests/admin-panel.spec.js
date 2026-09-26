import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const mock = await readFile(
  new URL("./mock-firebase.js", import.meta.url),
  "utf8",
);
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/js/firebase.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: mock }),
  );
  await page.goto("/");
  await page.locator("#nav-account").click();
  await page.locator("#accountEmail").fill("admin@example.test");
  await page.locator("#accountPassword").fill("test-only");
  await page.locator("#accountPassword").press("Enter");
  await expect(page.locator("#adminOverlay")).toBeVisible();
});
test("empty series validation is visible at the form and names appear in confirmations", async ({
  page,
}) => {
  await page.locator("#adminBody summary").click();
  await page.getByRole("button", { name: "Save Series" }).click();
  await expect(page.locator("#seriesError")).toHaveText(
    "Please enter a name and venue.",
  );
  await expect(page.locator("#seriesError")).toBeInViewport();
  await page
    .getByRole("button", { name: "Delete series Wicked Wolf League" })
    .click();
  await expect(page.locator("#aconfirm-msg")).toContainText(
    '"Wicked Wolf League"',
  );
  await expect(page.locator("#aconfirm")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.locator("#aconfirm")).toHaveCount(0);
  await expect(page.locator("#adminOverlay")).toBeVisible();
});
test("edit saves contacts and traps focus; Escape closes one layer at a time", async ({
  page,
}) => {
  await page.locator('[data-click="openEditPlayer"]').click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("fixed@example.test");
  await page
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("4045550100");
  await page.locator('[data-click="deletePlayerProfile"]').focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#ep_name")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.locator('[data-click="deletePlayerProfile"]'),
  ).toBeFocused();
  await page.locator('[data-click="saveEditPlayer"]').click();
  await expect(page.locator("#playerDataBody")).toContainText(
    "fixed@example.test",
  );
  await page.locator('[data-click="openEditPlayer"]').click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#editPlayerOverlay")).toHaveCount(0);
  await expect(page.locator('[data-click="openEditPlayer"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#adminOverlay")).toBeHidden();
});
test("history details support keyboard and mobile keeps identity beside Edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const details = page.locator('[data-click="toggleGameHist"]');
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await page.locator("#playerTableWrap").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const edit = page.locator('[data-click="openEditPlayer"]');
  await edit.scrollIntoViewIfNeeded();
  await expect(edit).toBeInViewport();
  await expect(page.locator("#playerDataBody td").first()).toContainText(
    "Alice",
  );
  const close = page.locator('[data-click="closeAdmin"]');
  await close.scrollIntoViewIfNeeded();
  expect(
    await page
      .locator("#adminOverlay")
      .evaluate((el) => getComputedStyle(el).zIndex),
  ).toBe("1000");
  expect(
    await page.locator("#mobt-games").evaluate((el) => !!el.closest("[inert]")),
  ).toBe(true);
});

test("merge names both players, submits stable keys and keeps errors in the popup", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("players", {
      ...LS.get("players"),
      duplicate: { key: "duplicate", dn: "ALICE 1" },
    });
    const { configureCommands } = await import("/js/commands.js");
    configureCommands(async (request) => {
      window.mergeRequest = request;
      throw new Error(
        "These players have conflicting results in the same game.",
      );
    });
  });
  await page
    .locator('[data-click="openEditPlayer"][data-arg0="duplicate"]')
    .click();
  await page.locator("#ep_merge").selectOption("alice");
  await page.getByRole("button", { name: "Merge duplicate" }).click();
  await expect(page.locator("#aconfirm-msg")).toContainText(
    'Merge "ALICE 1" into "Alice"',
  );
  await page.locator("#aconfirm-yes").click();
  await expect(page.locator("#confirmError")).toContainText(
    "conflicting results",
  );
  expect(await page.evaluate(() => window.mergeRequest)).toMatchObject({
    action: "mergePlayers",
    sourceKey: "duplicate",
    targetKey: "alice",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#editPlayerOverlay")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Merge duplicate" }),
  ).toBeFocused();
});
