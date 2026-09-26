import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = "demo-all-in-atlanta";
let app, auth;
before(() => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("Requires the Auth and Functions emulators.");
  app = initializeApp({ projectId }, "admin-access-tests");
  auth = getAuth(app);
});
after(async () => {
  await deleteApp(app);
});
async function token(email) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "test-password",
        returnSecureToken: true,
      }),
    },
  );
  const data = await response.json();
  assert.ok(data.idToken, JSON.stringify(data));
  return data.idToken;
}
async function call(email, idToken) {
  const response = await fetch(
    `http://127.0.0.1:5001/${projectId}/us-central1/addAdministrator`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ data: { email } }),
    },
  );
  return response.json();
}

test("callable enforces access, provisions usable accounts, preserves claims and rejects revoked callers", async () => {
  const suffix = Date.now();
  const adminEmail = `admin-${suffix}@example.test`;
  const memberEmail = `member-${suffix}@example.test`;
  const newEmail = `new-${suffix}@example.test`;
  const admin = await auth.createUser({
    email: adminEmail,
    password: "test-password",
  });
  const member = await auth.createUser({
    email: memberEmail,
    password: "test-password",
  });
  await auth.setCustomUserClaims(admin.uid, { admin: true });
  await auth.setCustomUserClaims(member.uid, { staff: true });
  const adminToken = await token(adminEmail);
  assert.equal((await call(newEmail)).error.status, "PERMISSION_DENIED");
  assert.equal(
    (await call(newEmail, await token(memberEmail))).error.status,
    "PERMISSION_DENIED",
  );
  assert.equal(
    (await call("invalid", adminToken)).error.status,
    "INVALID_ARGUMENT",
  );
  assert.equal(
    (await call(memberEmail, adminToken)).result.alreadyAdmin,
    false,
  );
  assert.deepEqual((await auth.getUser(member.uid)).customClaims, {
    staff: true,
    admin: true,
  });
  assert.equal((await call(newEmail, adminToken)).result.email, newEmail);
  const created = await auth.getUserByEmail(newEmail);
  assert.equal(created.customClaims.admin, true);
  assert.ok(await auth.generatePasswordResetLink(newEmail));
  assert.equal((await call(newEmail, adminToken)).result.alreadyAdmin, true);
  await auth.setCustomUserClaims(admin.uid, {});
  assert.equal(
    (await call(`blocked-${suffix}@example.test`, adminToken)).error.status,
    "PERMISSION_DENIED",
  );
});
