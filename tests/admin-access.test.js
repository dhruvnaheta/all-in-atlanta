import test from "node:test";
import assert from "node:assert/strict";
import { grantAdministrator } from "../backend/admin-access.js";

function fixture({ target, caller = { customClaims: { admin: true } } } = {}) {
  const writes = [];
  const auth = {
    getUser: async () => caller,
    getUserByEmail: async () => {
      if (target) return target;
      throw Object.assign(new Error(), { code: "auth/user-not-found" });
    },
    createUser: async (data) => {
      writes.push({ create: data });
      return { uid: "new" };
    },
    setCustomUserClaims: async (uid, claims) => writes.push({ uid, claims }),
  };
  const request = {
    auth: { uid: "caller", token: { admin: true } },
    data: { email: " New@Example.test " },
  };
  return { auth, request, writes };
}

test("anonymous and non-admin callers cannot look up or create identities", async () => {
  for (const auth of [undefined, { uid: "player", token: {} }]) {
    await assert.rejects(grantAdministrator({}, { auth }), {
      code: "permission-denied",
    });
  }
});
test("revoked or disabled administrators cannot grant access", async () => {
  for (const caller of [
    { customClaims: {} },
    { disabled: true, customClaims: { admin: true } },
  ]) {
    const f = fixture({ caller });
    await assert.rejects(grantAdministrator(f.auth, f.request), {
      code: "permission-denied",
    });
    assert.deepEqual(f.writes, []);
  }
});
test("invalid emails never create users or update claims", async () => {
  for (const email of [
    undefined,
    {},
    "",
    "a@",
    "a@@example.test",
    "a b@example.test",
    "a".repeat(255) + "@example.test",
  ]) {
    const f = fixture();
    f.request.data.email = email;
    await assert.rejects(grantAdministrator(f.auth, f.request), {
      code: "invalid-argument",
    });
    assert.deepEqual(f.writes, []);
  }
});
test("new emails create an account and receive the admin claim without setting a password", async () => {
  const f = fixture();
  assert.deepEqual(await grantAdministrator(f.auth, f.request), {
    email: "new@example.test",
    alreadyAdmin: false,
  });
  assert.deepEqual(f.writes, [
    { create: { email: "new@example.test" } },
    { uid: "new", claims: { admin: true } },
  ]);
});
test("existing users keep their other claims and existing admins are unchanged", async () => {
  for (const admin of [false, true]) {
    const f = fixture({
      target: { uid: "existing", customClaims: { staff: true, admin } },
    });
    const result = await grantAdministrator(f.auth, f.request);
    assert.equal(result.alreadyAdmin, admin);
    assert.deepEqual(
      f.writes,
      admin ? [] : [{ uid: "existing", claims: { staff: true, admin: true } }],
    );
  }
});
test("disabled recipients are not re-enabled or promoted", async () => {
  const f = fixture({ target: { uid: "disabled", disabled: true } });
  await assert.rejects(grantAdministrator(f.auth, f.request), {
    code: "failed-precondition",
  });
  assert.deepEqual(f.writes, []);
});
test("an account created concurrently is reused", async () => {
  const f = fixture();
  f.auth.createUser = async () => {
    f.auth.getUserByEmail = async () => ({
      uid: "raced",
      customClaims: { staff: true },
    });
    throw Object.assign(new Error(), { code: "auth/email-already-exists" });
  };
  await grantAdministrator(f.auth, f.request);
  assert.deepEqual(f.writes, [
    { uid: "raced", claims: { staff: true, admin: true } },
  ]);
});
test("claim write failures are not reported as successful grants", async () => {
  const f = fixture({ target: { uid: "existing" } });
  f.auth.setCustomUserClaims = async () => {
    throw new Error("Unavailable");
  };
  await assert.rejects(grantAdministrator(f.auth, f.request), /Unavailable/);
});
