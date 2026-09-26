// Vercel proxies /__/auth/* to Firebase so redirect state stays first-party.
export function usesGoogleRedirect(location = globalThis.location) {
  return location?.protocol === "https:";
}

export function googleAuthDomain(config, location = globalThis.location) {
  return usesGoogleRedirect(location) ? location.hostname : config.authDomain;
}

export function googleSignIn(authSDK, auth, redirect) {
  const provider = new authSDK.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return redirect
    ? authSDK.signInWithRedirect(auth, provider)
    : authSDK.signInWithPopup(auth, provider);
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
