import { test } from "node:test";
import assert from "node:assert/strict";
import {
  usesGoogleRedirect,
  googleAuthDomain,
  googleSignIn,
  acceptGoogleAdministrator,
} from "../js/google-auth.js";

test("production and preview redirects keep auth state on the current origin", () => {
  const config = { authDomain: "project.firebaseapp.com" };
  for (const hostname of ["allinatlanta.com", "preview.vercel.app"]) {
    const location = { protocol: "https:", hostname };
    assert.equal(usesGoogleRedirect(location), true);
    assert.equal(googleAuthDomain(config, location), hostname);
  }
  const local = { protocol: "http:", hostname: "localhost" };
  assert.equal(usesGoogleRedirect(local), false);
  assert.equal(googleAuthDomain(config, local), config.authDomain);
});

test("hosted Google sign-in navigates without opening a popup", async () => {
  let redirects = 0;
  const auth = {};
  const sdk = {
    GoogleAuthProvider: class {
      setCustomParameters(value) {
        this.parameters = value;
      }
    },
    signInWithRedirect: async (actualAuth, provider) => {
      assert.equal(actualAuth, auth);
      assert.equal(provider.parameters.prompt, "select_account");
      redirects++;
    },
    signInWithPopup: () => {
      assert.fail("Hosted sign-in must not open a popup");
    },
  };
  await googleSignIn(sdk, auth, true);
  assert.equal(redirects, 1);
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
