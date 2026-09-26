# Calculated league statistics

Administrators can use **Edit results** on a played game to correct its date,
finishing positions, and awarded points. Changing a finish fills in standard
points; the points field accepts a non-negative whole-number award, including
zero. Corrections update the ledger and participant records together. Deploy the
updated `correctResults` function and publish the frontend to use point overrides.

`leagues/atlanta-v2/history` is the authoritative result ledger. Every finalized
game has a stable `gameId`, calendar `date`, optional `seriesId`, and results
containing player key, placement, and points actually awarded. Finalization
writes the result and closes the game in one transaction. Repeated submissions
return the existing receipt.

`js/stats.js` derives player points, games, monthly points/games, best finish,
per-series totals, game history, streaks, and league game/attendance totals.
The same projection runs in the browser and during backend scoring. Profiles
hold identity and registration metadata; aggregate counters are not editable
or authoritative. The old profile totals are retained in the private audit
backup before removal from Firestore.

- Count one game per `gameId` (or stable legacy history document ID when absent).
  Identical duplicate game/player results count once; conflicting copies fail
  explicitly instead of silently picking an award.
- Sum recorded `pts`, preserving historical awards. Future games use the existing
  scoring schedule: 25/18/15/12/10/8/6/4 for places 1–8, otherwise 1 point.
- Monthly statistics use the game's calendar date and the current month in
  `America/New_York`. They roll over without a reset operation. Monthly ranking
  game counts also cover that month only.
- Rebuild streaks in game-date order using the existing scheduled-night and
  five-game-cycle rules. Missing a scheduled league date with a finalized game
  resets the active streak and current award eligibility, even if the player
  never returns. Attendance at any game on that date satisfies the night; multiple
  games on one date advance the streak once. Off-schedule events do not count as
  misses. Historical Tue/Thu and Wed/Thu schedules remain respected. Last-attended
  dates and historical results remain intact. The next check-in preview also
  resets the streak if a scheduled night was missed. Streak chips do not add
  ranking points.
- Count finalized empty/stopped games. Scheduled games and current check-ins do
  not add completed games or points.
- Historical results for missing/deleted profiles count in league totals, but
  do not recreate profiles or appear as current-player ranking rows.
- Unknown series stay unassigned; they count in combined statistics only.
- Do not add `participants.results`, legacy attendance, or profile `gameDates`:
  these are overlapping copies of the result ledger, not additional events.

The September 26, 2026 live audit found 29 result-bearing game records, 537
attendances and 592 awarded points. The 231 current profiles account for 486
attendances and 541 points; deleted/missing profiles account for the remainder.
September has 10 recorded games and 151 awarded points across all historical
players. Prior stored profiles totaled 692 points and 510 games; the UI also
added an unsupported 39-game baseline. Those offsets are no longer used.
The backup's 115 per-player game entries and 13 attendance records overlap
history, including explicitly labeled legacy recovery records. No additional
completed games can be established from those copies.

Run `node scripts/audit-stats.js PROJECT BACKUP_DIRECTORY --firebase-cli-auth`
for a private current snapshot. Add `--remove-counters` only after deploying the
calculated-statistics app; the script backs up before atomically removing
obsolete profile counters, with document update-time preconditions.

Tests cover duplicate and conflicting records, stale counters, deleted profiles,
unknown series, empty games, Atlanta month boundaries, streak replay, concurrent
finalization, backend rejection of manual counters, and a real emulator browser
flow. Backups remain excluded from Git and public hosting.
