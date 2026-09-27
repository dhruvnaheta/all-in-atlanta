import { test } from "node:test";
import assert from "node:assert/strict";
import {
  googleAuthDomain,
  googleSignIn,
  acceptGoogleAdministrator,
} from "../js/google-auth.js";

test("production and preview use Firebase helpers without requiring a host proxy", () => {
  const config = { authDomain: "project.firebaseapp.com" };
  for (const hostname of ["allinatlanta.com", "preview.vercel.app"]) {
    const location = { protocol: "https:", hostname };
    assert.equal(googleAuthDomain(config, location), config.authDomain);
  }
  const local = { protocol: "http:", hostname: "localhost" };
  assert.equal(googleAuthDomain(config, local), config.authDomain);
});

test("Google sign-in returns the popup credential for administrator validation", async () => {
  let popups = 0;
  const auth = {};
  const credential = { user: {} };
  const sdk = {
    GoogleAuthProvider: class {
      setCustomParameters(value) {
        this.parameters = value;
      }
    },
    signInWithPopup: async (actualAuth, provider) => {
      assert.equal(actualAuth, auth);
      assert.equal(provider.parameters.prompt, "select_account");
      popups++;
      return credential;
    },
    signInWithRedirect: () => {
      assert.fail("Static hosting must not depend on redirect helpers");
    },
  };
  assert.equal(await googleSignIn(sdk, auth), credential);
  assert.equal(popups, 1);
});

test("redirect return refreshes admin claims and rejects non-admins", async () => {
  const sessions = [];
  let signOuts = 0;
  const auth = {};
  const sdk = {
    signOut: async (actual) => {
      assert.equal(actual, auth);
      signOuts++;
    },
  };
  const setSession = (...session) => sessions.push(session);
  await acceptGoogleAdministrator(sdk, auth, null, setSession);
  assert.equal(sessions.length, 0);
  for (const admin of [false, "true", true]) {
    const user = {
      getIdTokenResult: async (refresh) => {
        assert.equal(refresh, true);
        return { claims: { admin } };
      },
    };
    const attempt = acceptGoogleAdministrator(sdk, auth, { user }, setSession);
    if (admin === true) {
      await attempt;
      assert.deepEqual(sessions, [[user, true]]);
    } else {
      await assert.rejects(attempt, /Administrator access required/);
      assert.equal(sessions.length, 0);
    }
  }
  assert.equal(signOuts, 2);
});
