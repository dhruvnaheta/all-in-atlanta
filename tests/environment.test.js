import test from "node:test";
import assert from "node:assert/strict";

test("emulator login, cache and navigation stay separate from production", async () => {
  const previous = globalThis.location;
  try {
    globalThis.location = new URL("http://localhost/?emulator=1");
    const local = await import("../js/environment.js?local-test");
    globalThis.location = new URL("http://localhost/");
    const production = await import("../js/environment.js?production-test");
    assert.equal(local.emulator, true);
    assert.equal(production.emulator, false);
    assert.notEqual(local.firebaseAppName, production.firebaseAppName);
    assert.notEqual(local.cachePrefix, production.cachePrefix);
    assert.equal(
      local.environmentURL("/account").searchParams.get("emulator"),
      "1",
    );
    assert.equal(local.environmentURL("https://example.com/").search, "");
    assert.equal(production.environmentURL("/account").search, "");
    globalThis.location = new URL("https://allinatlanta.com/?emulator=1");
    assert.equal(
      (await import("../js/environment.js?host-test")).emulator,
      false,
    );
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});
