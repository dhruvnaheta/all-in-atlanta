import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { LEAGUE_PATH } from "../js/schema.js";

for (const autoMatch of [false, true])
  test(
    `real player signup, verification, ${autoMatch ? "automatic email linking" : "admin approval"}, self check-in and sign-out`,
    { timeout: 120000 },
    async () => {
      assert.ok(
        process.env.FIRESTORE_EMULATOR_HOST &&
          process.env.FIREBASE_AUTH_EMULATOR_HOST,
        "Only run against local emulators",
      );
      const app = initializeApp(
        { projectId: "demo-all-in-atlanta" },
        "account-browser",
      );
      const db = getFirestore(app),
        auth = getAuth(app);
      await db.recursiveDelete(db.doc(LEAGUE_PATH));
      for (const user of (await auth.listUsers()).users)
        await auth.deleteUser(user.uid);
      const batch = db.batch();
      for (const [path, data] of Object.entries({
        "operations/control": { published: true, writesEnabled: true },
        "settings/current": { activeGameId: "account-game" },
        "games/account-game": {
          id: "account-game",
          name: "Thursday at Wicked Wolf",
          date: "Sep 24, 2026",
          seriesId: "account-series",
          status: "running",
          registrationOpen: true,
          scheduled: true,
        },
        "series/account-series": {
          id: "account-series",
          name: "Wicked Wolf",
          venue: "Wicked Wolf",
          time: "8:00 PM",
          day: 4,
        },
        "players/p_account-alice": {
          key: "account-alice",
          dn: "Account Alice",
          total: 125,
          month: 25,
          games: 12,
          best: 1,
          bySeries: { "account-series": { total: 125, games: 12 } },
          gameDates: [
            {
              gameId: "old",
              date: "Sep 21, 2026",
              gameName: "Monday at Wicked Wolf",
              pos: 1,
              pts: 25,
            },
          ],
          currentStreak: 3,
          streakTrackingVersion: "games-v2",
          lastStreakGameDate: "Sep 24, 2026",
        },
        "players/p_claimed": {
          key: "claimed",
          dn: "Claimed Player",
          total: 20,
        },
        "playerAccounts/p_claimed": {
          playerKey: "claimed",
          uid: "other-owner",
        },
        "playerContacts/p_account-alice": {
          email: autoMatch
            ? " Account-Player@Example.test "
            : "player-contact@example.test",
          phone: "4045559999",
          recoveryNote: "admin only",
        },
      }))
        batch.set(db.doc(`${LEAGUE_PATH}/${path}`), data);
      for (const [index, date] of [
        "Sep 14, 2026",
        "Sep 16, 2026",
        "Sep 17, 2026",
        "Sep 21, 2026",
        "Sep 23, 2026",
      ].entries()) {
        batch.set(db.doc(`${LEAGUE_PATH}/history/account-old-${index}`), {
          gameId: `account-old-${index}`,
          date,
          gameName: index === 3 ? "Monday at Wicked Wolf" : "Wicked Wolf game",
          seriesId: "account-series",
          results: [
            { key: "account-alice", name: "Account Alice", pos: 1, pts: 25 },
          ],
          _order: index,
        });
      }
      await batch.commit();
      const admin = await auth.createUser({
        email: autoMatch
          ? "auto-admin@example.test"
          : "account-admin@example.test",
        password: "emulator-only-password",
        emailVerified: true,
      });
      await auth.setCustomUserClaims(admin.uid, { admin: true });
      const server = spawn(process.execPath, ["scripts/serve.js"], {
        env: { ...process.env, PORT: "4184" },
        stdio: "ignore",
      });
      let browser;
      try {
        for (let i = 0; i < 50; i++) {
          try {
            if ((await fetch("http://127.0.0.1:4184")).ok) break;
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        browser = await chromium.launch({ channel: "chrome", headless: true });
        const playerContext = await browser.newContext(),
          adminContext = await browser.newContext();
        const page = await playerContext.newPage(),
          adminPage = await adminContext.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        adminPage.on("pageerror", (e) => errors.push(e.message));
        await page.goto("http://127.0.0.1:4184/?emulator=1");
        await page.locator("#nav-account").click();
        await page
          .locator('[data-click="accountAuthMode"][data-arg0="signup"]')
          .click();
        await page.locator("#accountEmail").fill("account-player@example.test");
        await page.locator("#accountPassword").fill("emulator-only-password");
        await page.locator('#accountAuthForm button[type="submit"]').click();
        await expect(page.locator("#accountContent")).toContainText(
          "Verify your email",
        );
        const user = await auth.getUserByEmail("account-player@example.test");
        await auth.updateUser(user.uid, { emailVerified: true });
        await page.locator('[data-click="accountRefreshUser"]').click();
        if (!autoMatch) {
          await page.locator("#accountPlayerKey").selectOption("account-alice");
          await page.locator('#accountLinkForm button[type="submit"]').click();
          await expect(page.locator("#accountContent")).toContainText(
            "Profile request sent",
          );
          await page.getByText("Change request", { exact: true }).click();
          await expect(
            page.locator('#accountPlayerKey option[value="claimed"]'),
          ).toHaveCount(0);
          await page.locator("#accountPlayerSearch").fill("Claimed");
          await expect(
            page.locator('#accountPlayerKey option[value="claimed"]'),
          ).toHaveCount(0);
          await page.locator("#accountPlayerSearch").fill("");
          await page.locator("#accountPlayerKey").selectOption("");
          await page.locator("#accountNewName").fill("Different Player");
          await page.getByRole("button", { name: "Update request" }).click();
          await expect(page.locator("#accountContent")).toContainText(
            "You’re almost in, Different Player.",
          );
          await page
            .getByRole("button", { name: "Cancel request", exact: true })
            .click();
          await expect(
            page.getByText("Profile request sent", { exact: true }),
          ).toHaveCount(0);
          await page.locator("#accountNewName").fill("");
          await page.locator("#accountPlayerKey").selectOption("account-alice");
          await page.locator('#accountLinkForm button[type="submit"]').click();
          await expect(
            page.getByText("Profile request sent", { exact: true }),
          ).toBeVisible();
          await db
            .doc(`${LEAGUE_PATH}/accounts/${user.uid}`)
            .update({
              status: "rejected",
              reviewReason: "Please confirm <your> player name.",
            });
          await expect(page.locator("#accountContent")).toContainText(
            "Please confirm <your> player name.",
          );
          await page.locator("#accountPlayerKey").selectOption("account-alice");
          await page.locator('#accountLinkForm button[type="submit"]').click();
          await expect(
            page.getByText("Profile request sent", { exact: true }),
          ).toBeVisible();
          await adminPage.goto("http://127.0.0.1:4184/?emulator=1");
          await adminPage.locator("#nav-account").click();
          await adminPage
            .locator("#accountEmail")
            .fill("account-admin@example.test");
          await adminPage
            .locator("#accountPassword")
            .fill("emulator-only-password");
          await adminPage
            .locator('#accountAuthForm button[type="submit"]')
            .click();
          await expect(
            adminPage.locator("#accountApprovalSection"),
          ).toContainText("account-player@example.test");
          await adminPage
            .locator(
              `[data-click="adminApproveAccount"][data-arg0="${user.uid}"]`,
            )
            .click();
          await expect(adminPage.locator("#aconfirm")).toContainText(
            "account-player@example.test",
          );
          await adminPage.locator("#aconfirm-yes").click();
        }
        await expect(page.locator("#accountTitle")).toHaveText(
          "Hey, Account Alice",
        );
        await expect(page.locator("#accountContent")).toContainText(
          "125 points",
        );
        await expect(page.locator("#accountContent")).toContainText(
          "Monday at Wicked Wolf",
        );
        await page.locator('[data-click="accountCheckIn"]').click();
        await expect(page.locator("#accountContent")).toContainText(
          "You’re checked in",
        );
        await page.locator("#accountSettings summary").click();
        await expect(page.locator("#accountPhone")).toHaveValue("4045559999");
        await page.locator("#accountPhone").fill("4045551111");
        await page.locator('#accountProfileForm button[type="submit"]').click();
        await expect(page.locator("#toast")).toContainText("Profile saved");
        const player = (
          await db.doc(`${LEAGUE_PATH}/players/p_account-alice`).get()
        ).data();
        assert.equal(player.total, 125);
        assert.equal(player.games, 12);
        const contact = (
          await db.doc(`${LEAGUE_PATH}/playerContacts/p_account-alice`).get()
        ).data();
        assert.equal(contact.phone, "4045551111");
        assert.equal(contact.recoveryNote, "admin only");
        assert.ok(
          !(await page.evaluate(() => JSON.stringify(localStorage))).includes(
            "4045551111",
          ),
        );
        await page.locator("#accountSettings summary").click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: "test-results/personal-desktop.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: "test-results/personal-mobile.png",
          fullPage: true,
        });
        // Navigation drops the query string; keep reloads on the local emulators.
        await page.goto("http://127.0.0.1:4184/account/?emulator=1");
        await page.locator("#nav-account").click();
        await expect(page.locator("#accountTitle")).toHaveText(
          "Hey, Account Alice",
        );
        // Claims granted after login must be picked up on a direct account load.
        await expect(page.locator("#accountHeadingActions")).not.toContainText(
          "Admin view",
        );
        await auth.setCustomUserClaims(user.uid, { admin: true });
        await page.goto("http://127.0.0.1:4184/account/?emulator=1");
        await expect(page.locator("#accountHeadingActions")).toContainText(
          "Admin view",
        );
        // Returning within the same session also refreshes changed claims.
        await page.evaluate(async () => {
          const { go } = await import("/js/navigation.js");
          go("home");
        });
        await auth.setCustomUserClaims(user.uid, { admin: false });
        await page.evaluate(async () => {
          const { go } = await import("/js/navigation.js");
          go("account");
        });
        await expect(page.locator("#accountHeadingActions")).not.toContainText(
          "Admin view",
        );
        await page.locator('[data-click="accountSignOut"]').click();
        await expect(page.locator("#accountAuthForm")).toBeVisible();
        assert.equal(await page.locator("#accountPhone").count(), 0);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        server.kill();
        await db.terminate();
        await deleteApp(app);
      }
    },
  );
