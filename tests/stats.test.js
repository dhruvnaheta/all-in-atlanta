import test from "node:test";
import assert from "node:assert/strict";
import { calculateStats } from "../js/stats.js";
import { scoreGame } from "../js/scoring.js";
import { leagueDateKey } from "../js/league-date.js";
const profiles = {
  a: {
    key: "a",
    dn: "A",
    total: 999,
    month: 999,
    games: 999,
    gameDates: [{ gameId: "phantom" }],
  },
};
const record = (gameId, date, pts = 1, extra = {}) => ({
  gameId,
  date,
  seriesId: "s",
  results: [{ key: "a", pts, pos: "p" }],
  ...extra,
});
const now = new Date("2026-09-26T12:00:00Z");
test("result ledger replaces stale counters and deduplicates copies by game and player", () => {
  const game = record("g", "Sep 24, 2026", 25, {
    results: [
      { key: "a", pts: 25, pos: 1 },
      { key: "deleted", pts: 1, pos: "p" },
    ],
  });
  const stats = calculateStats(profiles, [game, structuredClone(game)], now);
  assert.deepEqual(stats.totals, {
    games: 1,
    points: 26,
    attendances: 2,
    monthPoints: 26,
    monthGames: 1,
  });
  assert.equal(stats.players.a.total, 25);
  assert.equal(stats.players.a.games, 1);
  assert.equal(stats.players.a.best, 1);
  assert.equal(stats.players.a.bySeries.s.total, 25);
  assert.equal(stats.players.deleted, undefined);
  assert.equal(profiles.a.total, 999);
  assert.throws(
    () => calculateStats(profiles, [game, record("g", "Sep 24, 2026", 2)], now),
    /Conflicting results/,
  );
});
test("month rollover uses Atlanta midnight, game dates stay timezone independent", () => {
  const history = [
    record("aug", "2026-08-31", 25),
    record("sep", "Sep 24, 2026", 18),
  ];
  const before = calculateStats(
    profiles,
    history,
    new Date("2026-10-01T03:59:59Z"),
  ).players.a;
  const after = calculateStats(
    profiles,
    history,
    new Date("2026-10-01T04:00:00Z"),
  ).players.a;
  assert.equal(before.total, 43);
  assert.equal(before.month, 18);
  assert.equal(before.monthGames, 1);
  assert.equal(after.total, 43);
  assert.equal(after.month, 0);
  assert.equal(after.bySeries.s.month, 0);
  assert.equal(leagueDateKey("Sep 24, 2026"), "2026-09-24");
  assert.equal(leagueDateKey("2026-02-30"), null);
});
test("unknown series stays unassigned and separate games on one date remain separate", () => {
  const stats = calculateStats(
    profiles,
    [
      record("one", "Sep 24, 2026", 1, { seriesId: null }),
      record("two", "Sep 24, 2026"),
    ],
    now,
  );
  assert.equal(stats.players.a.games, 2);
  assert.equal(stats.players.a.bySeries.s.games, 1);
  assert.equal(stats.players.a.bySeries.default, undefined);
});
test("streaks replay in date order, complete five, reset after missed scheduled game", () => {
  const dates = [
    "Sep 14, 2026",
    "Sep 16, 2026",
    "Sep 17, 2026",
    "Sep 21, 2026",
    "Sep 23, 2026",
  ];
  const history = dates.map((date, i) => record(String(i), date));
  const stats = calculateStats(profiles, [...history].reverse(), now);
  assert.equal(stats.players.a.currentStreak, 5);
  assert.equal(stats.players.a.streakAwardDue, true);
  assert.equal(
    calculateStats(profiles, [...history, record("six", "Sep 24, 2026")], now)
      .players.a.currentStreak,
    1,
  );
  assert.equal(
    calculateStats(profiles, [...history, record("miss", "Sep 28, 2026")], now)
      .players.a.currentStreak,
    1,
  );
});
test("empty stopped games count; scoring replays previous results rather than prior counters", () => {
  const history = [record("old", "Aug 31, 2026", 18)];
  const result = scoreGame({
    players: profiles,
    history,
    game: { id: "new", date: "Sep 24, 2026", seriesId: "s" },
    tonight: [{ key: "a" }],
    positions: { a: 1 },
    now,
  });
  assert.equal(result.players.a.total, 43);
  assert.equal(result.players.a.month, 25);
  const empty = scoreGame({
    players: profiles,
    history,
    game: { id: "empty", date: "Sep 24, 2026", seriesId: "s" },
    tonight: [],
    stopped: true,
    now,
  });
  assert.equal(calculateStats(profiles, empty.history, now).totals.games, 2);
});
