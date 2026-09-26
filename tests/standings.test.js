import test from "node:test";
import assert from "node:assert/strict";
import { standings } from "../js/standings.js";
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
