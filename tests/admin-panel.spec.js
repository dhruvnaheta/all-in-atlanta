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
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.locator("#adminPassword").fill("test-only");
  await page.locator("#adminPassword").press("Enter");
  await expect(page.locator("#page-admin")).toBeVisible();
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
  await expect(page.locator("#page-admin")).toBeVisible();
});
test("edit saves contacts and traps focus; Escape returns to the admin page", async ({
  page,
}) => {
  await page.locator('[data-click="openEditPlayer"]').click();
  await page
    .getByRole("textbox", { name: "Contact email", exact: true })
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
  await expect(page.locator("#page-admin")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/$/);
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
  expect(
    await page.locator("#mobt-games").evaluate((el) => !!el.closest("[inert]")),
  ).toBe(false);
  await page.locator("#mobt-games").click();
  await expect(page.locator("#page-games")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#page-admin")).toBeVisible();
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

test("admin route survives reload and hides controls after sign-out", async ({
  page,
}) => {
  await expect(page).toHaveURL(/\/admin\/$/);
  await page.reload();
  // The mock gateway has no persisted session; restore it like Firebase does.
  await page.evaluate(async () => {
    const { setSession } = await import("/js/auth.js");
    setSession({ uid: "admin", email: "admin@example.test" }, true);
  });
  await expect(page.locator("#adminBody")).toContainText("Game Control");
  await expect(page.locator("#page-admin")).not.toHaveAttribute(
    "role",
    "dialog",
  );
  await page.locator('[data-click="logout"]').click();
  await page.goto("/admin/");
  await expect(page.locator("#adminLoginForm")).toBeVisible();
  await expect(page.locator('[data-click="exportPlayerCSV"]')).toHaveCount(0);
});

test("admin email grants preserve drafts during refresh and report failures for retry", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { configureAdminAccess } = await import("/js/admin-access.js");
    configureAdminAccess(async ({ email }) => {
      window.adminEmail = email;
      throw new Error("Access could not be granted. Try again.");
    });
  });
  await page.getByLabel("Administrator email").fill("new@example.test");
  await page.evaluate(async () =>
    (await import("/js/refresh.js")).renderAdmin(),
  );
  await expect(page.getByLabel("Administrator email")).toHaveValue(
    "new@example.test",
  );
  await page
    .getByRole("button", { name: "Add administrator", exact: true })
    .click();
  await expect(page.locator("#adminAccessForm")).toContainText(
    "Access could not be granted",
  );
  await expect(page.getByLabel("Administrator email")).toHaveValue(
    "new@example.test",
  );
  expect(await page.evaluate(() => window.adminEmail)).toBe("new@example.test");
  await page.evaluate(async () => {
    const { configureAdminAccess } = await import("/js/admin-access.js");
    configureAdminAccess(async ({ email }) => ({ email, alreadyAdmin: false }));
  });
  await page
    .getByRole("button", { name: "Add administrator", exact: true })
    .click();
  await expect(page.locator("#adminAccessForm")).toContainText(
    "Administrator access granted to new@example.test",
  );
  await expect(page.getByLabel("Administrator email")).toHaveValue("");
});

test("game controls refresh for snapshots before and after command completion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const delay of [-1, 0, 50]) {
    await page.evaluate(async (delay) => {
      const { LS } = await import("/js/store.js");
      const { configureCommands } = await import("/js/commands.js");
      const { transitionGame } = await import("/js/game-model.js");
      const id = LS.get("activeGameId");
      LS.applyRemote(
        "gameList",
        LS.get("gameList").map((g) =>
          g.id === id
            ? {
                ...g,
                status: "scheduled",
                registrationOpen: false,
                finalized: false,
              }
            : g,
        ),
      );
      configureCommands(async ({ action }) => {
        const update = () =>
          LS.applyRemote(
            "gameList",
            LS.get("gameList").map((g) =>
              g.id === id ? transitionGame(g, action) : g,
            ),
          );
        if (delay < 0) {
          update();
          await new Promise((resolve) => setTimeout(resolve, 50));
        } else setTimeout(update, delay);
        return { saved: true };
      });
    }, delay);
    await page.locator('[data-arg0="start"]').click();
    await expect(page.locator(".gcp-label")).toHaveText(
      "Running · Check-in OPEN",
    );
    await page.locator('[data-arg0="closeRegistration"]').click();
    await expect(page.locator(".gcp-label")).toHaveText(
      "Running · Check-in CLOSED",
    );
    await expect(page.locator('[data-arg0="openRegistration"]')).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test("confirmed game changes render without waiting for the listener and preserve newer snapshots", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const { configureCommands } = await import("/js/commands.js");
    const { transitionGame } = await import("/js/game-model.js");
    const id = LS.get("activeGameId");
    LS.applyRemote(
      "gameList",
      LS.get("gameList").map((g) =>
        g.id === id
          ? {
              ...g,
              status: "scheduled",
              registrationOpen: false,
              finalized: false,
            }
          : g,
      ),
    );
    configureCommands(async ({ action }) => ({
      saved: true,
      game: transitionGame(
        LS.get("gameList").find((g) => g.id === id),
        action,
      ),
    }));
  });
  await page.locator('[data-arg0="start"]').click();
  await expect(page.locator(".gcp-label")).toHaveText(
    "Running · Check-in OPEN",
  );
  await page.locator('[data-arg0="closeRegistration"]').click();
  await expect(page.locator(".gcp-label")).toHaveText(
    "Running · Check-in CLOSED",
  );
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const { configureCommands } = await import("/js/commands.js");
    const { transitionGame } = await import("/js/game-model.js");
    const id = LS.get("activeGameId");
    configureCommands(async ({ action }) => {
      const result = transitionGame(
        LS.get("gameList").find((g) => g.id === id),
        action,
      );
      LS.applyRemote(
        "gameList",
        LS.get("gameList").map((g) =>
          g.id === id ? transitionGame(result, "complete") : g,
        ),
      );
      return { saved: true, game: result };
    });
  });
  await page.locator('[data-arg0="openRegistration"]').click();
  await expect(page.locator(".gcp-label")).toHaveText("Game completed");
});

test("launch availability follows the current game date, not its legacy ID", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    const { nextOccurrence, fmtDate } = await import("/js/schedule.js");
    const { leagueDateKey } = await import("/js/league-date.js");
    const series = LS.get("seriesList")[0];
    const date = fmtDate(nextOccurrence(series.day));
    LS.applyRemote("gameList", [
      {
        id: `${series.id}_${leagueDateKey(date)}`,
        seriesId: series.id,
        name: "Existing game",
        date,
        status: "scheduled",
        scheduled: true,
      },
    ]);
  });
  await expect(page.locator('[data-click="adminLaunchGame"]')).toHaveCount(0);
  await expect(page.locator("#adminBody")).toContainText(
    "Game already scheduled",
  );
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote(
      "gameList",
      LS.get("gameList").map((game) => ({ ...game, date: "2000-01-01" })),
    );
  });
  await expect(page.locator('[data-click="adminLaunchGame"]')).toBeVisible();
});

test("administrator directory exposes removal only to owners and refreshes after removal", async ({
  page,
}) => {
  await expect(page.locator('footer a[href="/admin/"]')).toHaveText("Admin");
  await page.evaluate(async () => {
    const { configureAdminDirectory } = await import("/js/admin-access.js");
    window.directoryOwner = false;
    window.directoryAdmins = [
      { uid: "meg", email: "meg@example.test", owner: true },
      { uid: "julia", email: "julia@example.test", owner: true },
      { uid: "other", email: "other@example.test", owner: false },
    ];
    configureAdminDirectory(async ({ uid }) => {
      if (uid) {
        window.directoryAdmins = window.directoryAdmins.filter(
          (admin) => admin.uid !== uid,
        );
        return { removed: true };
      }
      return {
        administrators: window.directoryAdmins,
        owner: window.directoryOwner,
      };
    });
  });
  await page.getByRole("button", { name: "Refresh administrators" }).click();
  await expect(page.locator("#administratorList")).toContainText(
    "meg@example.test · Owner",
  );
  await expect(
    page.locator('[data-click="adminRemoveAdministrator"]'),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.directoryOwner = true;
  });
  await page.getByRole("button", { name: "Refresh administrators" }).click();
  await expect(
    page.locator('[data-click="adminRemoveAdministrator"]'),
  ).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Remove administrator", exact: true })
    .click();
  await expect(page.locator("#administratorList")).not.toContainText(
    "other@example.test",
  );
  await expect(page.locator("#administratorList")).toContainText(
    "julia@example.test · Owner",
  );
});
