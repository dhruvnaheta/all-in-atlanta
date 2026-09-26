import { atlantaDateKey, leagueDateKey } from "./league-date.js";
import {
  updatePlayerStreak,
  STREAK_TRACKING_VERSION,
} from "./scoring-rules.js";

export const DERIVED_PLAYER_FIELDS = [
  "total",
  "month",
  "games",
  "monthGames",
  "best",
  "gameDates",
  "bySeries",
  "currentStreak",
  "lastGameDate",
  "lastStreakGameDate",
  "lastStreakGameId",
  "streakTrackingVersion",
  "streakAwardDue",
  "streakAwardAtGameId",
];
export function profileOnly(player) {
  return Object.fromEntries(
    Object.entries(player).filter(
      ([key]) => !DERIVED_PLAYER_FIELDS.includes(key),
    ),
  );
}
function emptyStats() {
  return {
    total: 0,
    month: 0,
    games: 0,
    monthGames: 0,
    best: null,
    gameDates: [],
    bySeries: {},
    currentStreak: 0,
    lastGameDate: null,
    lastStreakGameDate: null,
    lastStreakGameId: null,
    streakTrackingVersion: STREAK_TRACKING_VERSION,
    streakAwardDue: false,
    streakAwardAtGameId: null,
  };
}
// History is the result ledger. Participant results are copies; legacy attendance
// and profile gameDates overlap it and must never be added to these totals.
export function calculateStats(profiles, history, now = new Date()) {
  const month = atlantaDateKey(now).slice(0, 7);
  const games = new Map();
  for (const [index, record] of history.entries()) {
    const id = record.gameId || record._id || `legacy_history_${index}`;
    const date = leagueDateKey(record.date);
    const seriesId = record.seriesId || null;
    let game = games.get(id);
    if (!game) {
      game = {
        id,
        date,
        seriesId,
        name: record.gameName || record.date || id,
        results: new Map(),
      };
      games.set(id, game);
    } else if (game.date !== date || game.seriesId !== seriesId) {
      throw new Error(`Conflicting metadata for recorded game ${id}.`);
    }
    for (const result of record.results || []) {
      if (
        typeof result.key !== "string" ||
        !result.key ||
        !Number.isFinite(result.pts) ||
        result.pts < 0
      )
        throw new Error(`Invalid result in recorded game ${id}.`);
      const prior = game.results.get(result.key);
      if (prior && (prior.pts !== result.pts || prior.pos !== result.pos))
        throw new Error(`Conflicting results for ${result.key} in ${id}.`);
      game.results.set(result.key, result);
    }
  }
  const players = Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [
      key,
      { ...profileOnly(profile), ...emptyStats() },
    ]),
  );
  const totals = {
    games: games.size,
    points: 0,
    attendances: 0,
    monthPoints: 0,
    monthGames: 0,
  };
  for (const game of [...games.values()].sort(
    (a, b) =>
      (a.date || "").localeCompare(b.date || "") || a.id.localeCompare(b.id),
  )) {
    const thisMonth = game.date?.slice(0, 7) === month;
    if (thisMonth) totals.monthGames++;
    for (const result of game.results.values()) {
      totals.points += result.pts;
      totals.attendances++;
      if (thisMonth) totals.monthPoints += result.pts;
      // Deleted profiles remain in league history, but aren't recreated by a projection.
      const player = Object.hasOwn(players, result.key)
        ? players[result.key]
        : null;
      if (!player) continue;
      const add = (target) => {
        target.total += result.pts;
        target.games++;
        if (thisMonth) {
          target.month += result.pts;
          target.monthGames++;
        }
      };
      add(player);
      if (game.seriesId) {
        if (!Object.hasOwn(player.bySeries, game.seriesId))
          Object.defineProperty(player.bySeries, game.seriesId, {
            value: { total: 0, month: 0, games: 0, monthGames: 0 },
            enumerable: true,
          });
        add(player.bySeries[game.seriesId]);
      }
      if (Number.isInteger(result.pos) && result.pos > 0)
        player.best =
          player.best === null ? result.pos : Math.min(player.best, result.pos);
      player.gameDates.push({
        gameId: game.id,
        date: game.date,
        gameName: game.name,
        seriesId: game.seriesId,
        pos: result.pos,
        pts: result.pts,
        checkInTime: result.checkInTime || null,
      });
      if (game.date) updatePlayerStreak(player, game.date, game.id);
    }
  }
  return { players, totals, month };
}
