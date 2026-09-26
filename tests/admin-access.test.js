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

test("directory lists all admin pages and identifies owners from DB flags", async () => {
  const { listAdministrators } = await import("../backend/admin-access.js");
  const f = fixture();
  const db = {
    collection: () => ({
      get: async () => ({
        docs: [{ id: "caller", data: () => ({ owner: true }) }],
      }),
    }),
  };
  f.auth.listUsers = async (_, token) =>
    token
      ? {
          users: [
            {
              uid: "other",
              email: "a@example.test",
              customClaims: { admin: true },
            },
          ],
        }
      : {
          users: [
            {
              uid: "caller",
              email: "z@example.test",
              customClaims: { admin: true },
            },
            { uid: "player" },
          ],
          pageToken: "next",
        };
  const result = await listAdministrators(f.auth, db, f.request);
  assert.equal(result.owner, true);
  assert.deepEqual(
    result.administrators.map(({ uid, owner }) => ({ uid, owner })),
    [
      { uid: "other", owner: false },
      { uid: "caller", owner: true },
    ],
  );
});
test("only DB owners can remove admins, owners are protected and other claims survive", async () => {
  const { removeAdministrator } = await import("../backend/admin-access.js");
  for (const [callerOwner, targetOwner, expected] of [
    [false, false, "permission-denied"],
    [true, true, "failed-precondition"],
    [true, false, null],
  ]) {
    const f = fixture();
    f.request.data = { uid: "target" };
    f.auth.getUser = async () => ({
      customClaims: { admin: true, staff: true },
    });
    f.auth.revokeRefreshTokens = async (uid) => f.writes.push({ revoked: uid });
    const db = {
      collection: () => ({
        doc: (uid) => ({
          get: async () => ({
            data: () => ({
              owner: uid === "caller" ? callerOwner : targetOwner,
            }),
          }),
        }),
      }),
    };
    if (expected) {
      await assert.rejects(removeAdministrator(f.auth, db, f.request), {
        code: expected,
      });
      assert.deepEqual(f.writes, []);
    } else {
      assert.deepEqual(await removeAdministrator(f.auth, db, f.request), {
        removed: true,
      });
      assert.deepEqual(f.writes, [
        { uid: "target", claims: { staff: true } },
        { revoked: "target" },
      ]);
    }
  }
});
test("revoked admins cannot list or remove administrators even with an old token", async () => {
  const { listAdministrators, removeAdministrator } =
    await import("../backend/admin-access.js");
  const f = fixture({ caller: { customClaims: {} } });
  for (const operation of [listAdministrators, removeAdministrator])
    await assert.rejects(operation(f.auth, {}, f.request), {
      code: "permission-denied",
    });
});
