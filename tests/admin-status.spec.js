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
  await page.goto("/admin/");
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.locator("#adminPassword").fill("test-only");
  await page.locator("#adminPassword").press("Enter");
});

test("future game status and selector explain the date restriction and allow disabling check-in", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { LS } = await import("/js/store.js");
    LS.applyRemote(
      "gameList",
      LS.get("gameList").map((game) => ({
        ...game,
        date: "2099-01-01",
        status: "running",
        registrationOpen: true,
      })),
    );
  });
  await expect(page.locator(".gcp-label")).toHaveText(
    "Running · Check-in unavailable · only on the game date (Atlanta time)",
  );
  await expect(page.locator("#gcGameSelect option:checked")).toContainText(
    "Check-in unavailable · only on the game date (Atlanta time)",
  );
  await page.getByRole("button", { name: "Disable game-day check-in" }).click();
  await expect(page.locator(".gcp-label")).toHaveText(
    "Running · Check-in CLOSED",
  );
});

test("legacy player links retain cleanup without advertising retired signup", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { updateAccount } = await import("/js/account.js");
    updateAccount({
      owners: [{ playerKey: "alice", uid: "old", email: "old@example.test" }],
    });
  });
  await page.locator('[data-click="openEditPlayer"]').click();
  const modal = page.locator("#editPlayerOverlay");
  await expect(modal).toContainText("Legacy profile link: old@example.test");
  await expect(
    modal.getByRole("button", { name: "Remove legacy link" }),
  ).toBeVisible();
  await expect(modal).not.toContainText(
    /linked account|Unlink account|new request/i,
  );
});
