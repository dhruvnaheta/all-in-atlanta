import test from "node:test";
import assert from "node:assert/strict";
import { autoLinkAccount, configureAccount } from "../js/account.js";

test("automatic linking preserves supported backend results", async () => {
  for (const linked of [true, false]) {
    configureAccount(async (request) => {
      assert.deepEqual(request, { action: "autoLink" });
      return { linked };
    });
    assert.deepEqual(await autoLinkAccount(), { linked });
  }
});

test("older account functions fall back to manual profile linking", async () => {
  configureAccount(async () => {
    throw Object.assign(new Error("Unknown account action."), {
      code: "functions/failed-precondition",
    });
  });
  assert.deepEqual(await autoLinkAccount(), { linked: false });
});

test("automatic linking still surfaces maintenance, permission and network failures", async () => {
  for (const [code, message] of [
    ["functions/failed-precondition", "League maintenance is in progress."],
    ["functions/permission-denied", "Permission denied."],
    ["functions/unavailable", "Service unavailable."],
    ["functions/internal", "Unknown account action."],
  ]) {
    const error = Object.assign(new Error(message), { code });
    configureAccount(async () => {
      throw error;
    });
    await assert.rejects(autoLinkAccount(), (caught) => caught === error);
  }
});
