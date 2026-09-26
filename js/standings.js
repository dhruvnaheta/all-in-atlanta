import { atlantaDateKey, leagueDateKey } from "./league-date.js";

// Only recorded placements count; participation is not an inferred finish.
export function compareStandings(a, b) {
  if (a.pts !== b.pts) return b.pts - a.pts;
  const places = new Set([
    ...Object.keys(a.finishes),
    ...Object.keys(b.finishes),
  ]);
  for (const place of [...places].map(Number).sort((x, y) => x - y)) {
    const difference = (b.finishes[place] || 0) - (a.finishes[place] || 0);
    if (difference) return difference;
  }
  return 0;
}
export function standings(
  players,
  field = "total",
  seriesId,
  now = new Date(),
) {
  const month = atlantaDateKey(now).slice(0, 7);
  const rows = Object.entries(players)
    .map(([key, player]) => {
      const scope = seriesId ? player.bySeries?.[seriesId] : player;
      const finishes = {};
      for (const result of player.gameDates || []) {
        if (seriesId && result.seriesId !== seriesId) continue;
        if (
          field === "month" &&
          leagueDateKey(result.date)?.slice(0, 7) !== month
        )
          continue;
        if (Number.isInteger(result.pos) && result.pos > 0)
          finishes[result.pos] = (finishes[result.pos] || 0) + 1;
      }
      return {
        key,
        dn: player.dn || key,
        pts: Number(scope?.[field]) || 0,
        games: scope?.[field === "month" ? "monthGames" : "games"] || 0,
        streak: Number(player.currentStreak) || 0,
        finishes,
      };
    })
    .filter((row) => row.pts > 0)
    .sort(
      (a, b) =>
        compareStandings(a, b) ||
        a.dn.localeCompare(b.dn) ||
        a.key.localeCompare(b.key),
    );
  rows.forEach((row, i) => {
    row.rank =
      i && compareStandings(rows[i - 1], row) === 0 ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
