# September results audit

Read-only inspection of production public history confirmed all ten September
2026 games have `stopped: true` and no recorded first-through-eighth placements.
The September 24 game (`g_1790294674293`) has ten participants, each with
`pos: "p"` and `pts: 1`. It is finalized and completed.

The stop-game scoring path deliberately awards participation only. A browser
regression test selecting first place and saving normal results passed, recording
25 points. These findings explain the current rankings but do not establish why
the host used the stop path. Restoring historical finish points requires the
actual finishing order; no production results were changed during this audit.
