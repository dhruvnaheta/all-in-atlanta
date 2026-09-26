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
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.locator("#adminPassword").fill("test-only");
  await page.locator("#adminPassword").press("Enter");
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
  await expect(page.locator("#adminEmail")).toBeVisible();
});
test("stop game asks for finishing order while check-in is open and awards finish points", async ({
  page,
}) => {
  await login(page);
  await page.locator("#adminSearchInput").fill("Alice");
  await page.locator('[data-mousedown="adminCheckIn"]').click();
  await page.locator('[data-click="adminStopGame"]').click();
  await expect(page.locator("#finishSection .fsel")).toBeFocused();
  await expect(page.locator("#aconfirm")).not.toBeVisible();
  await page.locator(".fsel").selectOption("1");
  await page.locator('[data-click="submitResults"]').click();
  await expect(page.locator("#adminBody")).toContainText("Game completed");
  const player = await page.evaluate(
    async () => (await import("/js/state.js")).getPlayers().alice,
  );
  expect(player.total).toBe(50);
});

test("ending without results requires confirmation and cancel preserves selected positions", async ({
  page,
}) => {
  await login(page);
  await page.locator("#adminSearchInput").fill("Alice");
  await page.locator('[data-mousedown="adminCheckIn"]').click();
  await page.locator('[data-click="submitResults"]').click();
  await expect(page.locator("#aconfirm-msg")).toContainText(
    "only 1 participation point",
  );
  await page.locator('[data-click="cancelConfirm"]').click();
  await page.locator(".fsel").selectOption("1");
  await page.locator('[data-click="adminStopWithoutResults"]').click();
  await page.locator('[data-click="cancelConfirm"]').click();
  await expect(page.locator(".fsel")).toHaveValue("1");
  await page.locator('[data-click="adminStopWithoutResults"]').click();
  await page.locator("#aconfirm-yes").click();
  await expect(page.locator("#adminBody")).toContainText("Game completed");
  const state = await page.evaluate(async () => {
    const { getPlayers, getHistory } = await import("/js/state.js");
    return { player: getPlayers().alice, history: getHistory() };
  });
  expect(state.player.total).toBe(26);
  expect(state.history.some((game) => game.stopped)).toBe(true);
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

test("page links survive reload and browser history", async ({ page }) => {
  for (const tab of [
    "about",
    "rankings",
    "games",
    "rules",
    "restrictions",
    "admin",
    "tv",
  ]) {
    await page.goto(`/${tab}/`);
    await expect(page.locator(`#page-${tab}`)).toBeVisible();
    await page.reload();
    await expect(page.locator(`#page-${tab}`)).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://allinatlanta.com/${tab}/`,
    );
  }
  await page.goto("/");
  await expect(page.locator("#nav-rankings")).toHaveAttribute(
    "href",
    "/rankings/",
  );
  await page.locator("#nav-rankings").click();
  await expect(page).toHaveURL(/\/rankings\/$/);
  await page.locator("#nav-rules").click();
  await expect(page).toHaveTitle(
    "Texas Hold’em Poker League Rules | All In Atlanta",
  );
  await page.goBack();
  await expect(page.locator("#page-rankings")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#page-rules")).toBeVisible();
  await expect(page.locator("#nav-rules")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("empty schedule shows all weekly venues with a clear stat label", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applySnapshot({ seriesList: [] });
    const { updateHomeSched } = await import("/js/views/home.js");
    updateHomeSched();
  });
  await expect(page.locator("#schedGrid .sched-card")).toHaveCount(3);
  await expect(page.locator("#schedGrid")).toContainText("5 Paces");
  await expect(page.locator("#s-weekly")).toHaveText("3");
  await expect(page.locator("#s-weekly + .stat-l")).toHaveText(
    "Games per Week",
  );
});

test("completed games show saved attendance and the CTA offers the full schedule", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applySnapshot({
      seriesList: [1, 3, 4].map((day) => ({
        id: `s${day}`,
        day,
        venue: day === 3 ? "5 Paces" : "Wicked Wolf",
        name: `Night ${day}`,
        time: "8:00 PM",
      })),
      gameList: [
        {
          id: "finished",
          seriesId: "s4",
          status: "completed",
          date: "2026-09-24",
        },
      ],
      activeGameId: "finished",
      attendance: [],
      history: [
        {
          gameId: "finished",
          date: "2026-09-24",
          results: [{ key: "alice", name: "Alice", pts: 18, pos: 2 }],
        },
      ],
    });
  });
  await expect(page.locator("#homeGameAction")).toHaveText(
    "View Game Schedule",
  );
  await page.locator("#homeGameAction").click();
  await expect(page.locator("#upcomingGames .sched-card")).toHaveCount(3);
  await expect(page.locator("#gameStatusCard")).toContainText(
    "1 recorded players",
  );
  await expect(page.locator("#gameStatusCard")).toContainText("Alice");
  await expect(page.locator("#pubSearchInput")).toHaveCount(0);
});

test("monthly rankings display finish tiebreakers and shared ranks", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const { atlantaDateKey } = await import("/js/league-date.js");
    LS.applySnapshot({
      players: {
        will: { dn: "Will" },
        davis: { dn: "Davis" },
        other: { dn: "Other" },
      },
      history: [
        {
          gameId: "tie",
          date: atlantaDateKey(),
          results: [
            { key: "will", pts: 20, pos: 2 },
            { key: "davis", pts: 20, pos: "p" },
            { key: "other", pts: 20, pos: "p" },
          ],
        },
      ],
    });
  });
  await page.locator("#nav-rankings").click();
  await expect(page.locator("#monthly-rankings")).toBeVisible();
  await expect(page.locator("#monthly-rankings .pnm")).toHaveText([
    "Will",
    "Davis",
    "Other",
  ]);
  await expect(page.locator("#monthly-rankings .rn")).toHaveText([
    "1",
    "2",
    "2",
  ]);
});

test("public timer hides completed sessions, supports Escape and fits phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/tv/");
  await expect(page.locator("#page-tv")).toBeVisible();
  await expect(page).toHaveTitle("Timer");
  await expect(page.locator("#tvTimerContent")).toContainText("LEVEL");
  const exit = await page.locator(".tv-exit").boundingBox();
  const heading = await page.locator(".tv-heading").boundingBox();
  expect(exit.y).toBe(16);
  expect(375 - exit.x - exit.width).toBe(16);
  expect(exit.y + exit.height).toBeLessThanOrEqual(heading.y);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/games\/$/);
  await expect(page).toHaveTitle(
    "Atlanta Poker Games & Weekly Schedule | All In Atlanta",
  );
  await page.goto("/tv/");
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const games = LS.get("gameList");
    LS.applySnapshot({
      gameList: games.map((g) => ({ ...g, status: "completed" })),
    });
  });
  await expect(page.locator("#tvTimerContent")).toContainText("No live game");
  await expect(page.locator("#tvTimerContent")).not.toContainText("LEVEL");
  await page.locator(".tv-exit").click();
  await expect(page).toHaveURL(/\/games\/$/);
});

test("timer navigation restores its title and preserves the exit control during updates", async ({
  page,
}) => {
  await page.locator("#nav-tv").click();
  await expect(page).toHaveTitle("Timer");
  const exit = page.locator(".tv-exit");
  const bounds = await exit.boundingBox();
  expect(bounds.y).toBe(16);
  expect(page.viewportSize().width - bounds.x - bounds.width).toBe(16);
  await exit.focus();
  await page.evaluate(async () => {
    const { renderTVTimer } = await import("/js/views/timer.js");
    renderTVTimer();
    renderTVTimer();
  });
  await expect(exit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/games\/$/);
  await expect(page.locator("#page-tv")).toBeHidden();
  await page.goBack();
  await expect(page).toHaveTitle("Timer");
  await expect(page.locator("#page-tv")).toBeVisible();
  await page.reload();
  await expect(page).toHaveTitle("Timer");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/games\/$/);
});

test("admins can correct past results and keep their draft through live updates", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("history", [
      {
        _id: "past",
        gameId: "past-game",
        date: "Sep 3, 2026",
        stopped: true,
        results: [{ key: "alice", name: "Alice", pos: "p", pts: 1 }],
      },
    ]);
    const { configureResultCorrections } = await import("/js/results.js");
    configureResultCorrections(async (request) => {
      window.correctionRequest = request;
      LS.applyRemote("history", [
        {
          ...request.before,
          stopped: false,
          gameName: request.gameName,
          date: request.date,
          results: [{ key: "alice", name: "Alice", pos: 1, pts: 25 }],
        },
      ]);
      return { saved: true };
    });
  });
  await login(page);
  await page.getByRole("button", { name: "Edit results", exact: true }).click();
  const editor = page.locator("#historyResultsEditor");
  await editor.locator("select").selectOption("1");
  await expect(editor.getByLabel("Points for Alice", { exact: true })).toHaveValue("25");
  const pointsInput = editor.getByLabel("Points for Alice", { exact: true });
  await expect(pointsInput).toHaveAttribute("max", "100");
  for (const value of ["101", "2500", "1000000000000000"]) {
    await pointsInput.fill(value);
    await editor.getByRole("button", { name: "Save game" }).click();
    await expect(editor.getByRole("alert")).toHaveText("Points must be whole numbers between 0 and 100 for every player.");
    expect(await page.evaluate(() => window.correctionRequest)).toBeUndefined();
    await expect(pointsInput).toBeEnabled();
  }
  await pointsInput.fill("30");
  await editor
    .getByLabel("Game name", { exact: true })
    .fill("Corrected Thursday");
  await editor.getByLabel("Game date", { exact: true }).fill("2026-08-27");
  await page.evaluate(async () => {
    const { renderAdmin } = await import("/js/views/admin.js");
    renderAdmin();
  });
  await expect(editor.locator("select")).toHaveValue("1");
  await expect(editor.getByLabel("Game name", { exact: true })).toHaveValue(
    "Corrected Thursday",
  );
  await expect(editor.getByLabel("Game date", { exact: true })).toHaveValue(
    "2026-08-27",
  );
  await editor.getByRole("button", { name: "Save game" }).click();
  await expect(editor).toBeEmpty();
  expect(await page.evaluate(() => window.correctionRequest.positions)).toEqual(
    { alice: "1" },
  );
  expect(await page.evaluate(() => window.correctionRequest)).toMatchObject({
    points: { alice: 30 },
    gameName: "Corrected Thursday",
    date: "2026-08-27",
  });
  await expect(page.locator("#adminBody")).toContainText("Corrected Thursday");
  await expect(page.locator("#adminBody")).toContainText("Aug 27, 2026");
  await expect(page.locator("#adminBody")).toContainText("COMPLETE");
  await page.getByRole("button", { name: "Edit results", exact: true }).click();
  await expect(editor.locator("select")).toHaveValue("1");
  await page.evaluate(async () => {
    const { configureResultCorrections } = await import("/js/results.js");
    configureResultCorrections(async () => {
      throw new Error("These results changed elsewhere.");
    });
  });
  await editor.locator("select").selectOption("2");
  await editor.getByRole("button", { name: "Save game" }).click();
  await expect(editor.getByRole("alert")).toContainText("changed elsewhere");
  await expect(editor.locator("select")).toHaveValue("2");
  await expect(editor.locator("select")).toBeEnabled();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toBeEmpty();
});

test("duplicate finish errors clear only once the positions are fixed", async ({ page }) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote("history", [{
      _id: "past", gameId: "past-game", date: "Sep 3, 2026",
      results: ["alice", "bob", "carol"].map((key) => ({
        key, name: key, pos: "p", pts: 1,
      })),
    }]);
    const { configureResultCorrections } = await import("/js/results.js");
    configureResultCorrections(async ({ positions }) => {
      const finishes = Object.values(positions).filter((pos) => pos !== "p");
      if (new Set(finishes).size !== finishes.length)
        throw new Error("Two players share the same finishing position.");
      return { saved: true };
    });
  });
  await login(page);
  await page.getByRole("button", { name: "Edit results", exact: true }).click();
  const editor = page.locator("#historyResultsEditor");
  const selects = editor.locator("select");
  for (let i = 0; i < 3; i++) await selects.nth(i).selectOption("1");
  await editor.getByRole("button", { name: "Save game" }).click();
  await expect(editor.getByRole("alert")).toContainText("same finishing position");
  await selects.nth(0).selectOption("p");
  await expect(editor.getByRole("alert")).toContainText("same finishing position");
  await selects.nth(1).selectOption("p");
  await expect(editor.getByRole("alert")).toBeEmpty();
  await editor.getByRole("button", { name: "Save game" }).click();
  await expect(editor).toBeEmpty();
});

test("emulator navigation keeps real links and reloads in local mode", async ({
  page,
  context,
}) => {
  await page.goto("/?emulator=1");
  await page.locator("#nav-about").click();
  await expect(page).toHaveURL(/\/about\/\?emulator=1$/);
  await expect(page.locator("#nav-about")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await expect(page.locator("#page-about")).toBeVisible();
  await expect(page.locator("#nav-games")).toHaveAttribute(
    "href",
    /\/games\/\?emulator=1$/,
  );
  await page.locator("#nav-games").click();
  await page.goBack();
  await expect(page).toHaveURL(/\/about\/\?emulator=1$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/games\/\?emulator=1$/);
  const href = "/admin/?emulator=1";
  expect(href).toContain("emulator=1");
  const tab = await context.newPage();
  await tab.route("https://**/*", (route) => route.abort());
  await tab.route("**/js/firebase.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: mock }),
  );
  await tab.goto(href);
  await expect(tab.locator("#page-admin")).toBeVisible();
  await expect(tab).toHaveURL(/emulator=1/);
});

for (const admin of [false, true]) {
  test(`${admin ? "admin" : "public"} registration preserves inputs and rejects invalid contacts`, async ({
    page,
  }) => {
    if (admin) await login(page);
    else await page.locator("#nav-games").click();
    const prefix = admin ? "admin" : "pub";
    await page.locator(`#${prefix}SearchInput`).fill("Contact Test");
    await page.locator(`#${prefix}SearchInput`).press("ArrowDown");
    await page.locator(`#${prefix}SearchInput`).press("Enter");
    await page.locator(`#${prefix}NpEmail`).fill("not-an-email");
    await page.locator(`#${prefix}NpPhone`).fill("abc");
    const submit = page.locator(`[data-click="${prefix}SubmitNewPlayer"]`);
    await submit.click();
    await expect(page.locator(`#${prefix}NpForm`)).toBeVisible();
    await expect(page.locator(`#${prefix}NpEmail`)).toHaveValue("not-an-email");
    await expect(page.locator("#s-players")).toHaveText("1");
    await page.locator(`#${prefix}NpEmail`).fill("contact@example.test");
    await submit.click();
    await expect(page.locator(`#${prefix}NpForm`)).toBeVisible();
    await expect(page.locator(`#${prefix}NpPhone`)).toHaveValue("abc");
    await expect(page.locator("#s-players")).toHaveText("1");
    await page.locator(`#${prefix}NpPhone`).fill("(404) 555-0100");
    await submit.click();
    await expect(page.locator(`#${prefix}NpForm`)).toBeHidden();
    await expect(page.locator("#s-players")).toHaveText("2");
  });
}

test("legacy account URL redirects to admin", async ({ page }) => {
  await page.goto("/account/");
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.locator("#adminEmail")).toBeVisible();
});

test("saving a recurring series clears its draft fields", async ({ page }) => {
  await login(page);
  await page.getByText("+ ADD RECURRING GAME", { exact: true }).click();
  await page.locator("#sName").fill("Friday Poker");
  await page.locator("#sVenue").fill("Test Venue");
  await page.locator("#sDay").selectOption("5");
  await page.locator("#sTime").fill("7:00 PM");
  await page.getByRole("button", { name: "Save Series", exact: true }).click();
  await expect(page.locator("#sName")).toHaveValue("");
  await expect(page.locator("#sVenue")).toHaveValue("");
  await expect(page.locator("#sDay")).toHaveValue("4");
  await expect(page.locator("#sTime")).toHaveValue("8:00 PM");
  await page.evaluate(async () => (await import("/js/views/admin.js")).renderAdmin());
  await expect(page.locator("#sName")).toHaveValue("");
});
