export const PT = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4 };
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
// - Existing historical streak values are NOT recalculated. The first game scored under this version
//   starts a clean forward-tracked streak cycle for each player.

export const STREAK_TRACKING_VERSION = "games-v2";
export const STREAK_TARGET = 5;

export function parseLeagueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
  const dateStr =
    game?.date ||
    now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
  const streakSummary = [];
  let awardedCount = 0;
  let alreadyAppliedCount = 0;

  results.forEach((r) => {
    if (!players[r.key]) {
      players[r.key] = {
        key: r.key,
        dn: r.name,
        total: 0,
        month: 0,
        games: 0,
        best: null,
        registered: dateStr,
        gameDates: [],
        currentStreak: 0,
        lastGameDate: null,
        bySeries: {},
      };
    }

    const p = players[r.key];
    if (!Array.isArray(p.gameDates)) p.gameDates = [];
    if (!p.bySeries) p.bySeries = {};
    if (!p.bySeries[seriesId])
      p.bySeries[seriesId] = { total: 0, month: 0, games: 0 };

    // Second layer of duplicate protection in case a partial save ever occurred.
    if (p.gameDates.some((g) => g && g.gameId === gameId)) {
      alreadyAppliedCount++;
      return;
    }

    const pts = Number(r.pts) || 1;
    p.total = (Number(p.total) || 0) + pts;
    p.month = (Number(p.month) || 0) + pts;
    p.games = (Number(p.games) || 0) + 1;

    const bs = p.bySeries[seriesId];
    bs.total = (Number(bs.total) || 0) + pts;
    bs.month = (Number(bs.month) || 0) + pts;
    bs.games = (Number(bs.games) || 0) + 1;

    if (
      typeof r.pos === "number" &&
      (p.best === null || p.best === undefined || r.pos < Number(p.best))
    )
      p.best = r.pos;

    // Permanent per-player record for this exact game.
    p.gameDates.push({
      gameId,
      date: dateStr,
      gameName,
      pos: r.pos,
      pts,
      seriesId,
      checkInTime: r.checkInTime,
      trackingVersion: "forward-v1",
    });

    // Streak tracking only — chips are awarded manually at 5 consecutive games.
    const streakResult = updatePlayerStreak(p, dateStr, gameId);
    if (streakResult.completed) {
      streakSummary.push({ name: p.dn, streak: STREAK_TARGET, awardDue: true });
    }
    awardedCount++;
  });

  if (results.length) {
    history.push({
      gameId,
      gameName,
      date: dateStr,
      seriesId,
      completedAt: now.toISOString(),
      trackingVersion: "forward-v1",
      attendanceCount: results.length,
      attendanceKeys: results.map((r) => r.key),
      results,
      streakSummary,
      ...(stopped ? { stopped: true } : {}),
    });
  }
  return { players, history, streakSummary, awardedCount, alreadyAppliedCount };
}
