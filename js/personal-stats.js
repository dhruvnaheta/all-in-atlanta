import { standings } from "./standings.js";
// Read-only presentation of the shared calculated player projection.
import { nextScheduledLeagueDate, STREAK_TRACKING_VERSION } from "./scoring.js";
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export function standing(players, key, field = "total", seriesId) {
  const rows = standings(players, field, seriesId);
  const mine = rows.find((row) => row.key === key);
  const above = rows.filter((row) => row.pts > (mine?.pts || 0));
  return {
    points: mine?.pts || 0,
    rank: mine?.rank || null,
    gap: above.length ? Math.min(...above.map((row) => row.pts)) - (mine?.pts || 0) : 0,
  };
}
export function personalStats(players, key) {
  const player = players[key];
  if (!player) return null;
  const records = (
    Array.isArray(player.gameDates) ? player.gameDates : []
  ).filter((record) => record && typeof record === "object");
  // getPlayers supplies gameDates rebuilt from the canonical result ledger.
  const results = [...records].sort(
    (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0),
  );
  const wins = results.filter((r) => Number(r.pos) === 1).length;
  const topEight = results.filter(
    (r) =>
      Number.isInteger(Number(r.pos)) &&
      Number(r.pos) >= 1 &&
      Number(r.pos) <= 8,
  ).length;
  const tracked = player.streakTrackingVersion === STREAK_TRACKING_VERSION;
  const streak = tracked
    ? Math.min(5, Math.max(0, number(player.currentStreak)))
    : 0;
  const nextStreakDate = tracked
    ? nextScheduledLeagueDate(player.lastStreakGameDate || player.lastGameDate)
    : null;
  return {
    player,
    results,
    wins,
    topEight,
    streak,
    nextStreakDate,
    monthly: standing(players, key, "month"),
    allTime: standing(players, key),
    games: number(player.games),
    best: player.best || null,
  };
}
