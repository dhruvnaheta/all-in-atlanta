import {
  currentUser,
  isAdmin,
  signIn,
  signInWithGoogle,
  signOut,
  sendPasswordReset,
} from "../auth.js";
import { esc, toast } from "../dom.js";
import { renderMarkup } from "../render.js";
import { go } from "../navigation.js";
import { openAdmin } from "./admin.js";

let authMode = "signin";
let renderedUid;
function signedOut() {
  const reset = authMode === "reset";
  return `<div class="account-welcome"><div><div class="sec-tag">League administration</div><h2>Admin</h2><p>Sign in with your administrator account to manage games and player results.</p><p>Players can view rankings and check in without an account.</p><a href="/games/" class="btn btn-ghost" data-click="go" data-arg0="games">View games</a></div>
    <form id="accountAuthForm" class="card account-form" data-submit="accountAuthenticate">
      <h2>${reset ? "Reset your password" : "Admin sign in"}</h2>
      ${reset ? '<p class="account-muted">Enter your admin email and we’ll send a reset link.</p>' : '<button class="btn btn-ghost account-google" type="button" data-click="accountGoogleSignIn"><img src="/assets/google.svg" width="20" height="20" alt="" aria-hidden="true">Continue with Google</button><div class="account-auth-divider">or use your email</div>'}
      <label class="account-field" for="accountEmail">Email<input id="accountEmail" type="email" autocomplete="email" required maxlength="254"></label>
      ${reset ? "" : '<label class="account-field" for="accountPassword">Password<input id="accountPassword" type="password" autocomplete="current-password" required></label>'}
      <p id="accountAuthMessage" class="account-message" role="status" data-preserve></p>
      <button class="btn btn-green" type="submit">${reset ? "Send reset link" : "Sign in"}</button>
      <div class="account-text-actions"><button type="button" data-click="accountAuthMode" data-arg0="${reset ? "signin" : "reset"}">${reset ? "Back to sign in" : "Forgot password?"}</button></div>
    </form></div>`;
}
export function renderAccount() {
  const body = document.getElementById("accountContent");
  if (!body) return;
  const user = currentUser();
  if (renderedUid !== user?.uid) {
    body.replaceChildren();
    renderedUid = user?.uid;
  }
  document.getElementById("accountTitle").textContent = "Admin";
  document.getElementById("accountHeadingActions").innerHTML = isAdmin()
    ? '<button class="btn btn-gold" data-click="openAdmin">Open admin</button><button class="btn btn-outline-w" data-click="accountSignOut">Sign out</button>'
    : "";
  if (!isAdmin()) {
    if (!body.querySelector("#accountAuthForm"))
      renderMarkup(body, signedOut());
    return;
  }
  renderMarkup(
    body,
    `<section class="card account-panel"><h2>League administration</h2><p>Signed in as ${esc(user?.email || "administrator")}.</p><button class="btn btn-green" data-click="openAdmin">Open admin</button></section>`,
  );
}
export function setAccountAuthMode(mode) {
  authMode = ["signin", "reset"].includes(mode) ? mode : "signin";
  document.getElementById("accountContent").replaceChildren();
  renderAccount();
}
export async function authenticateAccount(form) {
  const email = form.querySelector("#accountEmail").value.trim();
  const password = form.querySelector("#accountPassword")?.value;
  const message = form.querySelector("#accountAuthMessage");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = "";
  try {
    if (authMode === "reset") {
      await sendPasswordReset(email);
      message.textContent =
        "If an account exists for that email, a reset link has been sent.";
    } else {
      await signIn(email, password);
      renderAccount();
      if (isAdmin()) openAdmin();
    }
  } catch (error) {
    if (message.isConnected) message.textContent = friendlyAuthError(error);
    else toast(friendlyAuthError(error));
  } finally {
    button.disabled = false;
  }
}
export function friendlyAuthError(error) {
  const errors = {
    "auth/popup-closed-by-user":
      "Google sign-in was canceled. Try again when you’re ready.",
    "auth/cancelled-popup-request":
      "Google sign-in was canceled. Please try again.",
    "auth/popup-blocked":
      "Allow pop-ups for this site, then try Google sign-in again.",
    "auth/account-exists-with-different-credential":
      "This email already uses another sign-in method. Sign in with that method to access your existing account.",
    "auth/operation-not-allowed":
      "Google sign-in is currently unavailable. Please use email and password.",
    "auth/unauthorized-domain":
      "Google sign-in isn’t available on this domain. Please use email and password.",
    "auth/invalid-credential":
      "That email and password don’t match. Try again or reset your password.",
    "auth/wrong-password": "That email and password don’t match.",
    "auth/user-not-found": "That email and password don’t match.",
    "auth/email-already-in-use":
      "An account already uses that email. Sign in or reset your password.",
    "auth/weak-password":
      "Choose a stronger password with at least eight characters.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":
      "Couldn’t connect. Check your connection and try again.",
  };
  return errors[error.code] || error.message;
}
export async function authenticateWithGoogle(button) {
  const form = button.closest("form");
  const controls = [...form.querySelectorAll("button, input")];
  const message = form.querySelector("#accountAuthMessage");
  controls.forEach((control) => {
    control.disabled = true;
  });
  message.textContent = "Opening Google sign-in…";
  try {
    await signInWithGoogle();
    renderAccount();
    if (isAdmin()) openAdmin();
  } catch (error) {
    if (message.isConnected) message.textContent = friendlyAuthError(error);
    else toast(friendlyAuthError(error));
  } finally {
    controls.forEach((control) => {
      control.disabled = false;
    });
  }
}
export async function accountSignOut() {
  await signOut();
  renderAccount();
  go("account");
}
export async function accountPasswordReset() {
  await sendPasswordReset();
  toast("Password reset email sent.");
}
