import { calculateStats } from "../js/stats.js";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  savePatches,
  checkIn,
  finalizeGame,
  amendResults,
} from "../backend/operations.js";
import { leagueCommand } from "../backend/commands.js";
import { advanceTimer, remainingTime } from "../js/timer.js";
import { LEAGUE_PATH as root } from "../js/schema.js";
let env, app, db;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-all-in-atlanta",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
  app = initializeApp({ projectId: "demo-all-in-atlanta" }, "integration");
  db = getFirestore(app);
});
after(async () => {
  await env?.cleanup();
  await deleteApp(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  await db
    .doc(`${root}/operations/control`)
    .set({ writesEnabled: true, published: true });
  await db.doc(`${root}/settings/current`).set({ activeGameId: "g" });
  await db.doc(`${root}/games/g`).set({
    id: "g",
    name: "Test",
    date: "Sep 24, 2026",
    seriesId: "s",
    status: "running",
    registrationOpen: true,
    scheduled: true,
  });
  await db.doc(`${root}/series/s`).set({ id: "s", name: "Series", day: 4 });
  await db
    .doc(`${root}/players/p_alice`)
    .set({ key: "alice", dn: "Alice", total: 10, games: 2, month: 0 });
  await db
    .doc(`${root}/playerContacts/p_alice`)
    .set({ email: "private@example.com" });
});
const command = (action, fields = {}, now) =>
  leagueCommand(db, { action, expectedActiveGameId: "g", ...fields }, now);
test("public read boundaries and all direct client writes remain protected", async () => {
  const anonymous = env.unauthenticatedContext().firestore(),
    admin = env.authenticatedContext("admin", { admin: true }).firestore();
  await assertSucceeds(getDocs(collection(anonymous, `${root}/players`)));
  await assertFails(getDoc(doc(anonymous, `${root}/playerContacts/p_alice`)));
  await assertSucceeds(getDoc(doc(admin, `${root}/playerContacts/p_alice`)));
  for (const client of [anonymous, admin])
    await assertFails(
      setDoc(doc(client, `${root}/players/p_alice`), { total: 999 }),
    );
  await assertFails(getDoc(doc(anonymous, "aia/adminpw")));
});
test("public removal is rejected and administrator removal preserves the participant record", async () => {
  await checkIn(db, { gameId: "g", action: "checkIn", key: "alice" });
  await assert.rejects(
    checkIn(db, { gameId: "g", action: "remove", key: "alice" }),
    /Administrator/,
  );
  await checkIn(
    db,
    { gameId: "g", action: "remove", key: "alice" },
    new Date(),
    { admin: true },
  );
  assert.equal(
    (await db.doc(`${root}/games/g/participants/p_alice`).get()).data().checkIn,
    null,
  );
});
test("closing registration keeps the game running and blocks public check-in on the server", async () => {
  await command("closeRegistration");
  const game = (await db.doc(`${root}/games/g`).get()).data();
  assert.equal(game.status, "running");
  assert.equal(game.registrationOpen, false);
  await assert.rejects(
    checkIn(db, { gameId: "g", action: "checkIn", key: "alice" }),
    /not open/,
  );
  await command("openRegistration");
  await checkIn(db, { gameId: "g", action: "checkIn", key: "alice" });
  await assert.rejects(
    savePatches(db, {
      activeGameId: "g",
      patches: [
        {
          path: "games/g",
          before: { status: "running" },
          after: { status: "scheduled" },
        },
      ],
    }),
    /dedicated/,
  );
});
test("launch and activation are atomic, duplicate launch is rejected, and stale commands fail", async () => {
  const result = await command("launchGame", {
    seriesId: "s",
    date: "2026-09-24",
  });
  const active = (await db.doc(`${root}/settings/current`).get()).data()
    .activeGameId;
  assert.equal(active, result.activeGameId);
  assert.equal(
    (await db.doc(`${root}/games/${active}`).get()).data().status,
    "scheduled",
  );
  await assert.rejects(command("closeRegistration"), /active game changed/);
  await assert.rejects(
    leagueCommand(db, {
      action: "launchGame",
      seriesId: "s",
      date: "2026-09-24",
      expectedActiveGameId: active,
    }),
    /already exists/,
  );
  await leagueCommand(db, { action: "start", expectedActiveGameId: active });
  assert.equal(
    (await db.doc(`${root}/games/${active}`).get()).data().registrationOpen,
    true,
  );
});
test("timer commands use server timestamps, catch up after reload, and reject stale revisions", async () => {
  const start = await command(
    "timer",
    { operation: "start", revision: 0 },
    new Date(1000000),
  );
  assert.equal(start.timerState.levelStartTs, 1000000);
  const paused = await command(
    "timer",
    { operation: "pause", revision: 1 },
    new Date(1000000 + 31 * 60000),
  );
  assert.equal(paused.timerState.levelIdx, 2);
  assert.equal(paused.timerState.pausedRemaining, 14 * 60000);
  await assert.rejects(
    command("timer", { operation: "reset", revision: 1 }),
    /changed on another device/,
  );
  const resumed = await command(
    "timer",
    { operation: "start", revision: 2 },
    new Date(5000000),
  );
  const projected = advanceTimer(
    resumed.timerState,
    Array(17).fill(15 * 60000),
    5000000 + 60000,
  );
  assert.equal(
    remainingTime(projected, 15 * 60000, 5000000 + 60000),
    13 * 60000,
  );
});
test("concurrent timer control allows one change and rejects the competing revision", async () => {
  const results = await Promise.allSettled(
    ["start", "reset"].map((operation) =>
      command("timer", { operation, revision: 0 }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("concurrent check-ins and result submissions retain attendance and award points once", async () => {
  await Promise.all(
    ["alice", "bob"].map((key) =>
      checkIn(db, {
        gameId: "g",
        action: "checkIn",
        key,
        profile: { dn: key },
      }),
    ),
  );
  const receipts = await Promise.all(
    [1, 2].map(() =>
      finalizeGame(db, { gameId: "g", positions: { alice: 1, bob: 2 } }),
    ),
  );
  assert.equal(receipts.filter((r) => r.alreadyFinalized).length, 1);
  const profile = (await db.doc(`${root}/players/p_alice`).get()).data();
  assert.equal(profile.total, undefined);
  const history = (await db.collection(`${root}/history`).get()).docs.map(
    (doc) => doc.data(),
  );
  assert.equal(
    calculateStats({ alice: profile }, history).players.alice.total,
    25,
  );
  assert.equal(
    (await db.doc(`${root}/games/g`).get()).data().status,
    "completed",
  );
  await assert.rejects(command("start"), /scheduled/);
  await assert.rejects(
    command("timer", { operation: "start", revision: 0 }),
    /not running/,
  );
});
test("deleting a player clears contacts and live attendance together while preserving results", async () => {
  await db.doc(`${root}/games/g/participants/p_alice`).set({
    key: "alice",
    checkIn: { key: "alice" },
    results: { old: { pts: 25 } },
  });
  await command("deletePlayer", { key: "alice" });
  assert.equal((await db.doc(`${root}/players/p_alice`).get()).exists, false);
  assert.equal(
    (await db.doc(`${root}/playerContacts/p_alice`).get()).exists,
    false,
  );
  const participant = (
    await db.doc(`${root}/games/g/participants/p_alice`).get()
  ).data();
  assert.equal(participant.checkIn, null);
  assert.equal(participant.results.old.pts, 25);
});
test("removed bulk deletion commands reject without changing league data", async () => {
  await db.doc(`${root}/history/h`).set({ results: [] });
  await db.doc(`${root}/games/g/participants/p_alice`).set({
    key: "alice",
    checkIn: { key: "alice" },
    results: { old: { pts: 25 } },
  });
  await db.doc(`${root}/games/g/runtime/timer`).set({ revision: 1 });
  const paths = [
    "settings/current",
    "games/g",
    "players/p_alice",
    "playerContacts/p_alice",
    "history/h",
    "series/s",
    "games/g/participants/p_alice",
    "games/g/runtime/timer",
  ];
  const snapshot = async () =>
    Promise.all(
      paths.map(async (path) => (await db.doc(`${root}/${path}`).get()).data()),
    );
  const before = await snapshot();
  for (const action of ["wipeAll", "clearPlayers"]) {
    await assert.rejects(command(action), /Unknown league operation/);
    assert.deepEqual(await snapshot(), before);
  }
});

test("oversized player deletion and maintenance operations do not partially delete", async () => {
  const batch = db.batch();
  for (let i = 0; i < 489; i++) {
    batch.set(db.doc(`${root}/games/extra${i}`), { id: `extra${i}` });
  }
  await batch.commit();
  const participants = db.batch();
  for (let i = 0; i < 489; i++)
    participants.set(db.doc(`${root}/games/extra${i}/participants/p_alice`), {
      key: "alice",
      checkIn: { key: "alice" },
    });
  await participants.commit();
  await assert.rejects(command("deletePlayer", { key: "alice" }), /too large/);
  assert.equal((await db.doc(`${root}/players/p_alice`).get()).exists, true);
  assert.equal(
    (await db.doc(`${root}/playerContacts/p_alice`).get()).exists,
    true,
  );
  assert.deepEqual(
    (await db.doc(`${root}/games/extra0/participants/p_alice`).get()).data()
      .checkIn,
    { key: "alice" },
  );
  await db.doc(`${root}/operations/control`).update({ writesEnabled: false });
  await assert.rejects(
    command("deletePlayer", { key: "alice" }),
    /maintenance/,
  );
});

test("admin edits cannot override stats; finalization rebuilds from earlier result records", async () => {
  await assert.rejects(
    savePatches(db, {
      activeGameId: "g",
      patches: [
        {
          path: "players/p_alice",
          before: { total: 10 },
          after: { total: 999 },
        },
      ],
    }),
    /calculated/,
  );
  await db.doc(`${root}/history/old`).set({
    gameId: "old",
    date: "Aug 31, 2026",
    seriesId: "s",
    results: [{ key: "alice", pts: 18, pos: 2 }],
  });
  await checkIn(db, { gameId: "g", action: "checkIn", key: "alice" });
  await finalizeGame(
    db,
    { gameId: "g", positions: { alice: 1 } },
    new Date("2026-09-26T12:00:00Z"),
  );
  const profile = (await db.doc(`${root}/players/p_alice`).get()).data();
  const history = (await db.collection(`${root}/history`).get()).docs.map((d) =>
    d.data(),
  );
  assert.equal(profile.total, undefined);
  assert.equal(history.length, 2);
  const stats = calculateStats(
    { alice: profile },
    history,
    new Date("2026-09-26T12:00:00Z"),
  );
  assert.equal(stats.players.alice.total, 43);
  assert.equal(stats.players.alice.month, 25);
  assert.equal(
    (await db.doc(`${root}/history/game_g`).get()).data().gameId,
    "g",
  );
});

test("historical corrections replace points without changing attendance or the active game", async () => {
  await checkIn(db, { action: "checkIn", gameId: "g", key: "alice" });
  await finalizeGame(db, { gameId: "g", stopped: true });
  await db.doc(`${root}/settings/current`).set({ activeGameId: "next" });
  const ref = db.doc(`${root}/history/game_g`);
  const before = (await ref.get()).data();
  const request = { historyId: "game_g", before, positions: { alice: "1" } };
  await amendResults(db, request);
  const corrected = (await ref.get()).data();
  assert.equal(corrected.results[0].pts, 25);
  assert.equal(corrected.stopped, false);
  assert.equal(corrected.completedAt, before.completedAt);
  assert.deepEqual(corrected.attendanceKeys, before.attendanceKeys);
  const stats = calculateStats({ alice: { key: "alice" } }, [corrected]).players
    .alice;
  assert.equal(stats.total, 25);
  assert.equal(stats.games, 1);
  assert.equal((await db.collection(`${root}/history`).get()).size, 1);
  assert.equal(
    (await db.doc(`${root}/settings/current`).get()).data().activeGameId,
    "next",
  );
  assert.equal(
    (await db.doc(`${root}/games/g/participants/p_alice`).get()).data().results
      .game_g.pts,
    25,
  );
  await assert.rejects(amendResults(db, request), /changed elsewhere/);
  await amendResults(db, {
    ...request,
    before: corrected,
    positions: { alice: "2" },
  });
  assert.equal((await ref.get()).data().results[0].pts, 18);
});

test("historical corrections validate placements and honor maintenance lock", async () => {
  await checkIn(db, { action: "checkIn", gameId: "g", key: "alice" });
  await checkIn(db, {
    action: "checkIn",
    gameId: "g",
    key: "bob",
    profile: { dn: "Bob" },
  });
  await finalizeGame(db, { gameId: "g", stopped: true });
  const ref = db.doc(`${root}/history/game_g`);
  const before = (await ref.get()).data();
  const request = { historyId: "game_g", before };
  for (const positions of [
    { alice: "1", bob: "1" },
    { alice: "9", bob: "p" },
    { alice: "1" },
    { alice: "1", bob: "p", extra: "2" },
  ])
    await assert.rejects(amendResults(db, { ...request, positions }));
  assert.deepEqual((await ref.get()).data(), before);
  await db.doc(`${root}/operations/control`).update({ writesEnabled: false });
  await assert.rejects(
    amendResults(db, { ...request, positions: { alice: "1", bob: "p" } }),
    /maintenance/,
  );
});

test("first series saves without settings; active-game preconditions cannot be skipped", async () => {
  const ref = db.doc(`${root}/settings/current`);
  const patches = [
    {
      path: "series/first",
      create: true,
      after: { id: "first", name: "First" },
    },
  ];
  for (const settings of [undefined, {}, { activeGameId: null }]) {
    await ref.delete();
    if (settings) await ref.set(settings);
    await db.doc(`${root}/series/first`).delete();
    await savePatches(db, { patches, activeGameId: null });
    assert.equal(
      (await db.doc(`${root}/series/first`).get()).data().name,
      "First",
    );
  }
  for (const activeGameId of [undefined, "", 1, false, {}]) {
    await assert.rejects(
      savePatches(db, { patches, activeGameId }),
      /explicit activeGameId/,
    );
  }
  await assert.rejects(savePatches(db, { patches }), /explicit activeGameId/);
  await ref.set({ activeGameId: "g" });
  for (const activeGameId of [null, "stale"]) {
    await assert.rejects(
      savePatches(db, { patches, activeGameId }),
      /active game changed/,
    );
  }
  await db.doc(`${root}/series/first`).delete();
  await savePatches(db, { patches, activeGameId: "g" });
});

test("historical metadata corrections update game and ledger together and recalculate monthly points", async () => {
  await checkIn(db, { action: "checkIn", gameId: "g", key: "alice" });
  await finalizeGame(db, { gameId: "g", positions: { alice: "1" } });
  const ref = db.doc(`${root}/history/game_g`);
  const before = (await ref.get()).data();
  const request = { historyId: "game_g", before, positions: { alice: "1" } };
  for (const metadata of [
    { gameName: " " },
    { gameName: "a".repeat(161) },
    { date: "2026-02-30" },
    { date: "" },
  ]) {
    await assert.rejects(amendResults(db, { ...request, ...metadata }));
  }
  assert.deepEqual((await ref.get()).data(), before);
  await amendResults(db, {
    ...request,
    gameName: " Corrected game ",
    date: "2026-08-27",
  });
  const corrected = (await ref.get()).data();
  const game = (await db.doc(`${root}/games/g`).get()).data();
  assert.equal(corrected.gameName, "Corrected game");
  assert.equal(game.name, corrected.gameName);
  assert.equal(game.date, corrected.date);
  assert.equal(corrected.date, "2026-08-27");
  assert.deepEqual(corrected.results, before.results);
  assert.deepEqual(corrected.attendanceKeys, before.attendanceKeys);
  assert.equal(corrected.completedAt, before.completedAt);
  const stats = calculateStats(
    { alice: { key: "alice" } },
    [corrected],
    new Date("2026-09-26T12:00:00Z"),
  ).players.alice;
  assert.equal(stats.month, 0);
  assert.equal(stats.total, 25);
  assert.equal(stats.games, 1);
  await assert.rejects(amendResults(db, request), /changed elsewhere/);
});
