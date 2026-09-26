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
});
async function login(page) {
  await page.locator("#nav-account").click();
  await page.locator("#accountEmail").fill("admin@example.test");
  await page.locator("#accountPassword").fill("test-only");
  await page.locator("#accountPassword").press("Enter");
  await expect(page.locator("#adminBody")).toContainText("Game Control");
}
test("navigation, logo, rules and rankings work without globals or inline handlers", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator("#homeHeroLogo")).toBeVisible();
  expect(
    await page
      .locator("#homeHeroLogo")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBeTruthy();
  for (const tab of [
    "about",
    "rankings",
    "games",
    "rules",
    "restrictions",
    "home",
  ]) {
    await page.locator("#nav-" + tab).click();
    await expect(page.locator("#page-" + tab)).toBeVisible();
  }
  await page.locator("#nav-rankings").click();
  await expect(page.locator("#monthly-rankings")).toContainText("Alice");
  expect(await page.evaluate(() => typeof window.go)).toBe("undefined");
  expect(
    await page
      .locator("[onclick],[oninput],[onchange],[onkeydown],[onmousedown]")
      .count(),
  ).toBe(0);
  expect(errors).toEqual([]);
});
test("public registration handles apostrophes and keyboard selection", async ({
  page,
}) => {
  await page.locator("#nav-games").click();
  await page.locator("#pubSearchInput").fill("O'Brien");
  await page.locator("#pubSearchInput").press("ArrowDown");
  await page.locator("#pubSearchInput").press("Enter");
  await expect(page.locator("#pubNpForm")).toBeVisible();
  await page.locator("#pubNpEmail").fill("obrien@example.test");
  await page.locator('[data-click="pubSubmitNewPlayer"]').click();
  await expect(page.locator(".pchip-name")).toHaveText("O'Brien");
  await page.locator("#pubSearchInput").fill("Alice");
  await page.locator("#pubSearchInput").press("ArrowDown");
  await page.locator("#pubSearchInput").press("Enter");
  await expect(page.locator(".pchip-name")).toHaveText(["O'Brien", "Alice"]);
});
test("admin check-in, timer pause/resume and scoring preserve persisted state", async ({
  page,
}) => {
  await login(page);
  await page.locator("#adminSearchInput").fill("Alice");
  await page.locator('[data-mousedown="adminCheckIn"]').click();
  await expect(page.locator("#adminBody")).toContainText(
    "Tonight's Check-Ins (1)",
  );
  await page.locator('[data-click="adminTimerResume"]').click();
  await expect(page.locator('[data-click="adminTimerPause"]')).toBeVisible();
  await page.waitForTimeout(1100);
  await page.locator('[data-click="adminTimerPause"]').click();
  const paused = await page.evaluate(async () =>
    (await import("/js/state.js")).getTimerState(),
  );
  expect(paused.running).toBe(false);
  expect(paused.pausedRemaining).toBeLessThan(900000);
  await page
    .locator('[data-click="adminSetState"][data-arg0="closeRegistration"]')
    .click();
  await page.locator(".fsel").selectOption("1");
  await page.locator('[data-click="submitResults"]').click();
  await expect(page.locator("#adminBody")).toContainText("Game completed");
  const state = await page.evaluate(async () => {
    const { getPlayers, getHistory } = await import("/js/state.js");
    return { p: getPlayers().alice, h: getHistory() };
  });
  expect(state.p.total).toBe(50);
  expect(state.p.games).toBe(2);
  expect(state.h).toHaveLength(2);
  await page.locator('[data-click="logout"]').click();
  await expect(page.locator("#accountEmail")).toBeVisible();
});
test("remote updates refresh rankings and timer while keeping a registration draft", async ({
  page,
}) => {
  await page.locator("#nav-games").click();
  await page.locator("#pubSearchInput").fill("Draft Player");
  await page.locator('[data-mousedown="pubCreateAndCheckIn"]').click();
  await page.locator("#pubNpEmail").fill("draft@example.test");
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("history", [
      ...LS.get("history"),
      {
        gameId: "remote",
        date: "Sep 24, 2026",
        results: [{ key: "alice", pos: 1, pts: 25 }],
      },
    ]);
    LS.applyRemote("timerState", {
      levelIdx: 1,
      levelStartTs: Date.now(),
      pausedRemaining: null,
      running: true,
    });
  });
  await expect(page.locator("#home-rankings .pts-pill")).toHaveText("50");
  await expect(page.locator("#s-games")).toHaveText("2");
  await expect(page.locator("#pubNpEmail")).toHaveValue("draft@example.test");
  await expect(page.locator("#pubNpName")).toHaveText("Draft Player");
  await expect(page.locator("#pubNpForm")).toBeVisible();
  await page.locator('[data-click="go"][data-arg0="tv"]').first().click();
  await expect(page.locator("#page-tv")).toBeVisible();
  await expect(page.locator("#tvTimerContent")).toContainText("200 / 400");
});
test("mobile navigation and admin sign-in remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobt-games").click();
  await expect(page.locator("#pubSearchInput")).toBeVisible();
  await page.locator("#mobt-rankings").click();
  await expect(page.locator("#page-rankings")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("a failed lifecycle save leaves registration unchanged and shows an error", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("simulateFailure", true);
  });
  await page
    .locator('[data-click="adminSetState"][data-arg0="closeRegistration"]')
    .click();
  await expect(page.locator("#toast")).toContainText("Not saved");
  await expect(page.locator("#adminBody")).toContainText("Check-in OPEN");
});
test("timer updates do not replace a focused registration field and preserve selection", async ({
  page,
}) => {
  await page.locator("#nav-games").click();
  await page.locator("#pubSearchInput").fill("Draft");
  await page.locator('[data-mousedown="pubCreateAndCheckIn"]').click();
  await page.locator("#pubNpPhone").fill("123456");
  await page.locator("#pubNpPhone").evaluate((el) => {
    el.setSelectionRange(2, 4);
    el.dataset.identity = "original";
  });
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("timerState", {
      levelIdx: 0,
      levelStartTs: Date.now() - 1800000,
      running: true,
      pausedRemaining: null,
    });
  });
  await expect(page.locator("#pubNpPhone")).toHaveAttribute(
    "data-identity",
    "original",
  );
  expect(
    await page
      .locator("#pubNpPhone")
      .evaluate((el) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([2, 4]);
  await expect(page.locator(".bc-level-label")).toContainText("Level 3");
});
test("remote attendance preserves finishing-position drafts and completed games have no start control", async ({
  page,
}) => {
  await login(page);
  await page.locator("#adminSearchInput").fill("Alice");
  await page.locator('[data-mousedown="adminCheckIn"]').click();
  await page.locator('[data-arg0="closeRegistration"]').click();
  await page.locator(".fsel").selectOption("2");
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const p = LS.get("players");
    p.bob = { key: "bob", dn: "Bob", total: 0 };
    LS.applySnapshot({
      players: p,
      attendance: [...LS.get("attendance"), { key: "bob", time: "8:10 PM" }],
    });
  });
  await expect(page.locator(".fsel").first()).toHaveValue("2");
  await page.locator('[data-click="submitResults"]').click();
  await expect(page.locator("#adminBody")).toContainText("Game completed");
  await expect(page.locator('[data-click="adminSetState"]')).toHaveCount(0);
});

test("profile editor has no aggregate overrides or reset buttons", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.locator('[data-click="resetMonthly"],[data-click="resetPlayerStats"]'),
  ).toHaveCount(0);
  await page.locator('[data-click="openEditPlayer"]').click();
  await expect(
    page.locator("#ep_total,#ep_month,#ep_games,#ep_streak"),
  ).toHaveCount(0);
  await page.locator("#ep_name").fill("Alice Updated");
  await page.locator('[data-click="saveEditPlayer"]').click();
  await expect(page.locator("#playerDataBody")).toContainText("Alice Updated");
  expect(
    await page.evaluate(
      async () => (await import("/js/state.js")).getPlayers().alice.total,
    ),
  ).toBe(25);
});
