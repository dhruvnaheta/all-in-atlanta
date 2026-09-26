export * from "./scoring-rules.js";
import { ptFor, STREAK_TARGET } from "./scoring-rules.js";
import { calculateStats } from "./stats.js";
import { atlantaDateKey } from "./league-date.js";
export function gameAlreadyScored(history, gameId) {
  return !!gameId && history.some((h) => h && h.gameId === gameId);
}

// Calculate a complete scoring update without mutating the caller's snapshot.
export function scoreGame({
  players: originalPlayers,
  history: originalHistory,
  game,
  tonight,
  positions = {},
  stopped = false,
  now = new Date(),
}) {
  const players = structuredClone(originalPlayers);
  const history = structuredClone(originalHistory);
  const seriesId = game?.seriesId || "default";
  const dateStr = game?.date || atlantaDateKey(now);
  const gameId =
    game?.id || "legacy_" + seriesId + "_" + dateStr.replace(/\W/g, "_");
  const gameName = game?.name || "All In Atlanta — " + dateStr;
  if (gameAlreadyScored(history, gameId))
    throw new Error(
      "This game has already been scored. No points or game counts were changed.",
    );
  if (!tonight.length && !stopped)
    throw new Error("No players are checked in for this game.");
  const usedPositions = new Set();
  const attendance = new Set();
  const results = tonight.map((checked) => {
    if (attendance.has(checked.key))
      throw new Error("Duplicate player in attendance.");
    attendance.add(checked.key);
    const value = stopped ? "p" : positions[checked.key];
    const pos = !value || value === "p" ? "p" : Number(value);
    if (pos !== "p") {
      if (!Number.isInteger(pos) || pos < 1 || pos > 8)
        throw new Error("Finishing positions must be between 1 and 8.");
      if (usedPositions.has(pos))
        throw new Error(
          "Two players share the same finishing position. Fix the positions before submitting.",
        );
      usedPositions.add(pos);
    }
    return {
      key: checked.key,
      name: players[checked.key]?.dn || checked.key,
      pos,
      pts: ptFor(pos),
      checkInTime: checked.time || null,
    };
  });
  for (const result of results) {
    if (!players[result.key])
      players[result.key] = {
        key: result.key,
        dn: result.name,
        registered: dateStr,
      };
  }
  // The immutable result record is the scoring event. Profile counters and
  // cached gameDates never determine whether points have been awarded.
  const record = {
    gameId,
    gameName,
    date: dateStr,
    seriesId,
    completedAt: now.toISOString(),
    trackingVersion: "results-v1",
    attendanceCount: results.length,
    attendanceKeys: results.map((r) => r.key),
    results,
    ...(stopped ? { stopped: true } : {}),
  };
  history.push(record);
  const calculated = calculateStats(players, history, now).players;
  const streakSummary = results
    .filter((r) => calculated[r.key].streakAwardAtGameId === gameId)
    .map((r) => ({
      name: calculated[r.key].dn,
      streak: STREAK_TARGET,
      awardDue: true,
    }));
  record.streakSummary = streakSummary;
  return {
    players: calculated,
    history,
    streakSummary,
    awardedCount: results.length,
    alreadyAppliedCount: 0,
  };
}
