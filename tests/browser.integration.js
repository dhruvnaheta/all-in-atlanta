import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { LEAGUE_PATH } from "../js/schema.js";
test(
  "browser loads native data, signs in, persists edits, checks in and finalizes through callables",
  { timeout: 120000 },
  async () => {
    if (
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new Error("Demo emulators are required.");
    const app = initializeApp(
      { projectId: "demo-all-in-atlanta" },
      "browser-test",
    );
    const db = getFirestore(app),
      auth = getAuth(app);
    await db.recursiveDelete(db.doc(LEAGUE_PATH));
    const batch = db.batch();
    for (const [path, data] of Object.entries({
      "operations/control": { published: true, writesEnabled: true },
      "settings/current": { activeGameId: "browser-game" },
      "games/browser-game": {
        id: "browser-game",
        name: "Browser test",
        seriesId: "s_wickedwolf",
        date: "Sep 24, 2026",
        state: "open",
        scheduled: true,
      },
      "players/p_alice": {
        key: "alice",
        dn: "Alice",
        total: 10,
        month: 0,
        games: 1,
      },
      "playerContacts/p_alice": { email: "private@example.com" },
    }))
      batch.set(db.doc(`${LEAGUE_PATH}/${path}`), data);
    await batch.commit();
    const user = await auth.createUser({
      email: "admin@example.com",
      password: "emulator-only-password",
    });
    await auth.setCustomUserClaims(user.uid, { admin: true });
    const server = spawn(process.execPath, ["scripts/serve.js"], {
      env: { ...process.env, PORT: "4174" },
      stdio: "ignore",
    });
    let browser;
    try {
      for (let i = 0; i < 30; i++) {
        try {
          if ((await fetch("http://127.0.0.1:4174")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      // Allow this suite to run alongside a developer's existing emulators.
      for (const [port, host] of [
        [8080, process.env.FIRESTORE_EMULATOR_HOST],
        [9099, process.env.FIREBASE_AUTH_EMULATOR_HOST],
        [5001, process.env.FUNCTIONS_EMULATOR_HOST],
      ]) {
        if (!host) continue;
        await page.context().route(`http://127.0.0.1:${port}/**`, (route) => {
          const url = new URL(route.request().url());
          url.host = host;
          return route.continue({ url: url.href });
        });
      }
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.log("Browser error:", msg.text());
      });
      await page.goto("http://127.0.0.1:4174/?emulator=1");
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("aia_emulator_v2_players") || "{}")
            .alice?.total === 10,
      );
      assert.ok(
        !(
          await page.evaluate(() =>
            localStorage.getItem("aia_emulator_v2_players"),
          )
        ).includes("private@example.com"),
      );
      await page.evaluate(async () =>
        (await import("/js/navigation.js")).go("admin"),
      );
      await page.locator("#adminEmail").fill("admin@example.com");
      await page.locator("#adminPassword").fill("emulator-only-password");
      await page.locator('#adminLoginForm button[type="submit"]').click();
      await page.evaluate(async () => {
        globalThis.testModules = {
          auth: await import("/js/auth.js"),
          store: await import("/js/store.js"),
          state: await import("/js/state.js"),
        };
      });
      await page.waitForFunction(() => globalThis.testModules.auth.isAdmin());
      const productionPage = await page.context().newPage();
      await productionPage.route(
        "https://identitytoolkit.googleapis.com/**",
        (route) => route.abort(),
      );
      await productionPage.route(
        "https://securetoken.googleapis.com/**",
        (route) => route.abort(),
      );
      await productionPage.route(
        "https://firestore.googleapis.com/**",
        (route) => route.abort(),
      );
      await productionPage.goto("http://127.0.0.1:4174/");
      await productionPage.waitForFunction(async () => {
        const { getApps } =
          await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
        return getApps().some((app) => app.name === "[DEFAULT]");
      });
      assert.equal(
        await productionPage.evaluate(async () => {
          const { getAuth, signOut } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
          const auth = getAuth();
          await auth.authStateReady();
          const uid = auth.currentUser?.uid;
          await signOut(auth);
          return uid || null;
        }),
        null,
      );
      await page.reload();
      await page.waitForFunction(async () =>
        (await import("/js/auth.js")).isAdmin(),
      );
      await page.evaluate(async () => {
        globalThis.testModules = {
          auth: await import("/js/auth.js"),
          store: await import("/js/store.js"),
          state: await import("/js/state.js"),
        };
      });
      await productionPage.close();

      await page.waitForFunction(
        () =>
          globalThis.testModules.store.LS.get("players", {}).alice?.email ===
          "private@example.com",
      );
      await page.evaluate(async () => {
        const { LS } = await import("/js/store.js");
        const p = LS.get("players");
        p.alice.dn = "Alice Changed";
        LS.set("players", p);
      });
      for (let i = 0; i < 50; i++) {
        if (
          (await db.doc(`${LEAGUE_PATH}/players/p_alice`).get()).data().dn ===
          "Alice Changed"
        )
          break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(
        (await db.doc(`${LEAGUE_PATH}/players/p_alice`).get()).data().dn,
        "Alice Changed",
      );
      await page.evaluate(async () =>
        (await import("/js/checkin.js")).checkInPlayer("alice"),
      );
      await page.waitForFunction(() =>
        globalThis.testModules.state
          ._getTonight()
          .some((p) => p.key === "alice"),
      );
      const receipt = await page.evaluate(async () =>
        (await import("/js/results.js")).commitResults({
          gameId: "browser-game",
          positions: { alice: 1 },
        }),
      );
      assert.equal(receipt.awardedCount, 1);
      assert.equal(
        (await db.doc(`${LEAGUE_PATH}/players/p_alice`).get()).data().total,
        undefined,
      );
      await page.waitForFunction(
        () => globalThis.testModules.state.getPlayers().alice.total === 25,
      );
      assert.equal(await page.locator("#s-games").textContent(), "1");
      await page.evaluate(async () => (await import("/js/auth.js")).signOut());
      await page.waitForFunction(
        () => !globalThis.testModules.store.LS.get("players").alice.email,
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
