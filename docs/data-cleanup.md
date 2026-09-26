# September data cleanup

Local UI changes sort league games and Recent Games by calendar date, newest
first. Selected completed games display SELECTED rather than ACTIVE. Missing
registration dates display Unknown; dates are not inferred from attendance.

The saved statistics snapshot identifies `history_0020` as the 40-player
August 13 fixture for `g_s_wickedwolf_default`. September 24's
`g_1790294674293` is already finalized, but remains selected.

Production access on this cleanup attempt returned Firestore
`PERMISSION_DENIED: Missing or insufficient permissions`. No live documents
were changed. The UI changes have not been deployed.

After restoring authorized Firestore access, the guarded script backs up affected
documents, verifies the fixture identity and finalized September game, and defaults
to a dry run:

```sh
node scripts/cleanup-test-game.js all-in-atlanta-pok backups/game-cleanup-review --firebase-cli-auth
node scripts/cleanup-test-game.js all-in-atlanta-pok backups/game-cleanup-apply --firebase-cli-auth --apply
```

Use a fresh backup directory for each run. Application deletes the confirmed test
history, its game metadata, participants and timer; explicitly marks September 24
completed and closes registration; and clears the active pointer only if it still
selects September 24. A concurrent change to a backed-up document aborts the
transaction. Profiles, contacts, other history, and legacy migration archives
remain intact. Homepage totals derive from remaining history automatically.

The reported contact values require confirmation from the players or administrator.
No replacement emails or registration dates have been guessed.
