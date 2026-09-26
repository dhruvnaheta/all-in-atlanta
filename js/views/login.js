import { signIn, signOut, sendPasswordReset } from "../auth.js";
import { renderAdmin } from "../refresh.js";
import { toast } from "../dom.js";
export function renderLogin(body) {
  body.innerHTML = `<form class="login-box" data-submit="tryLogin">
    <div class="login-title">Admin Login</div>
    <div class="login-sub">Sign in with your administrator account.</div>
    <div class="aalert" id="loginAlert" role="alert"></div>
    <input type="email" class="login-input" id="loginEmail" aria-label="Email" placeholder="Email" autocomplete="username" required/>
    <input type="password" class="login-input" id="loginPw" aria-label="Password" placeholder="Password" autocomplete="current-password" required/>
    <button class="btn btn-green" type="submit">Sign In</button>
  </form>`;
  document.getElementById("loginEmail")?.focus();
}
export async function tryLogin() {
  const alert = document.getElementById("loginAlert");
  const button = document.querySelector(".login-box button");
  button.disabled = true;
  try {
    await signIn(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPw").value,
    );
    renderAdmin();
  } catch (error) {
    alert.textContent = error.message;
    alert.className = "aalert err";
    alert.style.display = "block";
  } finally {
    button.disabled = false;
  }
}
export async function logout() {
  await signOut();
  renderAdmin();
}
export async function resetPassword() {
  await sendPasswordReset();
  toast("Password reset email sent.");
}
