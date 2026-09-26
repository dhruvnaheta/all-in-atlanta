import test from "node:test";
import assert from "node:assert/strict";
import { personalStats, standing } from "../js/personal-stats.js";
test("personal stats load for zero-point players when others have points", () => {
  for (const total of [0, 100]) {
    const players = {
      alice: { total, month: 0 },
      bob: { total: 200, month: 20 },
      carl: { total: 150, month: 10 },
    };
    const stats = personalStats(players, "alice");
    assert.deepEqual(stats.monthly, { points: 0, rank: null, gap: 10 });
    assert.deepEqual(
      stats.allTime,
      total === 0
        ? { points: 0, rank: null, gap: 150 }
        : { points: 100, rank: 3, gap: 50 },
    );
  }
});
test("personal stats preserve repaired totals, tie ranks and incomplete history", () => {
  const players = {
    alice: {
      key: "alice",
      total: 200,
      month: 10,
      games: 31,
      best: 1,
      gameDates: [
        { gameId: "a", date: "Sep 21, 2026", pos: 1, pts: 25 },
        { gameId: "b", date: "Sep 24, 2026", pos: "p", pts: 1 },
      ],
      bySeries: { s: { total: 25, games: 3 } },
    },
    bob: { total: 200, month: 20, bySeries: { s: { total: 25 } } },
    carl: { total: 225, month: 10, bySeries: { s: { total: 30 } } },
  };
  const before = structuredClone(players),
    stats = personalStats(players, "alice");
  assert.equal(stats.allTime.rank, 2);
  assert.equal(stats.allTime.gap, 25);
  assert.equal(stats.allTime.points, 200);
  assert.equal(stats.games, 31);
  assert.equal(stats.wins, 1);
  assert.equal(stats.topEight, 1);
  assert.equal(stats.results[0].gameId, "b");
  assert.equal(standing(players, "alice", "total", "s").rank, 2);
  assert.deepEqual(players, before);
  assert.equal(personalStats(players, "missing"), null);
  assert.equal(standing({ alice: { total: 0 } }, "alice").rank, null);
});
