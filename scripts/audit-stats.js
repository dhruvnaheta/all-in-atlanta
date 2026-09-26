import { calculateStats, profileOnly } from "../js/stats.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deleteApp } from "firebase-admin/app";
import { adminDatabase } from "./admin-db.js";
import { LEAGUE_PATH } from "../js/schema.js";
const project = process.argv[2];
const directory = resolve(process.argv[3] || "backups/stats-audit");
if (!project)
  throw new Error(
    "Usage: node scripts/audit-stats.js PROJECT BACKUP_DIRECTORY [--firebase-cli-auth]",
  );
const { app, db } = await adminDatabase(
  project,
  process.argv.includes("--firebase-cli-auth"),
);
try {
  const names = ["players", "history", "games", "legacyAttendance"];
  const snapshots = await db.runTransaction(
    async (tx) =>
      Promise.all(
        names.map((name) => tx.get(db.collection(`${LEAGUE_PATH}/${name}`))),
      ),
    { readOnly: true },
  );
  const data = Object.fromEntries(
    names.map((name, i) => [
      name,
      snapshots[i].docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    ]),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(directory, "source.json"),
    JSON.stringify(
      { project, capturedAt: new Date().toISOString(), ...data },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  const profiles = Object.fromEntries(
    data.players.map((doc) => [doc.data.key, doc.data]),
  );
  const stats = calculateStats(
    profiles,
    data.history.map((doc) => doc.data),
  );
  const report = {
    totals: stats.totals,
    month: stats.month,
    profiles: data.players.length,
    profilePoints: Object.values(stats.players).reduce(
      (sum, player) => sum + player.total,
      0,
    ),
    changes: Object.values(stats.players).map((player) => ({
      key: player.key,
      before: {
        total: profiles[player.key].total ?? null,
        games: profiles[player.key].games ?? null,
        month: profiles[player.key].month ?? null,
      },
      after: { total: player.total, games: player.games, month: player.month },
    })),
  };
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  if (process.argv.includes("--remove-counters")) {
    if (snapshots[0].size > 490)
      throw new Error("Profile cleanup exceeds one atomic batch.");
    // Re-read and compare in the transaction: registrations or profile edits made
    // since the backup must never be silently overwritten.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(db.collection(`${LEAGUE_PATH}/players`));
      if (
        current.size !== snapshots[0].size ||
        current.docs.some(
          (doc, i) =>
            doc.id !== snapshots[0].docs[i].id ||
            !doc.updateTime.isEqual(snapshots[0].docs[i].updateTime),
        )
      )
        throw new Error(
          "Profiles changed after backup; rerun with a fresh directory.",
        );
      for (const doc of current.docs) tx.set(doc.ref, profileOnly(doc.data()));
    });
  }
  console.log(
    JSON.stringify({
      totals: stats.totals,
      profiles: report.profiles,
      profilePoints: report.profilePoints,
      removedCounters: process.argv.includes("--remove-counters"),
    }),
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
