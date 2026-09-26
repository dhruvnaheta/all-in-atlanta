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
  await expect(
    page.locator(
      "nav a[href*=admin], nav a[href*=account], #mobTabs a[href*=admin], #mobTabs a[href*=account]",
    ),
  ).toHaveCount(0);
});
test("admin sign-in replaces player signup and preserves password recovery", async ({
  page,
}) => {
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await expect(page.locator("#page-admin h1")).toHaveText("Admin");
  await expect(page.locator('[data-arg0="signup"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("#adminLoginMessage")).toContainText("reset link");
});
test("individual accounts cannot enter the admin area or player account screens", async ({
  page,
}) => {
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await page.locator("#adminEmail").fill("alice@example.test");
  await page.locator("#adminPassword").fill("test-only");
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator("#adminLoginMessage")).toContainText(
    "Administrator access required",
  );
  await expect(page.locator("#adminLoginForm")).toBeVisible();
  await expect(page.locator("#adminAccessForm")).toHaveCount(0);
  await expect(
    page.locator("#accountLinkForm, #accountProfileForm"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(async () =>
      (await import("/js/auth.js")).currentUser(),
    ),
  ).toBeNull();
});
test("admin can sign in, reopen controls, and sign out", async ({ page }) => {
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await page.locator("#adminEmail").fill("admin@example.test");
  await page.locator("#adminPassword").fill("test-only");
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator("#page-admin")).toHaveClass(/active/);
  await expect(page.locator("#accountApprovalSection")).toHaveCount(0);
  await expect(
    page.locator(
      "nav a[href*=admin], nav a[href*=account], #mobTabs a[href*=admin], #mobTabs a[href*=account]",
    ),
  ).toHaveCount(0);
  await page.locator("#nav-home").click();
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await expect(page.locator("#page-admin")).toHaveClass(/active/);
  await page.locator('[data-click="logout"]').click();
  await expect(page.locator("#adminLoginForm")).toBeVisible();
});
test("Google popup errors preserve credentials and allow retry", async ({
  page,
}) => {
  await page.evaluate(async () =>
    (await import("/js/navigation.js")).go("admin"),
  );
  await page.locator("#adminEmail").fill("alice@example.test");
  for (const [code, message] of [
    ["auth/popup-blocked", "Allow pop-ups"],
    ["auth/popup-closed-by-user", "was canceled"],
    ["auth/account-exists-with-different-credential", "another sign-in method"],
  ]) {
    await page.evaluate(async (code) => {
      const { configureAuth } = await import("/js/auth.js");
      configureAuth({
        signInWithGoogle: async () => {
          throw Object.assign(new Error(), { code });
        },
      });
    }, code);
    const google = page.getByRole("button", { name: "Continue with Google" });
    await google.click();
    await expect(page.locator("#adminLoginMessage")).toContainText(message);
    await expect(google).toBeEnabled();
    await expect(page.locator("#adminEmail")).toBeEnabled();
    await expect(page.locator("#adminEmail")).toHaveValue("alice@example.test");
    await expect(
      page.locator('#adminLoginForm button[type="submit"]'),
    ).toBeEnabled();
  }
});
for (const width of [320, 390]) {
  test(`phone navigation fits at ${width}px and includes About`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    const bounds = await page.locator("#mobt-tv").boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const header = await page.locator("body > nav").boundingBox();
    const tabs = await page.locator("#mobTabs").boundingBox();
    expect(header.height + tabs.height).toBeLessThan(125);
    await page.locator("#mobt-more").click();
    await expect(page.locator("#mobt-more")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.locator("#mobt-about").click();
    await expect(page.locator("#page-about")).toBeVisible();
    await expect(page.locator("#mobileMore")).toBeHidden();
    await page.locator("#mobt-more").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#mobt-more")).toBeFocused();
    await page.locator("#mobt-tv").click();
    await expect(page.locator("#page-tv")).toBeVisible();
  });
}

test("admin sign-in loads directly and the account route redirects", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator("#adminLoginForm")).toBeVisible();
  await expect(page.locator("#page-admin")).toBeVisible();
  await page.reload();
  await expect(page.locator("#adminLoginForm")).toBeVisible();
  const response = await page.request.get("/account/", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe("/admin/");
});
