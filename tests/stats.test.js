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
test("absent players lose stale badges while latest attendees keep their streaks", () => {
  const roster = { ...profiles, ryan: { dn: "Ryan Eck" } };
  const history = [
    record("aug4", "Aug 4, 2026", 1, {
      results: [{ key: "ryan", pts: 1, pos: "p" }],
    }),
    record("aug6", "Aug 6, 2026", 1, {
      results: [{ key: "ryan", pts: 1, pos: "p" }],
    }),
    record("sep23", "Sep 23, 2026"),
    record("sep24", "Sep 24, 2026"),
  ];
  assert.equal(
    calculateStats(roster, history.slice(0, 2), now).players.ryan.currentStreak,
    2,
  );
  const { players } = calculateStats(roster, [...history].reverse(), now);
  assert.equal(players.ryan.currentStreak, 0);
  assert.equal(players.ryan.lastGameDate, "2026-08-06");
  assert.equal(players.ryan.lastStreakGameId, "aug6");
  assert.equal(players.ryan.games, 2);
  assert.equal(players.ryan.total, 2);
  assert.equal(players.a.currentStreak, 2);
});
test("missing the latest game clears a completed cycle and returning starts at one", () => {
  const history = [
    "Sep 14, 2026",
    "Sep 16, 2026",
    "Sep 17, 2026",
    "Sep 21, 2026",
    "Sep 23, 2026",
  ].map((date, i) => record(String(i), date));
  history.push(
    record("missed", "Sep 24, 2026", 1, {
      results: [{ key: "deleted", pts: 1, pos: "p" }],
    }),
  );
  const player = calculateStats(profiles, history, now).players.a;
  assert.equal(player.currentStreak, 0);
  assert.equal(player.streakAwardDue, false);
  assert.equal(player.streakAwardAtGameId, null);
  assert.equal(player.games, 5);
  assert.equal(
    calculateStats(
      profiles,
      [...history, record("return", "Sep 28, 2026")],
      now,
    ).players.a.currentStreak,
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
  assert.equal(empty.players.a.currentStreak, 0);
});

test("off-schedule events preserve absent players' streaks and award eligibility", () => {
  for (const dates of [
    ["2026-09-23", "2026-09-24"],
    ["2026-09-16", "2026-09-17", "2026-09-21", "2026-09-23", "2026-09-24"],
  ]) {
    const history = dates.map((date) => record(date, date));
    const before = calculateStats(profiles, history, now).players.a;
    history.push(record("special", "Sep 26, 2026", 1, { results: [] }));
    assert.deepEqual(calculateStats(profiles, history, now).players.a, before);
    history.push(record("scheduled-miss", "Sep 28, 2026", 1, { results: [] }));
    const after = calculateStats(profiles, history, now).players.a;
    assert.equal(after.currentStreak, 0);
    assert.equal(after.streakAwardDue, false);
    assert.equal(after.streakAwardAtGameId, null);
  }
});
test("games on one night share attendance without resetting or double-counting streaks", () => {
  const roster = { a: {}, b: {}, absent: {} };
  const results = Object.keys(roster).map((key) => ({ key, pts: 1, pos: "p" }));
  const history = [
    record("mon", "Sep 21, 2026", 1, { results }),
    record("wed", "Sep 23, 2026", 1, { results }),
    record("thu-a", "Sep 24, 2026"),
    record("thu-b", "2026-09-24", 1, {
      results: [{ key: "b", pts: 1, pos: "p" }],
    }),
    record("thu-empty", "Sep 24, 2026", 1, { results: [] }),
    record("thu-repeat", "Sep 24, 2026"),
  ];
  for (const records of [history, [...history].reverse()]) {
    const { players, totals } = calculateStats(roster, records, now);
    assert.equal(players.a.currentStreak, 3);
    assert.equal(players.b.currentStreak, 3);
    assert.equal(players.absent.currentStreak, 0);
    assert.equal(players.a.games, 4);
    assert.equal(players.a.total, 4);
    assert.equal(totals.games, 6);
  }
});
test("absence respects historical scheduled-date transitions", () => {
  for (const [attended, event, expected] of [
    [["2026-08-11", "2026-08-13"], "2026-08-17", 2],
    [["2026-08-11", "2026-08-13"], "2026-08-18", 0],
    [["2026-08-13", "2026-08-18"], "2026-08-19", 0],
    [["2026-09-02", "2026-09-03"], "2026-09-07", 2],
    [["2026-09-02", "2026-09-03"], "2026-09-08", 2],
    [["2026-09-02", "2026-09-03"], "2026-09-09", 0],
    [["2026-09-09", "2026-09-10"], "2026-09-14", 0],
  ]) {
    const history = attended.map((date) => record(date, date));
    history.push(record("miss", event, 1, { results: [] }));
    assert.equal(
      calculateStats(profiles, history, now).players.a.currentStreak,
      expected,
      event,
    );
  }
});
