import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGame, transitionGame } from "../js/game-model.js";
import {
  advanceTimer,
  startTimer,
  pauseTimer,
  remainingTime,
} from "../js/timer.js";
import { applyCheckIn } from "../js/checkin-model.js";
test("lifecycle and registration are independent and completed games cannot restart", () => {
  let game = transitionGame({ id: "g", state: "idle" }, "start");
  assert.equal(game.status, "running");
  game = transitionGame(game, "closeRegistration");
  assert.equal(game.status, "running");
  assert.equal(game.registrationOpen, false);
  game = transitionGame(game, "complete");
  assert.equal(game.status, "completed");
  assert.throws(() => transitionGame(game, "start"), /scheduled/);
  assert.equal(
    normalizeGame({ state: "idle", finalized: true }).status,
    "completed",
  );
});
test("clock catches up through multiple blind levels and breaks after a browser reload", () => {
  const raw = {
    levelIdx: 0,
    levelStartTs: 1000,
    pausedRemaining: null,
    running: true,
  };
  const durations = [60000, 30000, 60000, 60000];
  const reloaded = advanceTimer(
    JSON.parse(JSON.stringify(raw)),
    durations,
    121000,
  );
  assert.equal(reloaded.levelIdx, 2);
  assert.equal(remainingTime(reloaded, 60000, 121000), 30000);
  const paused = pauseTimer(reloaded, 60000, 121000);
  const resumed = startTimer(paused, 60000, 1000000);
  assert.equal(remainingTime(resumed, 60000, 1010000), 20000);
  const final = advanceTimer(raw, durations, 1000000);
  assert.equal(final.levelIdx, 3);
  assert.ok(remainingTime(final, 60000, 1000000) > 0);
});
test("closed registration rejects public check-ins; removals require an administrator", () => {
  const snapshot = {
    activeGameId: "g",
    gameList: [
      {
        id: "g",
        status: "running",
        registrationOpen: false,
        tonight: [{ key: "alice" }],
      },
    ],
    players: {
      alice: { key: "alice", dn: "Alice" },
      bob: { key: "bob", dn: "Bob" },
    },
  };
  assert.throws(
    () => applyCheckIn(snapshot, { action: "checkIn", key: "bob" }),
    /not open/,
  );
  assert.throws(
    () => applyCheckIn(snapshot, { action: "remove", key: "alice" }),
    /Administrator/,
  );
  assert.deepEqual(
    applyCheckIn(snapshot, { action: "remove", key: "alice" }, new Date(), {
      admin: true,
    }).tonight,
    [],
  );
});

test("public check-in uses Atlanta's current date while hosts can add late players", () => {
  const now = new Date("2026-10-02T02:00:00Z");
  for (const date of ["2026-09-30", "2026-10-01", "Oct 1, 2026", "2026-10-02", "invalid"]) {
    const snapshot = {
      activeGameId: "g",
      gameList: [{ id: "g", status: "running", registrationOpen: true, date, tonight: [] }],
      players: { alice: { key: "alice", dn: "Alice" } },
    };
    const request = { action: "checkIn", key: "alice" };
    if (["2026-10-01", "Oct 1, 2026"].includes(date))
      assert.equal(applyCheckIn(snapshot, request, now).tonight.length, 1);
    else assert.throws(() => applyCheckIn(snapshot, request, now), /not open/);
    assert.equal(applyCheckIn(snapshot, request, now, { admin: true }).tonight.length, 1);
  }
});
