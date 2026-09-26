import test from "node:test";
import assert from "node:assert/strict";
import { newestGameFirst } from "../js/league-date.js";
import { historyRows } from "../js/views/admin/sections.js";

test("game lists sort mixed legacy and ISO dates newest first, with unknown dates last", () => {
  const games = [
    { date: "Sep 14, 2026" },
    { date: "2026-09-21" },
    { date: "Aug 13, 2026" },
    { date: "Sep 9, 2026" },
    { date: "unknown" },
  ];
  assert.deepEqual(
    [...games].sort(newestGameFirst).map((g) => g.date),
    ["2026-09-21", "Sep 14, 2026", "Sep 9, 2026", "Aug 13, 2026", "unknown"],
  );
});

test("recent history sorts by game date and keeps each detail toggle attached to its original record", () => {
  const history = ["Sep 9, 2026", "Aug 13, 2026", "Sep 3, 2026"].map(
    (date) => ({ date, results: [] }),
  );
  const html = historyRows(history);
  assert.ok(html.indexOf("Sep 9, 2026") < html.indexOf("Sep 3, 2026"));
  assert.ok(html.indexOf("Sep 3, 2026") < html.indexOf("Aug 13, 2026"));
  assert.deepEqual(
    [...html.matchAll(/data-arg0="gh_(\d+)"/g)].map((m) => m[1]),
    ["0", "2", "1"],
  );
  assert.equal(history[1].date, "Aug 13, 2026");
});
