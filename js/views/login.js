import { signOut, sendPasswordReset } from "../auth.js";
import { renderAdmin } from "../refresh.js";
import { go } from "../navigation.js";
import { toast } from "../dom.js";
export async function logout() {
  await signOut();
  renderAdmin();
  go("account");
}
export async function resetPassword() {
  await sendPasswordReset();
  toast("Password reset email sent.");
}
