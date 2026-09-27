import {
  isAdmin,
  signIn,
  signInWithGoogle,
  sendPasswordReset,
} from "../auth.js";
import { toast } from "../dom.js";
import { renderMarkup } from "../render.js";
import { openAdmin } from "./admin.js";

let authMode = "signin";
function signedOut() {
  const reset = authMode === "reset";
  return `<div class="admin-login-welcome"><div class="admin-login-intro"><div class="sec-tag">League administration</div><h2>Admin</h2><p>Sign in with your administrator account to manage games and player results.</p><a href="/games/" class="btn btn-ghost" data-click="go" data-arg0="games">View games</a></div>
    <form id="adminLoginForm" class="card admin-login-form" data-submit="loginAuthenticate">
      <h2>${reset ? "Reset your password" : "Admin sign in"}</h2>
      ${reset ? '<p class="admin-login-muted">Enter your admin email and we’ll send a reset link.</p>' : '<button class="btn btn-ghost admin-login-google" type="button" data-click="loginGoogleSignIn"><img src="/assets/google.svg" width="20" height="20" alt="" aria-hidden="true">Continue with Google</button><div class="admin-login-auth-divider">or use your email</div>'}
      <label class="admin-login-field" for="adminEmail">Email<input id="adminEmail" type="email" autocomplete="email" required maxlength="254"></label>
      ${reset ? "" : '<label class="admin-login-field" for="adminPassword">Password<input id="adminPassword" type="password" autocomplete="current-password" required></label>'}
      <p id="adminLoginMessage" class="admin-login-message" role="status" data-preserve></p>
      <button class="btn btn-green" type="submit">${reset ? "Send reset link" : "Sign in"}</button>
      <div class="admin-login-text-actions"><button type="button" data-click="loginMode" data-arg0="${reset ? "signin" : "reset"}">${reset ? "Back to sign in" : "Forgot password?"}</button></div>
    </form></div>`;
}
export function renderAdminLogin() {
  const body = document.getElementById("adminBody");
  if (!body.querySelector("#adminLoginForm"))
    renderMarkup(body, signedOut(), "admin:signin");
}
export function setLoginMode(mode) {
  authMode = ["signin", "reset"].includes(mode) ? mode : "signin";
  document.getElementById("adminBody").replaceChildren();
  renderAdminLogin();
}
export async function authenticateAdmin(form) {
  const email = form.querySelector("#adminEmail").value.trim();
  const password = form.querySelector("#adminPassword")?.value;
  const message = form.querySelector("#adminLoginMessage");
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
  const message = form.querySelector("#adminLoginMessage");
  controls.forEach((control) => {
    control.disabled = true;
  });
  message.textContent = "Complete sign-in in the Google window.";
  try {
    await signInWithGoogle();
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
