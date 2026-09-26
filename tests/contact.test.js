import test from "node:test";
import assert from "node:assert/strict";
import { savePatches } from "../backend/operations.js";
import { checkInPlayer, configureCheckIn } from "../js/checkin.js";

test("admin contact patches reject malformed values before any database writes", async () => {
  for (const after of [{ email: "not-an-email" }, { phone: "abc" }]) {
    await assert.rejects(
      savePatches(
        {},
        {
          activeGameId: null,
          patches: [{ path: "playerContacts/p_bob", after }],
        },
      ),
      /valid contact email|valid phone number/,
    );
  }
});

test("invalid registration contacts never reach the save gateway", async () => {
  let calls = 0;
  configureCheckIn(async () => {
    calls++;
  });
  try {
    for (const contact of [{ email: "not-an-email" }, { phone: "abc" }])
      await assert.rejects(
        checkInPlayer("bob", { dn: "Bob", ...contact }),
        /valid contact email|valid phone number/,
      );
    assert.equal(calls, 0);
    await checkInPlayer("bob", { dn: "Bob", phone: "(404) 555-0100" });
    assert.equal(calls, 1);
  } finally {
    configureCheckIn(undefined);
  }
});
