import { closeModal } from "./modal.js";
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function playerFieldId(key) {
  return Array.from(key)
    .map((char) => char.codePointAt(0).toString(16))
    .join("-");
}
export function closeEditPlayer() {
  const overlay = document.getElementById("editPlayerOverlay");
  if (overlay) {
    closeModal(overlay);
    overlay.remove();
  }
}
