import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const mock = await readFile(
  new URL("./mock-firebase.js", import.meta.url),
  "utf8",
);
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.route("**/js/firebase.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: mock }),
  );
  await page.goto("/");
  await expect(page.locator("#s-players")).toHaveText("1");
});
test("public timer hides completed sessions, supports Escape and fits phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/tv/");
  await expect(page.locator("#page-tv")).toBeVisible();
  await expect(page.locator("#tvTimerContent")).toContainText("LEVEL");
  const exit = await page.locator(".tv-exit").boundingBox();
  const heading = await page.locator(".tv-heading").boundingBox();
  expect(exit.y + exit.height).toBeLessThanOrEqual(heading.y);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/games\/$/);
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

test("all public routes survive direct navigation and refresh", async ({
  page,
}) => {
  for (const name of [
    "about",
    "rankings",
    "games",
    "rules",
    "restrictions",
    "tv",
  ]) {
    const response = await page.goto(`/${name}/`);
    expect(response.status()).toBe(200);
    await expect(page.locator(`#page-${name}`)).toBeVisible();
    const reload = await page.reload();
    expect(reload.status()).toBe(200);
    await expect(page.locator(`#page-${name}`)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await page.locator("#nav-rankings").click();
  await expect(page).toHaveURL(/\/rankings\/$/);
  await page.locator("#nav-rules").click();
  await page.goBack();
  await expect(page.locator("#page-rankings")).toBeVisible();
});
