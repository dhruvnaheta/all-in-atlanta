import test from "node:test";
import assert from "node:assert/strict";
import { standings, topRanked } from "../js/standings.js";
import {
  isCheckInOpen,
  upcomingGames,
  completedResults,
} from "../js/public-games.js";
const now = new Date("2026-09-25T20:00:00Z");
test("finish counts break points ties and identical records share competition ranks", () => {
  const players = {
    davis: { total: 20 },
    will: { total: 20, gameDates: [{ pos: 2 }] },
    other: { total: 20, gameDates: [{ pos: 2 }] },
    winner: { total: 20, gameDates: [{ pos: 1 }] },
    frequent: { total: 20, gameDates: [{ pos: 2 }, { pos: 2 }] },
  };
  assert.deepEqual(
    standings(players).map((r) => [r.key, r.rank]),
    [
      ["winner", 1],
      ["frequent", 2],
      ["other", 3],
      ["will", 3],
      ["davis", 5],
    ],
  );
});
test("tiebreakers use the selected month and series, including Atlanta month boundary", () => {
  const players = {
    a: {
      month: 20,
      total: 20,
      bySeries: { s: { month: 20 } },
      gameDates: [
        { pos: 1, date: "2026-08-31", seriesId: "s" },
        { pos: 1, date: "2026-09-01", seriesId: "other" },
      ],
    },
    b: {
      month: 20,
      total: 20,
      bySeries: { s: { month: 20 } },
      gameDates: [{ pos: 2, date: "2026-09-01", seriesId: "s" }],
    },
  };
  assert.equal(standings(players, "month", "s", now)[0].key, "b");
  assert.equal(
    standings(players, "month", "s", new Date("2026-09-01T02:00:00Z"))[0].key,
    "a",
  );
  assert.equal(standings(players, "total", undefined, now)[0].key, "a");
});
test("Friday lists all recurring nights without offering stale Thursday check-in", () => {
  assert.equal(
    isCheckInOpen(
      { status: "running", registrationOpen: true, date: "2026-09-24" },
      now,
    ),
    false,
  );
  assert.equal(
    isCheckInOpen(
      { status: "running", registrationOpen: true, date: "2026-09-25" },
      now,
    ),
    true,
  );
  assert.deepEqual(
    upcomingGames(
      [1, 3, 4].map((day) => ({ day, time: "8:00 PM" })),
      now,
    ).map((g) => g.date),
    ["2026-09-28", "2026-09-30", "2026-10-01"],
  );
});
test("completed attendance comes from saved results and missing history is explicit", () => {
  assert.deepEqual(
    completedResults({ id: "g" }, [
      { gameId: "g", results: [{ key: "will", pts: 18 }] },
    ]),
    [{ key: "will", pts: 18 }],
  );
  assert.equal(completedResults({ id: "other" }, []), null);
});

test("game date labels preserve the calendar date across storage formats", async () => {
  const { formatLeagueDate } = await import("../js/league-date.js");
  assert.equal(formatLeagueDate("2026-10-01"), "Oct 1, 2026");
  assert.equal(formatLeagueDate("Oct 1, 2026"), "Oct 1, 2026");
  assert.equal(formatLeagueDate("2026-10-03"), "Oct 3, 2026");
});
test("rankings show the top 50 places, including everyone tied at the cutoff", () => {
  // 60 players with distinct points: ranks 1-60, only the first 50 are shown.
  const distinct = Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => [`p${i}`, { total: 100 - i }]),
  );
  const rows = standings(distinct);
  assert.equal(rows.length, 60);
  assert.equal(topRanked(rows).length, 50);
  assert.equal(topRanked(rows).at(-1).rank, 50);
  // 49 leaders, then 5 players tied for 50th, then more below: all 54 are shown.
  const tied = Object.fromEntries([
    ...Array.from({ length: 49 }, (_, i) => [`lead${i}`, { total: 200 - i }]),
    ...Array.from({ length: 5 }, (_, i) => [`tie${i}`, { total: 10 }]),
    ...Array.from({ length: 6 }, (_, i) => [`rest${i}`, { total: 5 - i / 10 }]),
  ]);
  const shown = topRanked(standings(tied));
  assert.equal(shown.length, 54);
  assert.ok(shown.slice(-5).every((row) => row.rank === 50));
  // A tie that starts above 50 and runs past it is shown in full.
  const crossing = Object.fromEntries([
    ...Array.from({ length: 47 }, (_, i) => [`lead${i}`, { total: 200 - i }]),
    ...Array.from({ length: 10 }, (_, i) => [`tie${i}`, { total: 10 }]),
    ["last", { total: 1 }],
  ]);
  const crossingShown = topRanked(standings(crossing));
  assert.equal(crossingShown.length, 57);
  assert.ok(crossingShown.slice(-10).every((row) => row.rank === 48));
  // Fewer than 50 ranked players: everyone is shown, including 1-point players.
  assert.equal(topRanked(standings({ a: { total: 3 }, b: { total: 1 } })).length, 2);
  // A big tie of 1-point players at the cutoff is left out (this month's case:
  // 48 players with 2+ points, then 62 tied on 1 point at rank 49).
  const onePoint = Object.fromEntries([
    ...Array.from({ length: 48 }, (_, i) => [`lead${i}`, { total: 100 - i }]),
    ...Array.from({ length: 62 }, (_, i) => [`one${i}`, { total: 1 }]),
  ]);
  const onePointShown = topRanked(standings(onePoint));
  assert.equal(onePointShown.length, 48);
  assert.ok(onePointShown.every((row) => row.pts > 1));
  // A small 1-point tie that fits within 50 is still shown.
  const smallTie = Object.fromEntries([
    ...Array.from({ length: 48 }, (_, i) => [`lead${i}`, { total: 100 - i }]),
    ...Array.from({ length: 2 }, (_, i) => [`one${i}`, { total: 1 }]),
  ]);
  assert.equal(topRanked(standings(smallTie)).length, 50);
});
