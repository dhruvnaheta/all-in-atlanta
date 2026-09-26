import { atlantaDateKey } from "../js/league-date.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { LEAGUE_PATH as root } from "../js/schema.js";

test(
  "real browser and callables enforce lifecycle, preserve timer on reload, and surface rejected saves",
  { timeout: 120000 },
  async () => {
    if (
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new Error(
        "This test requires the demo Firestore, Auth and Functions emulators.",
      );
    const app = initializeApp(
      { projectId: "demo-all-in-atlanta" },
      "operations-browser",
    );
    const db = getFirestore(app),
      auth = getAuth(app);
    const batch = db.batch();
    for (const [path, value] of Object.entries({
      "settings/current": { activeGameId: "browser-ops" },
      "games/browser-ops": {
        id: "browser-ops",
        name: "Operations test",
        seriesId: "ops",
        date: atlantaDateKey(),
        status: "scheduled",
        registrationOpen: false,
        scheduled: true,
      },
      "series/ops": {
        id: "ops",
        name: "Operations League",
        venue: "Test Venue",
        day: 4,
        time: "8:00 PM",
      },
      "players/p_alice": {
        key: "alice",
        dn: "Alice",
        total: 10,
        month: 0,
        games: 1,
      },
    }))
      batch.set(db.doc(root + "/" + path), value);
    await batch.commit();
    const user = await auth.createUser({
      email: "operations@example.test",
      password: "emulator-only-password",
    });
    await auth.setCustomUserClaims(user.uid, { admin: true });
    const server = spawn(process.execPath, ["scripts/serve.js"], {
      env: { ...process.env, PORT: "4188" },
      stdio: "ignore",
    });
    let browser;
    try {
      for (let i = 0; i < 50; i++) {
        try {
          if ((await fetch("http://127.0.0.1:4188")).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const page = await browser.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const routeFirebase = (page) =>
        page.route("**/js/firebase.js", async (route) => {
          const response = await route.fetch();
          const body = (await response.text())
            .replace(
              '"127.0.0.1", 8080',
              `"127.0.0.1", ${process.env.FIRESTORE_EMULATOR_HOST.split(":").pop()}`,
            )
            .replace(
              "http://127.0.0.1:9099",
              `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
            )
            .replace(
              '"127.0.0.1", 5001',
              `"127.0.0.1", ${process.env.FUNCTIONS_EMULATOR_PORT || 5001}`,
            );
          await route.fulfill({ response, body });
        });
      await routeFirebase(page);
      await page.goto("http://127.0.0.1:4188/?emulator=1");
      await expect(page.locator("#s-players")).toHaveText("1");
      await page.evaluate(async () =>
        (await import("/js/navigation.js")).go("admin"),
      );
      await page.locator("#adminEmail").fill("operations@example.test");
      await page.locator("#adminPassword").fill("emulator-only-password");
      await page.locator('#adminLoginForm button[type="submit"]').click();
      await expect(page.locator('[data-arg0="start"]')).toBeVisible();
      await page.locator('[data-arg0="start"]').click();
      await expect(page.locator("#adminBody")).toContainText("Check-in OPEN");
      await page.locator("#adminSearchInput").fill("Alice");
      await page.locator('[data-mousedown="adminCheckIn"]').click();
      await expect(page.locator("#adminBody")).toContainText(
        "Tonight's Check-Ins (1)",
      );
      await page.locator('[data-click="adminTimerResume"]').click();
      await expect(
        page.locator('[data-click="adminTimerPause"]'),
      ).toBeVisible();
      const timerRef = db.doc(`${root}/games/browser-ops/runtime/timer`);
      const timer = (await timerRef.get()).data().timerState;
      await timerRef.set(
        { timerState: { ...timer, levelStartTs: Date.now() - 31 * 60000 } },
        { merge: true },
      );
      await expect(page.locator("#tc-blind")).toHaveText("300 / 600");
      await page.reload();
      await expect(page.locator("#s-players")).toHaveText("1");
      await expect(page.locator("#adminAccessForm")).toBeVisible();
      await page.evaluate(async () =>
        (await import("/js/navigation.js")).go("admin"),
      );
      await expect(page.locator("#tc-blind")).toHaveText("300 / 600");
      await page.locator('[data-click="adminTimerPause"]').click();
      await expect(
        page.locator('[data-click="adminTimerResume"]'),
      ).toBeVisible();
      const paused = (await timerRef.get()).data().timerState;
      assert.equal(paused.running, false);
      assert.equal(paused.levelIdx, 2);
      await page.route("**/manageLeague", (route) =>
        route.request().method() === "OPTIONS"
          ? route.continue()
          : route.fulfill({
              status: 503,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify({
                error: {
                  status: "UNAVAILABLE",
                  message: "Simulated save failure",
                },
              }),
            }),
      );
      await page.locator('[data-arg0="closeRegistration"]').click();
      await expect(page.locator("#toast")).toContainText("Not saved");
      assert.equal(
        (await db.doc(`${root}/games/browser-ops`).get()).data()
          .registrationOpen,
        true,
      );
      await page.unroute("**/manageLeague");
      await page.locator('[data-arg0="closeRegistration"]').click();
      await expect(page.locator("#adminBody")).toContainText("Check-in CLOSED");
      const context = await browser.newContext(),
        publicPage = await context.newPage();
      await routeFirebase(publicPage);
      await publicPage.goto("http://127.0.0.1:4188/?emulator=1");
      await expect(publicPage.locator("#s-players")).toHaveText("1");
      await publicPage.locator("#nav-games").click();
      await expect(publicPage.locator("#gameStatusCard")).toContainText(
        "Check-in is closed",
      );
      await expect(publicPage.locator("#pubSearchInput")).toHaveCount(0);
      const removal = await publicPage.evaluate(async () => {
        try {
          await (await import("/js/checkin.js")).removeCheckIn("alice");
          return "allowed";
        } catch (error) {
          return error.message;
        }
      });
      assert.match(removal, /Administrator/);
      assert.ok(
        (
          await db.doc(`${root}/games/browser-ops/participants/p_alice`).get()
        ).data().checkIn,
      );
      await page.locator(".fsel").selectOption("1");
      await page.locator('[data-click="submitResults"]').click();
      await expect(page.locator("#adminBody")).toContainText("Game completed");
      await expect(page.locator('[data-arg0="start"]')).toHaveCount(0);
      assert.equal(
        (await db.doc(`${root}/players/p_alice`).get()).data().total,
        undefined,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      server.kill();
      await db.terminate();
      await deleteApp(app);
    }
  },
);
