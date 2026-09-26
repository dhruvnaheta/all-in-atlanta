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
import { playerAccount } from "../backend/accounts.js";
import { LEAGUE_PATH as root } from "../js/schema.js";
let env, app, db;
const identity = (uid, admin = false, verified = true) => ({
  uid,
  token: { email: `${uid}@example.test`, email_verified: verified, admin },
});
const call = (uid, request, admin = false, verified = true) =>
  playerAccount(db, request, new Date(), identity(uid, admin, verified));
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-all-in-atlanta",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
  app = initializeApp({ projectId: "demo-all-in-atlanta" }, "account-tests");
  db = getFirestore(app);
});
after(async () => {
  await env?.cleanup();
  await db?.terminate();
  await deleteApp(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  for (const [path, data] of Object.entries({
    "operations/control": { published: true, writesEnabled: true },
    "settings/current": { activeGameId: "g" },
    "players/p_alice": {
      key: "alice",
      dn: "Alice",
      total: 321,
      month: 10,
      games: 42,
      gameDates: [{ gameId: "old", pts: 25 }],
    },
    "players/p_bob": { key: "bob", dn: "Bob", total: 50 },
    "playerContacts/p_alice": {
      email: "private@example.test",
      phone: "123",
      recoveryNote: "admin only",
    },
    "games/g": {
      id: "g",
      name: "Test game",
      status: "running",
      registrationOpen: true,
    },
  }))
    batch.set(db.doc(`${root}/${path}`), data);
  await batch.commit();
});
async function link(uid = "alice", key = "alice") {
  await call(uid, { action: "requestLink", playerKey: key });
  await call("admin", { action: "approveLink", uid }, true);
}
test("verified email auto-link normalizes legacy contacts, preserves data and is idempotent", async () => {
  await db
    .doc(`${root}/playerContacts/p_alice`)
    .update({ email: " Alice@EXAMPLE.test " });
  const before = (await db.doc(`${root}/players/p_alice`).get()).data();
  assert.deepEqual(
    await call("alice", { action: "autoLink", playerKey: "bob" }),
    { linked: true },
  );
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: true,
  });
  const account = (await db.doc(`${root}/accounts/alice`).get()).data();
  assert.equal(account.playerKey, "alice");
  assert.equal(account.linkedBy, "verified-email");
  assert.equal(
    (await db.doc(`${root}/playerAccounts/p_alice`).get()).data().uid,
    "alice",
  );
  assert.deepEqual(
    (await db.doc(`${root}/players/p_alice`).get()).data(),
    before,
  );
  assert.equal((await call("alice", { action: "profile" })).phone, "123");
  await db.doc(`${root}/players/p_alice`).delete();
  await db.doc(`${root}/players/p_alice`).set(before);
  await assert.rejects(call("alice", { action: "profile" }), /unavailable/);
});
test("auto-link refuses unverified, unmatched, duplicate, missing and already owned profiles", async () => {
  await assert.rejects(playerAccount(db, { action: "autoLink" }), /Sign in/);
  await db
    .doc(`${root}/playerContacts/p_alice`)
    .update({ email: "alice@example.test" });
  assert.deepEqual(await call("alice", { action: "autoLink" }, false, false), {
    linked: false,
  });
  assert.deepEqual(
    await call("stranger", { action: "autoLink", email: "alice@example.test" }),
    { linked: false },
  );
  await db
    .doc(`${root}/playerContacts/p_bob`)
    .set({ email: " ALICE@example.test " });
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: false,
  });
  await db.doc(`${root}/playerContacts/p_bob`).delete();
  const profile = (await db.doc(`${root}/players/p_alice`).get()).data();
  await db.doc(`${root}/players/p_alice`).delete();
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: false,
  });
  await db.doc(`${root}/players/p_alice`).set(profile);
  await link("owner");
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: false,
  });
  assert.equal((await db.doc(`${root}/accounts/alice`).get()).exists, false);
});
test("auto-link handles matching pending claims but respects rejections, other claims and maintenance", async () => {
  await db
    .doc(`${root}/playerContacts/p_alice`)
    .update({ email: "alice@example.test" });
  await call("alice", { action: "requestLink", playerKey: "bob" });
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: false,
  });
  await call("admin", { action: "rejectLink", uid: "alice" }, true);
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: false,
  });
  await call("alice", { action: "requestLink", playerKey: "alice" });
  await db.doc(`${root}/operations/control`).update({ writesEnabled: false });
  await assert.rejects(call("alice", { action: "autoLink" }), /maintenance/);
  await db.doc(`${root}/operations/control`).update({ writesEnabled: true });
  assert.deepEqual(await call("alice", { action: "autoLink" }), {
    linked: true,
  });
});
test("simultaneous email claims cannot acquire the same profile", async () => {
  const results = await Promise.all(
    ["first", "second"].map((uid) =>
      playerAccount(db, { action: "autoLink" }, new Date(), {
        uid,
        token: { email: "private@example.test", email_verified: true },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.linked).length, 1);
  assert.equal((await db.collection(`${root}/accounts`).get()).size, 1);
});
test("linking requires verified sign-in and admin approval, preserves stats and rejects duplicate ownership", async () => {
  const before = (await db.doc(`${root}/players/p_alice`).get()).data();
  await assert.rejects(
    playerAccount(db, { action: "requestLink", playerKey: "alice" }),
    /Sign in/,
  );
  await assert.rejects(
    call("alice", { action: "requestLink", playerKey: "alice" }, false, false),
    /Verify/,
  );
  await call("alice", { action: "requestLink", playerKey: "alice" });
  await call("impostor", { action: "requestLink", playerKey: "alice" });
  await assert.rejects(
    call("alice", { action: "approveLink", uid: "alice" }),
    /Administrator/,
  );
  const results = await Promise.allSettled(
    ["alice", "impostor"].map((uid) =>
      call("admin", { action: "approveLink", uid }, true),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(
    (await db.doc(`${root}/players/p_alice`).get()).data(),
    before,
  );
  await assert.rejects(
    call("other", { action: "requestLink", playerKey: "alice" }),
    /already linked/,
  );
});
test("private accounts and contacts cannot be read by guests or other users; no direct writes", async () => {
  await link();
  const owner = env.authenticatedContext("alice").firestore(),
    stranger = env.authenticatedContext("bob").firestore(),
    admin = env.authenticatedContext("admin", { admin: true }).firestore(),
    guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(owner, `${root}/accounts/alice`)));
  await assertSucceeds(getDoc(doc(stranger, `${root}/accounts/bob`))); // no account yet
  await assertSucceeds(getDocs(collection(admin, `${root}/accounts`)));
  for (const client of [guest, stranger])
    await assertFails(getDoc(doc(client, `${root}/accounts/alice`)));
  await assertFails(getDocs(collection(owner, `${root}/accounts`)));
  for (const client of [owner, stranger, guest])
    await assertFails(getDoc(doc(client, `${root}/playerContacts/p_alice`)));
  for (const client of [owner, admin])
    await assertFails(
      setDoc(doc(client, `${root}/accounts/alice`), {
        playerKey: "bob",
        admin: true,
      }),
    );
  const profile = await call("alice", { action: "profile", playerKey: "bob" });
  assert.deepEqual(profile, {
    dn: "Alice",
    email: "private@example.test",
    phone: "123",
  });
  assert.equal(profile.recoveryNote, undefined);
});
test("personal check-in derives identity from auth, honors registration and refuses missing profiles", async () => {
  await link();
  await call("alice", {
    action: "checkIn",
    gameId: "g",
    key: "bob",
    playerKey: "bob",
  });
  assert.equal(
    (await db.doc(`${root}/games/g/participants/p_alice`).get()).data().key,
    "alice",
  );
  assert.equal(
    (await db.doc(`${root}/games/g/participants/p_bob`).get()).exists,
    false,
  );
  await assert.rejects(
    call("bob", { action: "checkIn", gameId: "g" }),
    /not linked/,
  );
  await db.doc(`${root}/games/g`).update({ registrationOpen: false });
  await assert.rejects(
    call("alice", { action: "checkIn", gameId: "g" }),
    /not open/,
  );
  await db.doc(`${root}/players/p_alice`).delete();
  await assert.rejects(
    call("alice", { action: "checkIn", gameId: "g" }),
    /unavailable/,
  );
  await db
    .doc(`${root}/players/p_alice`)
    .set({ key: "alice", dn: "A different Alice" });
  await assert.rejects(call("alice", { action: "profile" }), /unavailable/);
  await assert.rejects(
    call("alice", {
      action: "saveProfile",
      dn: "Changed",
      email: "",
      phone: "",
    }),
    /unavailable/,
  );
});
test("profile updates cannot change points, roles, identities or private admin notes", async () => {
  await link();
  await call("alice", {
    action: "saveProfile",
    dn: "Alice A.",
    email: "new@example.test",
    phone: "404",
    total: 9999,
    playerKey: "bob",
    admin: true,
    recoveryNote: "changed",
  });
  const player = (await db.doc(`${root}/players/p_alice`).get()).data();
  assert.equal(player.total, 321);
  assert.equal(player.games, 42);
  assert.equal(player.dn, "Alice A.");
  assert.equal(player.key, "alice");
  assert.equal((await db.doc(`${root}/players/p_bob`).get()).data().dn, "Bob");
  assert.equal(
    (await db.doc(`${root}/playerContacts/p_alice`).get()).data().recoveryNote,
    "admin only",
  );
  await assert.rejects(
    call("alice", { action: "requestLink", playerKey: "bob" }),
    /already has/,
  );
});
test("new players require approval and declined requests can be retried", async () => {
  await call("new", { action: "requestLink", newName: "New Player" });
  assert.equal(
    (await db.doc(`${root}/players/p_new%20player`).get()).exists,
    false,
  );
  await call("admin", { action: "rejectLink", uid: "new" }, true);
  await call("new", { action: "requestLink", newName: "New Player" });
  await call("admin", { action: "approveLink", uid: "new" }, true);
  assert.equal(
    (await db.doc(`${root}/players/p_new%20player`).get()).data().total,
    0,
  );
  assert.equal((await call("new", { action: "profile" })).dn, "New Player");
  await assert.rejects(
    call("admin", { action: "approveLink", uid: "new" }, true),
    /already been handled/,
  );
  await db.doc(`${root}/operations/control`).update({ writesEnabled: false });
  await assert.rejects(
    call("new", { action: "saveProfile", dn: "Test", email: "", phone: "" }),
    /maintenance/,
  );
});
