import { openModal, closeModal } from "../../modal.js";
export function askConfirm(msg, onYes) {
  cancelConfirm();
  const box = document.createElement("div");
  box.id = "aconfirm";
  box.className = "confirm-overlay";
  box.setAttribute("aria-labelledby", "aconfirm-msg");
  box.innerHTML = `<div class="confirm-card"><p id="aconfirm-msg"></p>
    <p id="confirmError" role="alert"></p><div class="aconfirm-btns">
    <button class="aconfirm-no" data-click="cancelConfirm">Cancel</button>
    <button class="aconfirm-yes" id="aconfirm-yes">Yes, confirm</button></div></div>`;
  box.querySelector("#aconfirm-msg").textContent = msg;
  document.body.append(box);
  openModal(box, cancelConfirm);
  const yes = box.querySelector("#aconfirm-yes");
  yes.addEventListener("click", async () => {
    if (yes.disabled) return;
    yes.disabled = true;
    yes.textContent = "Saving…";
    try {
      await onYes();
      if (box.isConnected) cancelConfirm();
    } catch (error) {
      box.querySelector("#confirmError").textContent = error.message;
    } finally {
      yes.disabled = false;
      yes.textContent = "Yes, confirm";
    }
  });
}
export function toggleGameHist(id, hdr) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === "block";
  el.style.display = open ? "none" : "block";
  hdr.setAttribute("aria-expanded", String(!open));
  const lbl = hdr.querySelector(".gh-toggle-lbl");
  if (lbl) lbl.textContent = open ? "▼ Details" : "▲ Hide";
}
export function cancelConfirm() {
  const box = document.getElementById("aconfirm");
  if (box) {
    closeModal(box);
    box.remove();
  }
}

export function adminAlert(msg, type) {
  const el = document.getElementById("aalert");
  if (!el) return;
  el.textContent = msg;
  el.className = "aalert " + type;
  el.style.display = "block";
  el.setAttribute("role", "alert");
  el.scrollIntoView({ block: "nearest" });
  setTimeout(() => {
    if (el) el.style.display = "none";
  }, 4000);
}
