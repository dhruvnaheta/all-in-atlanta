// GitHub Pages cannot proxy /__/auth/*. Use Firebase's hosted helpers on every
// deployment; HTTPS alone does not mean the host supports an auth proxy.
export function googleAuthDomain(config) {
  return config.authDomain;
}

export function googleSignIn(authSDK, auth) {
  const provider = new authSDK.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return authSDK.signInWithPopup(auth, provider);
}

export async function acceptGoogleAdministrator(
  authSDK,
  auth,
  result,
  setSession,
) {
  if (!result) return;
  const { user } = result;
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) {
    await authSDK.signOut(auth);
    throw new Error(
      "Administrator access required. Players do not need to sign in.",
    );
  }
  setSession(user, true);
}
