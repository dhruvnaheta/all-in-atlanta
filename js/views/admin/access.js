import { esc } from "../../dom.js";
import { currentUser, isAdmin } from "../../auth.js";
import { grantAdminAccess, adminDirectory } from "../../admin-access.js";

export async function adminAddAdministrator(form) {
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const message = form.querySelector('[role="status"]');
  const email = input.value.trim();
  input.disabled = true;
  button.disabled = true;
  message.textContent = "Granting administrator access…";
  try {
    const result = await grantAdminAccess(email);
    message.textContent = result.alreadyAdmin
      ? `${result.email} already has administrator access.`
      : `Administrator access granted to ${result.email}. They can sign in with Google or use Forgot password to set a password. If already signed in, they should sign out and sign in again.`;
    input.value = "";
    await loadAdministrators();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    input.disabled = false;
    button.disabled = false;
  }
}

let revision = 0;
export async function loadAdministrators() {
  const container = document.getElementById("administratorList");
  if (!container || !isAdmin()) return;
  const user = currentUser();
  const requestRevision = ++revision;
  container.textContent = "Loading administrators…";
  try {
    const result = await adminDirectory();
    if (
      requestRevision !== revision ||
      currentUser() !== user ||
      !container.isConnected
    )
      return;
    container.innerHTML =
      result.administrators
        .map(
          (
            admin,
          ) => `<div class="admin-access-fields" style="margin-bottom:12px">
      <span>${esc(admin.name || admin.email)}${admin.name ? ` · ${esc(admin.email)}` : ""} · ${admin.owner ? "Owner" : "Administrator"}${admin.disabled ? " (disabled)" : ""}</span>
      ${result.owner && !admin.owner ? `<button class="btn btn-ghost" data-click="adminRemoveAdministrator" data-arg0="${esc(admin.uid)}" data-email="${esc(admin.email)}">Remove administrator</button>` : ""}
    </div>`,
        )
        .join("") || "No administrators found.";
  } catch (error) {
    if (
      requestRevision === revision &&
      currentUser() === user &&
      container.isConnected
    )
      container.textContent = error.message;
  }
}
export async function adminRemoveAdministrator(button) {
  if (
    !window.confirm(`Remove administrator access for ${button.dataset.email}?`)
  )
    return;
  await adminDirectory({ uid: button.dataset.arg0 });
  await loadAdministrators();
}
