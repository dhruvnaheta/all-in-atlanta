import { leagueDateKey } from "./league-date.js";
export const PT = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4 };
// Per-player, per-game ceiling for manual corrections.
export const MAX_EDITED_POINTS = 100;
export const ptFor = (p) => PT[p] ?? 1;

// ── Streak helpers ───────────────────────────────
// Streaks are based on EVERY scheduled All In Atlanta game, not calendar weeks.
// League schedule: through Sep 10, 2026 it is Wednesday (5Paces) -> Thursday (Wicked Wolf).
// Starting Sep 14, 2026: Monday (Wicked Wolf) -> Wednesday (5Paces) -> Thursday (Wicked Wolf) -> Monday ...
//
// Rules:
// - Attend the immediately next scheduled game: streak continues.
// - Starting Sep 14, miss any scheduled Monday, Wednesday, or Thursday game: streak resets.
// - The 5th consecutive game completes a streak cycle and is when bonus chips are awarded manually.
// - If the player attends the next scheduled game after completing 5, a new cycle begins at 1.
// - Streaks are replayed chronologically from recorded results.

export const STREAK_TRACKING_VERSION = "games-v2";
export const STREAK_TARGET = 5;

export function parseLeagueDate(dateStr) {
  if (!dateStr) return null;
  const key = leagueDateKey(dateStr);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function sameCalendarDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function nextScheduledLeagueDate(prevDateStr) {
  const prev = parseLeagueDate(prevDateStr);
  if (!prev) return null;
  const next = new Date(prev);
  const wedTransitionDate = new Date(2026, 7, 19); // Wed Aug 19, 2026
  const lastTuesday = new Date(2026, 7, 18); // final Tuesday 5Paces game
  const mondayLaunchDate = new Date(2026, 8, 14); // first Monday Wicked Wolf game
  const lastPreMondayGame = new Date(2026, 8, 10); // Thu Sep 10, 2026

  // Preserve the old Tue/Thu schedule through Aug 18, then transition to Wed/Thu.
  if (prev < lastTuesday) {
    const day = prev.getDay(); // Sun=0, Tue=2, Thu=4
    if (day === 2) {
      // Tuesday -> Thursday
      next.setDate(next.getDate() + 2);
      return next;
    }
    if (day === 4) {
      // Thursday -> Tuesday
      next.setDate(next.getDate() + 5);
      return next;
    }
    for (let i = 1; i <= 7; i++) {
      const probe = new Date(prev);
      probe.setDate(probe.getDate() + i);
      if (probe.getDay() === 2 || probe.getDay() === 4) return probe;
    }
  }

  // The final Tuesday game is immediately followed by the first Wednesday game.
  if (sameCalendarDay(prev, lastTuesday)) return wedTransitionDate;

  // Keep the Wed/Thu streak schedule through the final Thursday before Monday games begin.
  if (prev < lastPreMondayGame) {
    const day = prev.getDay(); // Wed=3, Thu=4
    if (day === 3) {
      // Wednesday -> Thursday
      next.setDate(next.getDate() + 1);
      return next;
    }
    if (day === 4) {
      // Thursday -> Wednesday
      next.setDate(next.getDate() + 6);
      return next;
    }
    for (let i = 1; i <= 7; i++) {
      const probe = new Date(prev);
      probe.setDate(probe.getDate() + i);
      if (probe.getDay() === 3 || probe.getDay() === 4) return probe;
    }
  }

  // The Thu Sep 10 game is immediately followed by the first Monday game on Sep 14.
  if (sameCalendarDay(prev, lastPreMondayGame)) return mondayLaunchDate;

  // From Sep 14 onward the league sequence is Monday -> Wednesday -> Thursday -> Monday.
  const day = prev.getDay(); // Mon=1, Wed=3, Thu=4
  if (day === 1) {
    // Monday -> Wednesday
    next.setDate(next.getDate() + 2);
  } else if (day === 3) {
    // Wednesday -> Thursday
    next.setDate(next.getDate() + 1);
  } else if (day === 4) {
    // Thursday -> Monday
    next.setDate(next.getDate() + 4);
  } else {
    // Fallback for legacy/bad dates: walk forward to the next Mon, Wed, or Thu.
    for (let i = 1; i <= 7; i++) {
      const probe = new Date(prev);
      probe.setDate(probe.getDate() + i);
      if (probe.getDay() === 1 || probe.getDay() === 3 || probe.getDay() === 4)
        return probe;
    }
  }
  return next;
}

export function isScheduledLeagueDate(dateStr) {
  const date = parseLeagueDate(dateStr);
  if (!date) return false;
  const days =
    date < new Date(2026, 7, 19)
      ? [2, 4]
      : date < new Date(2026, 8, 14)
        ? [3, 4]
        : [1, 3, 4];
  return days.includes(date.getDay());
}

export function isNextScheduledGame(prevDateStr, curDateStr) {
  const expected = nextScheduledLeagueDate(prevDateStr);
  const current = parseLeagueDate(curDateStr);
  return sameCalendarDay(expected, current);
}

export function previewNextStreak(player, dateStr) {
  // Start clean the first time this new streak system sees the player.
  if (player?.streakTrackingVersion !== STREAK_TRACKING_VERSION) {
    return { count: 1, completed: false };
  }

  const continues = isNextScheduledGame(
    player.lastStreakGameDate || player.lastGameDate,
    dateStr,
  );
  if (!continues) return { count: 1, completed: false };

  const prior = Number(player.currentStreak) || 0;
  // After a completed 5-game cycle, the next consecutive game starts a new cycle at 1.
  if (prior >= STREAK_TARGET) return { count: 1, completed: false };

  const count = prior + 1;
  return { count, completed: count === STREAK_TARGET };
}

export function updatePlayerStreak(player, dateStr, gameId) {
  const next = previewNextStreak(player, dateStr);

  player.currentStreak = next.count;
  player.lastGameDate = dateStr; // keep legacy field populated
  player.lastStreakGameDate = dateStr;
  player.lastStreakGameId = gameId || null;
  player.streakTrackingVersion = STREAK_TRACKING_VERSION;
  player.streakAwardDue = next.completed;
  player.streakAwardAtGameId = next.completed ? gameId || null : null;

  return next;
}

export function streakBonus(streak) {
  return Number(streak) === STREAK_TARGET ? 5000 : 0;
}

export function streakLabel(streak) {
  const n = Number(streak) || 0;
  if (n === 5) return "5-game streak complete 🏆 — award streak chips";
  if (n > 1) return n + "-game streak 🔥";
  if (n === 1) return "1 game toward next streak";
  return "";
}
