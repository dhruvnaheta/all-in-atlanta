import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { leagueCommand } from "../backend/commands.js";
import { playerAccount } from "../backend/accounts.js";
import { LEAGUE_PATH } from "../js/schema.js";
let app, db;
const ref = (path) => db.doc(`${LEAGUE_PATH}/${path}`);
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("Requires Firestore emulator");
  app = initializeApp({ projectId: "demo-all-in-atlanta" }, "merge-tests");
  db = getFirestore(app);
});
after(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  await db.recursiveDelete(db.doc(LEAGUE_PATH));
  for (const [path, data] of Object.entries({
    "operations/control": { writesEnabled: true },
    "players/p_source": { key: "source", dn: "COREY T 1" },
    "players/p_target": { key: "target", dn: "Corey T" },
    "playerContacts/p_source": { email: "source@example.test", phone: "404" },
    "playerContacts/p_target": { email: "target@example.test" },
    "history/h": {
      gameId: "g",
      date: "2026-09-24",
      results: [{ key: "source", name: "COREY T 1", pts: 25, pos: 1 }],
      attendanceKeys: ["source"],
      attendanceCount: 1,
    },
    "games/g": { id: "g", status: "completed", seriesId: "s_wickedwolf" },
    "games/g/participants/p_source": {
      key: "source",
      checkIn: { key: "source" },
      results: { h: { key: "source", pts: 25, pos: 1 } },
    },
    "series/s_wickedwolf": { id: "s_wickedwolf", name: "Wicked Wolf" },
  }))
    await ref(path).set(data);
});
const merge = () =>
  leagueCommand(db, {
    action: "mergePlayers",
    sourceKey: "source",
    targetKey: "target",
  });
test("merge transfers history, attendance, contacts and account identity atomically", async () => {
  const source = await ref("players/p_source").get();
  await ref("playerAccounts/p_source").set({ uid: "u", playerKey: "source" });
  await ref("accounts/u").set({
    uid: "u",
    playerKey: "source",
    playerCreatedAt: source.createTime,
  });
  await merge();
  assert.equal((await ref("players/p_source").get()).exists, false);
  assert.equal((await ref("playerContacts/p_source").get()).exists, false);
  assert.deepEqual((await ref("playerContacts/p_target").get()).data(), {
    email: "target@example.test",
    phone: "404",
  });
  const history = (await ref("history/h").get()).data();
  assert.equal(history.results[0].key, "target");
  assert.equal(history.results[0].name, "Corey T");
  assert.deepEqual(history.attendanceKeys, ["target"]);
  assert.equal(
    (await ref("games/g/participants/p_source").get()).exists,
    false,
  );
  assert.equal(
    (await ref("games/g/participants/p_target").get()).data().checkIn.key,
    "target",
  );
  assert.equal((await ref("playerAccounts/p_source").get()).exists, false);
  const profile = await playerAccount(db, { action: "profile" }, new Date(), {
    uid: "u",
  });
  assert.equal(profile.dn, "Corey T");
});
test("conflicting scores reject the whole merge", async () => {
  await ref("history/h2").set({
    gameId: "g",
    date: "2026-09-24",
    results: [{ key: "target", pts: 18, pos: 2 }],
  });
  await assert.rejects(merge(), /Conflicting results/);
  assert.equal((await ref("players/p_source").get()).exists, true);
  assert.equal((await ref("history/h").get()).data().results[0].key, "source");
});
test("identical duplicate results count once and two linked accounts reject", async () => {
  const history = (await ref("history/h").get()).data();
  await ref("history/h").update({
    results: [...history.results, { key: "target", pts: 25, pos: 1 }],
  });
  await ref("playerAccounts/p_source").set({ uid: "u" });
  await ref("playerAccounts/p_target").set({ uid: "v" });
  await assert.rejects(merge(), /Both profiles/);
  await ref("playerAccounts/p_source").delete();
  await merge();
  assert.equal((await ref("history/h").get()).data().results.length, 1);
});
test("default series can be deleted while history survives; running games block deletion", async () => {
  await ref("games/g").update({ status: "running" });
  await assert.rejects(
    leagueCommand(db, { action: "deleteSeries", seriesId: "s_wickedwolf" }),
    /running game/,
  );
  assert.equal((await ref("series/s_wickedwolf").get()).exists, true);
  await ref("games/g").update({ status: "completed" });
  await leagueCommand(db, { action: "deleteSeries", seriesId: "s_wickedwolf" });
  assert.equal((await ref("series/s_wickedwolf").get()).exists, false);
  assert.equal((await ref("games/g").get()).data().scheduled, false);
  assert.equal((await ref("history/h").get()).exists, true);
});

test("stale account identity blocks transfer without modifying records", async () => {
  await ref("playerAccounts/p_source").set({ uid: "u", playerKey: "source" });
  await ref("accounts/u").set({
    uid: "u",
    playerKey: "source",
    playerIdentity: "deleted-profile",
  });
  await assert.rejects(merge(), /stale account links/);
  assert.equal((await ref("players/p_source").get()).exists, true);
  assert.equal((await ref("history/h").get()).data().results[0].key, "source");
});
