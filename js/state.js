import { calculateStats, profileOnly } from "./stats.js";
import { LS } from "./store.js";
import { normalizeGame } from "./game-model.js";
import { advanceTimer, resetTimer } from "./timer.js";
import { BLIND_LEVELS, MIN } from "./blind-structure.js";
export const getLeagueStats = (now = new Date()) =>
  calculateStats(LS.get("players", {}), LS.get("history", []), now);
export const getPlayers = () => getLeagueStats().players;
export const setPlayers = (value) =>
  LS.set(
    "players",
    Object.fromEntries(
      Object.entries(value).map(([key, player]) => [key, profileOnly(player)]),
    ),
  );
export const getHistory = () => LS.get("history", []);
export const getSeriesList = () => LS.get("seriesList", []);
export const setSeriesList = (value) => LS.set("seriesList", value);
export const getGameList = () => LS.get("gameList", []).map(normalizeGame);
export const getActiveGameId = () => LS.get("activeGameId", null);
export const getActiveGame = () =>
  getGameList().find((game) => game.id === getActiveGameId()) || null;
export const _getTonight = () => LS.get("attendance", []);
export const _getState = () => getActiveGame()?.status || "scheduled";
export const getRawTimerState = () =>
  LS.get("timerState", resetTimer(BLIND_LEVELS[0].dur));
export function getTimerState(now = Date.now()) {
  const overrides = LS.get("levelOverrides", {});
  return advanceTimer(
    getRawTimerState(),
    BLIND_LEVELS.map((level, index) =>
      overrides[index] === undefined ? level.dur : overrides[index] * MIN,
    ),
    now,
  );
}
