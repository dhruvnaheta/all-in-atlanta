import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const mock = await readFile(new URL("./mock-firebase.js", import.meta.url), "utf8");

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/js/firebase.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: mock }),
  );
  await page.goto("/admin/");
});

for (const code of ["auth/popup-blocked", "auth/popup-closed-by-user"]) {
  test(`${code} restores the form and permits retry`, async ({ page }) => {
    await page.evaluate(async (code) => {
      const { configureAuth, setSession } = await import("/js/auth.js");
      let attempts = 0;
      configureAuth({
        async signInWithGoogle() {
          if (++attempts === 1) throw Object.assign(new Error(), { code });
          setSession({ uid: "admin", email: "admin@example.test" }, true);
        },
      });
    }, code);
    const google = page.getByRole("button", { name: "Continue with Google" });
    await google.click();
    await expect(page.locator("#adminLoginMessage")).toContainText(
      code === "auth/popup-blocked" ? "Allow pop-ups" : "canceled",
    );
    await expect(google).toBeEnabled();
    await expect(page.locator("#adminEmail")).toBeEnabled();
    await expect(page.locator("#adminPassword")).toBeEnabled();
    await google.click();
    await expect(page.locator("#adminLoginForm")).toHaveCount(0);
  });
}
