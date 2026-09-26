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
  await expect(page.locator("#s-players")).toHaveText("1");
  await expect(page.locator("#nav-account")).toHaveText("Log In");
  await expect(page.locator("#mobileAccountLabel")).toHaveText("Log In");
  await expect(
    page.locator(
      'nav [data-click="openAdmin"], #mobTabs [data-click="openAdmin"]',
    ),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("history", [
      {
        gameId: "account-past",
        date: "Sep 21, 2026",
        gameName: "Monday game",
        seriesId: "s_wickedwolf",
        results: [{ key: "alice", name: "Alice", pos: 1, pts: 25 }],
      },
    ]);
  });
});

test("player sign-in shows personal stats, check-in and private settings without admin controls", async ({
  page,
}) => {
  await page.locator("#nav-account").click();
  await page.locator("#accountEmail").fill("alice@example.test");
  await page.locator("#accountPassword").fill("test-only");
  await page.locator("#accountPassword").press("Enter");
  await expect(page.locator("#accountTitle")).toHaveText("Hey, Alice");
  await expect(page.locator("#nav-account")).toHaveText("My Account");
  await expect(page.locator("#accountContent")).toContainText("25 points");
  await expect(page.locator("#accountHeadingActions")).not.toContainText(
    "Admin view",
  );
  await page.locator('[data-click="accountCheckIn"]').click();
  await expect(page.locator("#accountContent")).toContainText(
    "You’re checked in",
  );
  await page.locator("#accountSettings summary").click();
  await page.locator("#accountPhone").fill("4045551234");
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const history = LS.get("history");
    LS.applyRemote("history", [
      ...history,
      ...["second", "third"].map((gameId) => ({
        gameId,
        date: "Sep 23, 2026",
        gameName: "Another game",
        seriesId: "s_wickedwolf",
        results: [{ key: "alice", name: "Alice", pos: 1, pts: 25 }],
      })),
    ]);
  });
  await expect(page.locator("#accountPhone")).toHaveValue("4045551234");
  await expect(page.locator("#accountContent")).toContainText("75 points");
  await page.locator("#accountDisplayName").fill("Alice A.");
  await page.locator('#accountProfileForm button[type="submit"]').click();
  await expect(page.locator("#accountTitle")).toHaveText("Hey, Alice A.");
  await page.locator('[data-click="accountSignOut"]').click();
  await expect(page.locator("#accountAuthForm")).toBeVisible();
  await expect(page.locator("#nav-account")).toHaveText("Log In");
  await expect(page.locator("#accountPhone")).toHaveCount(0);
});
test("new players verify email and request approval, and password recovery works signed out", async ({
  page,
}) => {
  await page.locator("#nav-account").click();
  await page
    .locator('[data-click="accountAuthMode"][data-arg0="reset"]')
    .click();
  await page.locator("#accountEmail").fill("alice@example.test");
  await page.locator('#accountAuthForm button[type="submit"]').click();
  await expect(page.locator("#accountAuthMessage")).toContainText("reset link");
  await page
    .locator('[data-click="accountAuthMode"][data-arg0="signin"]')
    .click();
  await page
    .locator('[data-click="accountAuthMode"][data-arg0="signup"]')
    .click();
  await page.locator("#accountEmail").fill("new@example.test");
  await page.locator("#accountPassword").fill("new-password");
  await page.locator('#accountAuthForm button[type="submit"]').click();
  await expect(page.locator("#accountContent")).toContainText(
    "Verify your email",
  );
  await page.locator('[data-click="accountRefreshUser"]').click();
  await page.locator("#accountPlayerKey").selectOption("alice");
  await page.locator('#accountLinkForm button[type="submit"]').click();
  await expect(page.locator("#accountContent")).toContainText(
    "Profile request sent",
  );
});
test("personal page fits mobile and clears failed sign-in state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobt-account").click();
  await page.locator("#accountEmail").fill("alice@example.test");
  await page.locator("#accountPassword").fill("bad-password");
  await page.locator('#accountAuthForm button[type="submit"]').click();
  await expect(page.locator("#accountAuthMessage")).toContainText(
    "Invalid credentials",
  );
  await page.locator("#accountPassword").fill("test-only");
  await page.locator('#accountAuthForm button[type="submit"]').click();
  await expect(page.locator("#accountTitle")).toHaveText("Hey, Alice");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/personal-mobile.png",
    fullPage: true,
  });
});
test("admin signing in through My Stats opens admin view and can return to personal page", async ({
  page,
}) => {
  await page.locator("#nav-account").click();
  await page.locator("#accountEmail").fill("admin@example.test");
  await page.locator("#accountPassword").fill("test-only");
  await page.locator('#accountAuthForm button[type="submit"]').click();
  await expect(page.locator("#adminOverlay")).toHaveClass(/open/);
  await expect(page.locator("#adminBody")).toContainText(
    "Player Account Requests",
  );
  await page.locator('[data-click="closeAdmin"]').click();
  await expect(page.locator("#accountHeadingActions")).toContainText(
    "Admin view",
  );
  await page.locator("#nav-home").click();
  await page.locator("#nav-account").click();
  await expect(page.locator("#adminOverlay")).toHaveClass(/open/);
});
