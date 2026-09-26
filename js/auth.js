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
  session = { user, admin: Boolean(admin) };
  subscribers.forEach((listener) => listener(session));
}
export async function signIn(email, password) {
  if (!provider)
    throw new Error(
      "Sign-in is unavailable. Please check your connection and try again.",
    );
  return provider.signIn(email, password);
}
export async function signOut() {
  return provider?.signOut();
}
export async function sendPasswordReset() {
  if (!session.user?.email)
    throw new Error("Sign in before requesting a password reset.");
  return provider.resetPassword(session.user.email);
}
