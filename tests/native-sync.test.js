import test from "node:test";
import assert from "node:assert/strict";
import { connectNativeSync } from "../js/native-sync.js";
import { createStore } from "../js/store.js";
import { LEAGUE_PATH as root } from "../js/schema.js";
function harness() {
  const listeners = new Map(),
    cancelled = [],
    errors = [];
  const sdk = {
    collection: (_, path) => path,
    doc: (_, path) => path,
    onSnapshot: (path, next, error) => {
      listeners.set(path, { next, error });
      return () => {
        cancelled.push(path);
        listeners.delete(path);
      };
    },
  };
  const store = createStore();
  const sync = connectNativeSync(store, sdk, {}, (error) => errors.push(error));
  const collection = (path, rows) =>
    listeners
      .get(root + "/" + path)
      .next({
        docs: rows.map((data) => ({
          data: () => data,
          id: data.key || data.id,
        })),
      });
  const doc = (path, value) =>
    listeners.get(root + "/" + path).next({ data: () => value });
  return { listeners, cancelled, errors, store, sync, collection, doc };
}
test("only active game gets attendance and timer subscriptions; timer updates are targeted", async () => {
  const h = harness();
  const events = [];
  h.store.subscribe((event) => events.push(event));
  h.collection("players", []);
  h.collection("series", []);
  h.collection("history", []);
  h.collection("games", [
    { id: "a", scheduled: true, state: "open" },
    { id: "b", scheduled: true, state: "closed" },
  ]);
  h.doc("settings/current", { activeGameId: "a" });
  assert.ok(h.listeners.has(root + "/games/a/participants"));
  assert.ok(!h.listeners.has(root + "/games/b/participants"));
  h.collection("games/a/participants", [
    { key: "alice", checkIn: { key: "alice" } },
  ]);
  h.doc("games/a/runtime/timer", {
    timerState: {
      running: false,
      levelIdx: 0,
      pausedRemaining: 5000,
      levelStartTs: null,
    },
  });
  await h.sync.initialized;
  events.length = 0;
  h.doc("games/a/runtime/timer", {
    timerState: {
      running: true,
      levelIdx: 0,
      pausedRemaining: null,
      levelStartTs: 1000,
    },
  });
  assert.deepEqual(events.at(-1).keys, ["timerState"]);
  const late = h.listeners.get(root + "/games/a/participants").next;
  h.doc("settings/current", { activeGameId: "b" });
  late({ docs: [{ data: () => ({ checkIn: { key: "stale" } }) }] });
  assert.deepEqual(h.store.get("attendance"), []);
  assert.ok(h.cancelled.includes(root + "/games/a/participants"));
  h.sync.stop();
  assert.equal(h.listeners.size, 0);
});
test("listener failure is reported and does not indefinitely block other slice updates", async () => {
  const h = harness();
  const rejected = assert.rejects(h.sync.initialized, /denied/);
  h.listeners.get(root + "/players").error(new Error("denied"));
  await rejected;
  h.doc("settings/current", { activeGameId: null });
  h.collection("series", [{ id: "series" }]);
  assert.equal(h.store.get("seriesList")[0].id, "series");
  assert.equal(h.errors.length, 1);
  h.sync.stop();
});
