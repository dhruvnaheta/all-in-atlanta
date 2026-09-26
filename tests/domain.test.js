import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreGame,
  previewNextStreak,
  nextScheduledLeagueDate,
  STREAK_TRACKING_VERSION,
} from "../js/scoring.js";
import {
  startTimer,
  pauseTimer,
  remainingTime,
  advanceTimer,
  jumpTimer,
} from "../js/timer.js";
import { applyCheckIn } from "../js/checkin-model.js";

const game = {
  id: "g_1",
  seriesId: "s_1",
  date: "Sep 24, 2026",
  name: "Thursday",
  state: "closed",
};
const player = {
  key: "alice",
  dn: "Alice",
  total: 10,
  month: 2,
  games: 3,
  gameDates: [],
  legacyAttendanceBackfillV1: { gamesAdded: 0, pointsAdded: 0 },
};
const scoringInput = () => ({
  players: { alice: structuredClone(player) },
  history: [],
  game,
  tonight: [
    { key: "alice", time: "8:01 PM" },
    { key: "bob", time: "8:02 PM" },
  ],
  positions: { alice: "1" },
});

test("scoring derives totals from results, awards participation, and leaves its input untouched", () => {
  const input = scoringInput();
  const result = scoreGame(input);
  assert.equal(result.players.alice.total, 25);
  assert.equal(result.players.alice.games, 1);
  assert.equal(result.players.bob.total, 1);
  assert.equal(result.players.bob.games, 1);
  assert.equal(result.history[0].attendanceCount, 2);
  assert.equal(result.history[0].gameId, "g_1");
  assert.equal(input.players.alice.total, 10);
  assert.deepEqual(input.history, []);
  assert.equal(result.players.alice.bySeries.s_1.total, 25);
});
test("a repeated game is rejected, including the stop-game path", () => {
  const input = scoringInput();
  const result = scoreGame(input);
  for (const stopped of [false, true])
    assert.throws(
      () => scoreGame({ ...input, ...result, stopped }),
      /already been scored/,
    );
});
test("an obsolete profile ledger cannot suppress a new result", () => {
  const input = scoringInput();
  input.players.alice.gameDates = [{ gameId: game.id }];
  const result = scoreGame(input);
  assert.equal(result.players.alice.total, 25);
  assert.equal(result.players.alice.games, 1);
  assert.equal(result.alreadyAppliedCount, 0);
  assert.equal(result.history[0].attendanceCount, 2);
});
test("invalid and duplicate placements reject the entire scoring update", () => {
  for (const positions of [
    { alice: "1", bob: "1" },
    { alice: "9" },
    { alice: "1.5" },
  ])
    assert.throws(() => scoreGame({ ...scoringInput(), positions }));
  const input = scoringInput();
  input.tonight.push(input.tonight[0]);
  assert.throws(() => scoreGame(input), /Duplicate player/);
});
test("stopping a game awards participation through the same ledger", () => {
  const result = scoreGame({ ...scoringInput(), stopped: true });
  assert.equal(result.players.alice.total, 1);
  assert.equal(result.history[0].stopped, true);
  assert.equal(result.players.alice.gameDates[0].pts, 1);
});
test("streak schedule retains both historical transitions and current league nights", () => {
  const pairs = [
    ["Aug 13, 2026", "Aug 18, 2026"],
    ["Aug 18, 2026", "Aug 19, 2026"],
    ["Aug 19, 2026", "Aug 20, 2026"],
    ["Sep 10, 2026", "Sep 14, 2026"],
    ["Sep 14, 2026", "Sep 16, 2026"],
    ["Sep 16, 2026", "Sep 17, 2026"],
    ["Sep 17, 2026", "Sep 21, 2026"],
  ];
  for (const [from, to] of pairs)
    assert.equal(
      nextScheduledLeagueDate(from).getTime(),
      new Date(to).getTime(),
    );
});
test("fifth-game streak completes, missing a night resets, and a completed cycle restarts", () => {
  const p = {
    streakTrackingVersion: STREAK_TRACKING_VERSION,
    lastStreakGameDate: "Sep 23, 2026",
    currentStreak: 4,
  };
  assert.deepEqual(previewNextStreak(p, "Sep 24, 2026"), {
    count: 5,
    completed: true,
  });
  assert.deepEqual(previewNextStreak(p, "Sep 28, 2026"), {
    count: 1,
    completed: false,
  });
  assert.deepEqual(
    previewNextStreak({ ...p, currentStreak: 5 }, "Sep 24, 2026"),
    { count: 1, completed: false },
  );
  assert.equal(
    previewNextStreak({ ...p, streakTrackingVersion: null }, "Sep 24, 2026")
      .count,
    1,
  );
});
test("timer pause/resume preserves remaining time across reloads", () => {
  const initial = {
    levelIdx: 0,
    running: false,
    levelStartTs: null,
    pausedRemaining: 60000,
  };
  const running = startTimer(initial, 60000, 1000);
  const paused = pauseTimer(running, 60000, 16000);
  assert.equal(paused.pausedRemaining, 45000);
  const resumed = startTimer(JSON.parse(JSON.stringify(paused)), 60000, 100000);
  assert.equal(remainingTime(resumed, 60000, 110000), 35000);
  assert.equal(initial.running, false);
});
test("timer advances at the boundary, handles breaks and repeats its final level", () => {
  const state = {
    levelIdx: 0,
    running: true,
    levelStartTs: 1000,
    pausedRemaining: null,
  };
  assert.deepEqual(advanceTimer(state, [60000, 30000], 60999), state);
  const next = advanceTimer(state, [60000, 30000], 61000);
  assert.equal(next.levelIdx, 1);
  assert.equal(remainingTime(next, 30000, 61000), 30000);
  assert.equal(advanceTimer(next, [60000, 30000], 91000).levelIdx, 1);
  assert.equal(
    jumpTimer({ ...state, running: false }, 1, 30000, 0).pausedRemaining,
    30000,
  );
});
function checkInState() {
  return {
    players: { alice: structuredClone(player) },
    gameList: [{ ...game, state: "open", tonight: [] }],
    activeGameId: game.id,
    gameState: "closed",
    tonight: [],
  };
}
test("public registration cannot supply scores or overwrite an existing player", () => {
  const input = checkInState();
  const next = applyCheckIn(input, {
    action: "checkIn",
    key: "bob",
    profile: { dn: "Bob", total: 999, admin: true },
  });
  assert.equal(next.players.bob.total, 0);
  assert.equal(next.players.bob.admin, undefined);
  assert.equal(input.players.bob, undefined);
  const alice = applyCheckIn(input, {
    action: "checkIn",
    key: "alice",
    profile: { dn: "Mallory", total: 999 },
  });
  assert.equal(alice.players.alice.dn, "Alice");
  assert.equal(alice.players.alice.total, 10);
});
test("check-in enforces game state, duplicate attendance, and safe keys", () => {
  const input = checkInState();
  const next = applyCheckIn(input, { action: "checkIn", key: "alice" });
  assert.throws(
    () =>
      applyCheckIn({ ...input, ...next }, { action: "checkIn", key: "alice" }),
    /Already/,
  );
  input.gameList[0].state = "idle";
  assert.throws(
    () => applyCheckIn(input, { action: "checkIn", key: "alice" }),
    /not open/,
  );
  assert.throws(
    () =>
      applyCheckIn(input, {
        action: "checkIn",
        key: "__proto__",
        profile: { dn: "__proto__" },
      }),
    /Invalid/,
  );
});

test("registration rejects invalid contacts without creating a player or attendance", () => {
  for (const admin of [false, true]) {
    for (const contact of [
      { email: "not-an-email" },
      { phone: "abc" },
      { email: "not-an-email", phone: "abc" },
      { email: "a@@example.com" },
      { email: "a".repeat(255) + "@example.com" },
      { phone: "123" },
      { phone: "1234567890123456" },
      { phone: 4045550100 },
      { email: null },
    ]) {
      const input = checkInState();
      const before = structuredClone(input);
      assert.throws(
        () =>
          applyCheckIn(
            input,
            {
              action: "checkIn",
              key: "bob",
              profile: { dn: "Bob", ...contact },
            },
            new Date(),
            { admin },
          ),
        /valid contact email|valid phone number/,
      );
      assert.deepEqual(input, before);
    }
  }
});

test("registration accepts optional contacts and formatted phone numbers", () => {
  for (const contact of [
    {},
    { email: " ", phone: " " },
    { email: " bob+league@example.com ", phone: " +1 (404) 555-0100 " },
    { phone: "404-555-0100" },
    { phone: "+44 20 7946 0958" },
  ]) {
    const result = applyCheckIn(checkInState(), {
      action: "checkIn",
      key: "bob",
      profile: { dn: "Bob", ...contact },
    });
    assert.equal(result.players.bob.email, contact.email?.trim() || "");
    assert.equal(result.players.bob.phone, contact.phone?.trim() || "");
    assert.equal(result.tonight[0].key, "bob");
  }
});

test("registration collapses whitespace and rejects noncanonical new keys", () => {
  const input = checkInState();
  const next = applyCheckIn(input, {
    action: "checkIn",
    key: "bob smith",
    profile: { dn: "  Bob\t Smith\u00a0 " },
  });
  assert.equal(next.players["bob smith"].dn, "Bob Smith");
  for (const key of ["bob  smith", " bob smith", "bob smith "]) {
    assert.throws(
      () =>
        applyCheckIn(input, {
          action: "checkIn",
          key,
          profile: { dn: key },
        }),
      /valid player name/,
    );
  }
});

test("legacy whitespace and renamed profiles cannot be recreated", () => {
  const input = checkInState();
  input.players["bob  smith"] = { key: "bob  smith", dn: "Robert  Smith" };
  for (const dn of ["Bob Smith", "Robert Smith"]) {
    assert.throws(
      () =>
        applyCheckIn(input, {
          action: "checkIn",
          key: dn.toLowerCase(),
          profile: { dn },
        }),
      /already exists/,
    );
  }
  const next = applyCheckIn(input, { action: "checkIn", key: "bob  smith" });
  assert.equal(next.tonight[0].key, "bob  smith");
});
