let session = { user: null, admin: false };
let provider;
export const subscribers = new Set();
export const isAdmin = () => session.admin;
export const currentUser = () => session.user;
export function subscribeAuth(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
export function configureAuth(adapter) {
  provider = adapter;
}
export function setSession(user, admin) {
  session = { user: admin ? user : null, admin: Boolean(user && admin) };
  subscribers.forEach((listener) => listener(session));
}
export async function signIn(email, password) {
  if (!provider)
    throw new Error(
      "Sign-in is unavailable. Please check your connection and try again.",
    );
  await provider.signIn(email, password);
  await requireAdmin();
}
export async function signOut() {
  return provider?.signOut();
}
export async function signInWithGoogle() {
  if (!provider) throw new Error("Sign-in is unavailable. Please try again.");
  await provider.signInWithGoogle();
  await requireAdmin();
}
export async function sendPasswordReset(email = session.user?.email) {
  if (!email?.trim()) throw new Error("Enter your sign-in email first.");
  if (!provider) throw new Error("Sign-in is unavailable. Please try again.");
  return provider.resetPassword(email.trim());
}
export async function refreshToken() {
  return provider?.refreshToken?.();
}

async function requireAdmin() {
  if (isAdmin()) return;
  await signOut();
  throw new Error(
    "Administrator access required. Players do not need to sign in.",
  );
}
