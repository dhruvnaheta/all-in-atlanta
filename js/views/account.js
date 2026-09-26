import { atlantaDateKey, leagueDateKey } from "../league-date.js";
import { parseLeagueDate } from "../scoring.js";
import {
  currentUser,
  isAdmin,
  signIn,
  signUp,
  signOut,
  sendPasswordReset,
  verifyEmail,
  refreshUser,
} from "../auth.js";
import { getAccountState, accountCommand, updateAccount } from "../account.js";
import {
  getPlayers,
  getSeriesList,
  getGameList,
  getActiveGame,
  _getTonight,
} from "../state.js";
import { personalStats, standing } from "../personal-stats.js";
import { esc, toast } from "../dom.js";
import { renderMarkup } from "../render.js";
import { go } from "../navigation.js";
import { openAdmin } from "./admin.js";

let authMode = "signin";
let renderedUid;
const field = (id, label, value = "", type = "text", extra = "") =>
  `<label class="account-field" for="${id}">${label}<input id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const formatDate = (date) =>
  date?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) || "—";
const metric = (label, value, detail = "") =>
  `<div class="personal-metric"><div class="personal-label">${label}</div><strong>${esc(value)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
const rank = (value) => (value ? `#${value}` : "—");

function signedOut() {
  const signup = authMode === "signup",
    reset = authMode === "reset";
  return `<div class="account-welcome"><div><div class="sec-tag">Your seat at the table</div><h2>Your game.<br>Your progress.</h2><p>Keep up with your points, follow your streak, and get ready for the next game.</p><div class="account-preview"><span>♠ Your standings</span><span>♦ Recent results</span><span>♣ Five-game streak</span></div></div>
    <form id="accountAuthForm" class="card account-form" data-submit="accountAuthenticate">
      <h2>${signup ? "Create your account" : reset ? "Reset your password" : "Welcome back"}</h2>
      <p class="account-muted">${signup ? "Already played with us? We’ll connect your existing results after you sign up." : reset ? "Enter your sign-in email and we’ll send a reset link." : "Sign in to see your personal stats."}</p>
      ${field("accountEmail", "Email", "", "email", 'autocomplete="email" required maxlength="254"')}
      ${reset ? "" : field("accountPassword", "Password", "", "password", `autocomplete="${signup ? "new-password" : "current-password"}" required ${signup ? 'minlength="8"' : ""}`)}
      <p id="accountAuthMessage" class="account-message" role="status" data-preserve></p>
      <button class="btn btn-green" type="submit">${signup ? "Create account" : reset ? "Send reset link" : "Sign in"}</button>
      <div class="account-text-actions"><button type="button" data-click="accountAuthMode" data-arg0="${signup || reset ? "signin" : "signup"}">${signup || reset ? "Back to sign in" : "Create an account"}</button>${!reset ? '<button type="button" data-click="accountAuthMode" data-arg0="reset">Forgot password?</button>' : ""}</div>
    </form></div>`;
}
function onboarding(user, account) {
  if (!user.emailVerified)
    return `<section class="card account-panel"><h2>Verify your email</h2><p>We sent a verification link to <strong>${esc(user.email)}</strong>. Verify your email to connect your player profile.</p><div class="account-actions"><button class="btn btn-green" data-click="accountRefreshUser">I’ve verified my email</button><button class="btn btn-ghost" data-click="accountVerifyEmail">Resend email</button></div></section>`;
  if (account?.status === "pending")
    return `<section class="card account-panel"><span class="personal-label">Profile request sent</span><h2>You’re almost in, ${esc(account.requestedName)}.</h2><p>An admin will confirm your player profile. Your stats will appear here as soon as it’s approved.</p></section>`;
  const selectedKey = document.getElementById("accountPlayerKey")?.value || "";
  const newName = document.getElementById("accountNewName")?.value || "";
  const options = Object.values(getPlayers()).sort((a, b) =>
    (a.dn || a.key).localeCompare(b.dn || b.key),
  );
  return `<section class="card account-panel"><h2>Connect your player profile</h2><p>Choose the name you play under. An admin will confirm the match so your results stay with you.</p>${account?.status === "rejected" ? '<p class="account-message">Your previous request wasn’t approved. Check with an admin or choose the correct profile below.</p>' : ""}
    <form id="accountLinkForm" data-submit="accountRequestLink">
      <label class="account-field" for="accountPlayerKey">Existing player<select id="accountPlayerKey"><option value="">Choose your player profile</option>${options.map((p) => `<option value="${esc(p.key)}"${p.key === selectedKey ? " selected" : ""}>${esc(p.dn)}</option>`).join("")}</select></label>
      <p class="account-muted">New to the league? Leave the selection empty and enter your player name.</p>
      ${field("accountNewName", "New player name", newName, "text", 'autocomplete="name" maxlength="120"')}
      <button class="btn btn-green" type="submit">Request profile approval</button>
    </form></section>`;
}
function gameCard(key) {
  const active = getActiveGame(),
    series = getSeriesList();
  const today = atlantaDateKey();
  const game =
    active?.status === "running"
      ? active
      : getGameList()
          .filter(
            (g) => g.status === "scheduled" && leagueDateKey(g.date) >= today,
          )
          .sort((a, b) =>
            leagueDateKey(a.date).localeCompare(leagueDateKey(b.date)),
          )[0];
  if (!game)
    return `<section class="card account-panel"><div class="personal-label">Next game</div><h2>See you at the table</h2><p>Check the league schedule for upcoming games.</p><button class="btn btn-ghost" data-click="go" data-arg0="games">View games</button></section>`;
  const league = series.find((s) => s.id === game.seriesId);
  const checked =
    game.id === active?.id && _getTonight().some((p) => p.key === key);
  return `<section class="card account-panel"><div class="personal-label">${game.status === "running" ? "Active game" : "Next game"}</div><h2>${esc(game.name)}</h2><p>${esc(formatDate(parseLeagueDate(game.date)))}${league?.time ? ` · ${esc(league.time)} ET` : ""}<br>${esc(game.venue || league?.venue || "")}</p><div class="account-actions">${checked ? '<span class="account-checked" role="status">✓ You’re checked in</span>' : game.status === "running" && game.registrationOpen ? '<button class="btn btn-green" data-click="accountCheckIn">Check me in</button>' : `<span class="account-muted">${game.status === "running" ? "Registration is closed" : "Check-in hasn’t opened yet"}</span>`}<button class="btn btn-ghost" data-click="go" data-arg0="games">View game</button></div></section>`;
}
function dashboard(key) {
  const players = getPlayers();
  const stats = personalStats(players, key);
  if (!stats)
    return '<section class="card account-panel"><h2>Profile unavailable</h2><p>Your player record isn’t available right now. Please contact an admin.</p></section>';
  const { player, monthly, allTime, results } = stats;
  const next = stats.nextStreakDate;
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  today.setHours(0, 0, 0, 0);
  const expired = next && next < today;
  const streak = expired ? 0 : stats.streak;
  const complete = stats.streak === 5 && player.streakAwardDue;
  return `<section class="personal-stats-grid" aria-label="Your standings">
    ${metric("Monthly rank", rank(monthly.rank), `${monthly.points} points`)}
    ${metric("All-time rank", rank(allTime.rank), `${allTime.points} points`)}
    ${metric("Games played", stats.games)}${metric("Best finish", stats.best ? `#${stats.best}` : "—")}
    </section><p class="account-muted personal-gap">${allTime.gap ? `${allTime.gap} points to tie the next all-time position.` : allTime.rank ? "You’re at the top of the all-time standings." : "Play a game to get on the board."} Equal point totals share a rank.</p>
    <div class="personal-columns"><section class="card account-panel"><div class="personal-label">Five-game streak</div><h2>${streak}<span class="account-muted"> / 5 games</span></h2><div class="streak-track" aria-label="${streak} of 5 games">${Array.from({ length: 5 }, (_, i) => `<span class="${i < streak ? "filled" : ""}">${i + 1}</span>`).join("")}</div><p>${complete ? "5,000 bonus chips eligible — ask an admin to confirm your award." : expired ? "Start a new streak at your next game." : streak ? "Keep attending consecutive league games to earn 5,000 bonus chips." : "Attend five consecutive league games to earn 5,000 bonus chips."}</p>${next && !expired ? `<p class="account-muted">${streak === 5 ? "Start your next cycle" : "Keep your streak going"}: ${esc(formatDate(next))}.</p>` : ""}<p class="account-muted">Chips are awarded by an admin.</p></section>${gameCard(key)}</div>
    <section class="card account-panel"><div class="account-section-heading"><h2>Recent results</h2><span class="account-muted">From recorded results</span></div>
      ${
        results.length
          ? `<div class="account-table-wrap"><table class="rt"><thead><tr><th>Date</th><th>Game</th><th>Finish</th><th>Points</th></tr></thead><tbody>${results
              .slice(0, 10)
              .map(
                (r) =>
                  `<tr><td>${esc(formatDate(parseLeagueDate(r.date)))}</td><td>${esc(r.gameName || "League game")}</td><td>${Number(r.pos) >= 1 && Number(r.pos) <= 8 ? `#${Number(r.pos)}` : "Played"}</td><td><span class="pts-pill">${esc(r.pts ?? "—")}</span></td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : "<p>Your recorded results will appear here after a game is scored.</p>"
      }
      <div class="personal-records"><span><strong>${stats.wins}</strong> recorded wins</span><span><strong>${stats.topEight}</strong> recorded top-eight finishes</span></div><p class="account-muted">Older game details may be incomplete. Your league totals are shown above.</p></section>
    <section class="card account-panel"><h2>By series</h2>${
      getSeriesList().length
        ? `<div class="account-table-wrap"><table class="rt"><thead><tr><th>Series</th><th>Rank</th><th>Games</th><th>Points</th></tr></thead><tbody>${getSeriesList()
            .map((s) => {
              const row = standing(players, key, "total", s.id);
              return `<tr><td>${esc(s.name)}</td><td>${rank(row.rank)}</td><td>${esc(player.bySeries?.[s.id]?.games || 0)}</td><td>${row.points}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : "<p>No series results yet.</p>"
    }</section>`;
}
function settings(user, profile) {
  return `<details class="card account-panel account-settings" id="accountSettings"><summary>Account settings</summary><p class="account-muted">Sign-in email: ${esc(user.email)}. Contact details are private to you and league admins.</p>
    ${profile ? `<form id="accountProfileForm" data-submit="accountSaveProfile" data-preserve>${field("accountDisplayName", "Player display name", profile.dn, "text", 'required minlength="2" maxlength="120"')}${field("accountContactEmail", "Contact email", profile.email, "email", 'maxlength="254" autocomplete="email"')}${field("accountPhone", "Phone", profile.phone, "tel", 'maxlength="40" autocomplete="tel"')}<p class="account-muted">Changing your contact email doesn’t change how you sign in.</p><button class="btn btn-green" type="submit">Save profile</button></form>` : ""}
    <button class="btn btn-ghost account-reset" data-click="accountPasswordReset">Email me a password reset link</button></details>`;
}
export function renderAccount() {
  const body = document.getElementById("accountContent");
  if (!body) return;
  const user = currentUser(),
    state = getAccountState();
  if (renderedUid !== user?.uid) {
    body.replaceChildren();
    renderedUid = user?.uid;
  }
  const title = document.getElementById("accountTitle");
  title.textContent =
    user && state.profile && state.account?.playerKey
      ? `Hey, ${getPlayers()[state.account.playerKey]?.dn || "player"}`
      : "My Stats";
  const headingActions = document.getElementById("accountHeadingActions");
  headingActions.innerHTML = user
    ? `${isAdmin() ? '<button class="btn btn-gold" data-click="openAdmin">Admin view</button>' : ""}<button class="btn btn-outline-w" data-click="accountSignOut">Sign out</button>`
    : "";
  if (!user) {
    // Keep typed credentials during unrelated live league updates.
    if (!body.querySelector("#accountAuthForm"))
      renderMarkup(body, signedOut());
    return;
  }
  renderMarkup(
    body,
    `${state.error ? `<p class="account-message" role="alert">${esc(state.error)}</p>` : ""}${!state.loaded ? '<section class="card account-panel" role="status">Loading your player account…</section>' : state.account?.playerKey ? (state.profile ? dashboard(state.account.playerKey) : state.error ? '<section class="card account-panel"><h2>Profile unavailable</h2><p>Your linked profile could not be loaded. Reload to try again or contact an admin.</p></section>' : '<section class="card account-panel" role="status">Loading your player profile…</section>') : state.error ? '<section class="card account-panel"><p>Account services could not load. Please reload to try again.</p></section>' : onboarding(user, state.account)}${settings(user, state.profile)}`,
  );
}
export function setAccountAuthMode(mode) {
  authMode = ["signin", "signup", "reset"].includes(mode) ? mode : "signin";
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
      if (authMode === "signup") await signUp(email, password);
      else await signIn(email, password);
      renderAccount();
      if (isAdmin()) openAdmin();
    }
  } catch (error) {
    // A verification-email failure can happen after account creation succeeds.
    if (message.isConnected) message.textContent = friendlyAuthError(error);
    else toast(friendlyAuthError(error));
  } finally {
    button.disabled = false;
  }
}
export function friendlyAuthError(error) {
  const errors = {
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
export async function requestAccountLink() {
  const playerKey = document.getElementById("accountPlayerKey").value;
  const newName = document.getElementById("accountNewName").value.trim();
  if (!!playerKey === !!newName)
    throw new Error("Choose an existing profile or enter a new player name.");
  await accountCommand({ action: "requestLink", playerKey, newName });
  toast("Profile request sent to the admins.");
}
export async function saveAccountProfile() {
  const uid = currentUser()?.uid;
  const profile = {
    dn: document.getElementById("accountDisplayName").value.trim(),
    email: document.getElementById("accountContactEmail").value.trim(),
    phone: document.getElementById("accountPhone").value.trim(),
  };
  await accountCommand({ action: "saveProfile", ...profile });
  if (currentUser()?.uid === uid) updateAccount({ profile });
  toast("Profile saved.");
}
export async function personalCheckIn() {
  await accountCommand({ action: "checkIn", gameId: getActiveGame()?.id });
  toast("You’re checked in. See you at the table!");
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
export async function accountVerifyEmail() {
  await verifyEmail();
  toast("Verification email sent.");
}
export async function accountRefreshUser() {
  await refreshUser();
  renderAccount();
  if (!currentUser()?.emailVerified)
    toast("Your email isn’t verified yet. Open the link in your email first.");
}
export function accountRequestMarkup() {
  const { requests } = getAccountState();
  return `<div class="asec" id="accountApprovalSection"><div class="asec-title">Player Account Requests${requests.length ? ` (${requests.length})` : ""}</div><p class="account-muted">Confirm each person’s identity before connecting their results.</p>${requests.length ? requests.map((r) => `<div class="account-request"><div><strong>${esc(r.requestedName)}</strong><div class="account-muted">${esc(r.email)} · ${r.newPlayer ? "New player" : "Existing player"}</div></div><div class="account-actions"><button class="btn btn-green-sm" data-click="adminApproveAccount" data-arg0="${esc(r.uid)}">Approve</button><button class="btn btn-ghost" data-click="adminRejectAccount" data-arg0="${esc(r.uid)}">Decline</button></div></div>`).join("") : '<p class="account-muted">No player accounts waiting for approval.</p>'}</div>`;
}
export async function reviewAccount(uid, approve) {
  await accountCommand({ action: approve ? "approveLink" : "rejectLink", uid });
  toast(approve ? "Player account linked." : "Request declined.");
}
