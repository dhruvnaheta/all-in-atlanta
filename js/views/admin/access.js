import { grantAdminAccess } from "../../admin-access.js";

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
  } catch (error) {
    message.textContent = error.message;
  } finally {
    input.disabled = false;
    button.disabled = false;
  }
}
