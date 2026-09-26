import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deleteApp } from "firebase-admin/app";
import { adminDatabase } from "./admin-db.js";
import { LEAGUE_PATH } from "../js/schema.js";
import { leagueDateKey } from "../js/league-date.js";

// One-time correction of the confirmed August fixture and September selection.
// Defaults to a backed-up dry run. Never removes player profiles or contacts.
const project = process.argv[2];
const directory = process.argv[3];
if (!project || !directory)
  throw new Error(
    "Usage: node scripts/cleanup-test-game.js PROJECT BACKUP_DIR [--firebase-cli-auth] [--apply]",
  );
const { app, db } = await adminDatabase(
  project,
  process.argv.includes("--firebase-cli-auth"),
);
const fixtureId = "g_s_wickedwolf_default";
const completedId = "g_1790294674293";
const root = db.doc(LEAGUE_PATH);
try {
  const history = await root.collection("history").get();
  const records = history.docs.filter((d) => d.data().gameId === fixtureId);
  if (records.length !== 1)
    throw new Error("Expected exactly one test-game history record.");
  const fixture = records[0].data();
  if (
    leagueDateKey(fixture.date) !== "2026-08-13" ||
    fixture.results?.length !== 40 ||
    !["ethan brooks", "maya patel", "priya shah"].every((key) =>
      fixture.results.some((r) => r.key === key),
    )
  )
    throw new Error("Test-game fingerprint does not match; refusing cleanup.");
  const gameRef = root.collection("games").doc(fixtureId);
  const [game, completed, current, participants, runtime] = await Promise.all([
    gameRef.get(),
    root.collection("games").doc(completedId).get(),
    root.collection("settings").doc("current").get(),
    gameRef.collection("participants").get(),
    gameRef.collection("runtime").get(),
  ]);
  if (
    !game.exists ||
    leagueDateKey(game.data().date) !== "2026-08-13" ||
    !game.data().finalized
  )
    throw new Error("Unexpected test-game metadata.");
  if (
    !completed.exists ||
    leagueDateKey(completed.data().date) !== "2026-09-24" ||
    !completed.data().finalized
  )
    throw new Error("September 24 must already have finalized results.");
  if (current.data()?.activeGameId === fixtureId)
    throw new Error("Test game is currently selected; refusing deletion.");
  const remove = [...records, game, ...participants.docs, ...runtime.docs];
  const snapshots = [...remove, completed, current];
  if (snapshots.length > 490)
    throw new Error("Cleanup exceeds atomic write limit.");
  const changes = {
    delete: remove.map((d) => d.ref.path),
    completed: completed.ref.path,
    clearActive: current.data()?.activeGameId === completedId,
  };
  await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(directory, "cleanup.json"),
    JSON.stringify(
      {
        project,
        capturedAt: new Date().toISOString(),
        changes,
        documents: snapshots.map((d) => ({
          path: d.ref.path,
          data: d.data() ?? null,
        })),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  if (process.argv.includes("--apply")) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.getAll(...snapshots.map((d) => d.ref));
      if (
        fresh.some(
          (d, i) =>
            d.exists !== snapshots[i].exists ||
            (d.exists && !d.updateTime.isEqual(snapshots[i].updateTime)),
        )
      )
        throw new Error(
          "Data changed since backup; rerun with a fresh backup directory.",
        );
      for (const doc of remove) tx.delete(doc.ref);
      tx.update(completed.ref, {
        status: "completed",
        registrationOpen: false,
      });
      if (changes.clearActive) tx.update(current.ref, { activeGameId: null });
    });
    const remaining = await db.getAll(...remove.map((d) => d.ref));
    if (remaining.some((d) => d.exists))
      throw new Error("Deletion verification failed.");
  }
  console.log(
    JSON.stringify(
      { applied: process.argv.includes("--apply"), ...changes },
      null,
      2,
    ),
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
