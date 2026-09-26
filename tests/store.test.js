import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/store.js";
const cache = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
test("only confirmed saves enter the cache; failures retain the latest remote state", async () => {
  const store = createStore(cache());
  store.applyRemote("players", { alice: { total: 1 } });
  let resolve, reject;
  store.connect({
    canWrite: () => true,
    write: () =>
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  });
  const pending = store.set("players", { alice: { total: 2 } });
  assert.equal(store.get("players").alice.total, 1);
  resolve();
  await pending;
  assert.equal(store.get("players").alice.total, 2);
  const failed = store.set("players", { alice: { total: 3 } });
  store.applyRemote("players", { alice: { total: 4 } });
  reject(new Error("offline"));
  await assert.rejects(failed, /offline/);
  assert.equal(store.get("players").alice.total, 4);
});
test("anonymous writes and legacy mirrors are rejected; contact fields are not cached", async () => {
  const storage = cache(),
    store = createStore(storage);
  await assert.rejects(store.set("players", {}), /Sign in/);
  store.connect({ canWrite: () => true, write: async () => {} });
  await assert.rejects(store.set("gameState", "open"), /dedicated/);
  await store.set("players", {
    alice: { email: "private@example.test", total: 1 },
  });
  assert.equal(
    JSON.parse(storage.getItem("aia_v2_players")).alice.email,
    undefined,
  );
  assert.equal(store.get("players").alice.email, "private@example.test");
});
test("snapshots notify only changed slices and install them atomically", () => {
  const store = createStore(cache()),
    events = [];
  store.subscribe((event) => events.push(event));
  store.applySnapshot({ players: {}, attendance: [] });
  store.applySnapshot({ players: {}, attendance: [] });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].keys, ["players", "attendance"]);
  store.applySnapshot({ players: {}, attendance: [{ key: "alice" }] });
  assert.deepEqual(events[1].keys, ["attendance"]);
});
test("blocked browser storage still supports an isolated in-memory cache", () => {
  const store = createStore({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  store.applyRemote("players", { alice: { total: 1 } });
  const copy = store.get("players");
  copy.alice.total = 2;
  assert.equal(store.get("players").alice.total, 1);
});
