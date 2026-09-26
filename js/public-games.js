import { atlantaDateKey, leagueDateKey } from "./league-date.js";

export function isCheckInOpen(game, now = new Date()) {
  return (
    game?.status === "running" &&
    game.registrationOpen &&
    leagueDateKey(game.date) === atlantaDateKey(now)
  );
}
export function checkInStatus(game, now = new Date()) {
  if (isCheckInOpen(game, now)) return "Check-in OPEN";
  if (game?.status === "running" && game.registrationOpen)
    return "Check-in unavailable · only on the game date (Atlanta time)";
  return "Check-in CLOSED";
}
export function upcomingGames(series, now = new Date()) {
  const today = atlantaDateKey(now);
  return series
    .map((item) => {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(
        date.getUTCDate() + ((item.day - date.getUTCDay() + 7) % 7),
      );
      return { ...item, date: date.toISOString().slice(0, 10) };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
}
export function completedResults(game, history) {
  const records = history.filter((record) => record.gameId === game?.id);
  if (!records.length) return null;
  return [
    ...new Map(
      records
        .flatMap((record) => record.results || [])
        .map((result) => [result.key, result]),
    ).values(),
  ];
}
