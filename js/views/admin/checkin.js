import { cleanPlayerName, hasPlayerName } from "../../player-search.js";
import { setRegistration, clearRegistration } from "../../drafts.js";
import { runCommand } from "../../commands.js";
import { getPlayers, _getTonight } from "../../state.js";
import {
  findCheckInMatches,
  checkInPlayer,
  removeCheckIn,
} from "../../checkin.js";
import { esc, toast } from "../../dom.js";
import { renderGamePage, updateStats, renderAdmin } from "../../refresh.js";
import { adminAlert, askConfirm } from "./dialogs.js";
let adminFocusIdx = -1;
export function adminSearch(q) {
  const dd = document.getElementById("adminDD");
  adminFocusIdx = -1;
  if (!q.trim()) {
    dd.classList.remove("open");
    return;
  }
  q = cleanPlayerName(q);
  const players = getPlayers();
  const matches = findCheckInMatches(players, _getTonight(), q);
  const exact = hasPlayerName(players, q);
  let html = matches
    .map(
      (
        p,
        i,
      ) => `<div class="admin-dd-item" data-idx="${i}" data-mousedown="adminCheckIn" data-arg0="${esc(p.key)}">
    <span>${esc(p.dn)}</span>
    <div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--muted)">${p.total} pts</span><span class="dd-tag exists">Existing</span></div>
  </div>`,
    )
    .join("");
  if (!exact) {
    const nk = q.trim().toLowerCase();
    if (!players[nk])
      html += `<div class="admin-dd-item is-new" data-mousedown="adminCreateAndCheckIn" data-arg0="${esc(q.trim())}"><span>Create "<strong>${esc(q.trim())}</strong>"</span><span class="dd-tag new">New player</span></div>`;
  }
  if (html) {
    dd.innerHTML = html;
    dd.classList.add("open");
  } else dd.classList.remove("open");
}
export function adminKeydown(e) {
  const dd = document.getElementById("adminDD"),
    items = dd.querySelectorAll(".admin-dd-item");
  if (!dd.classList.contains("open") || !items.length) return;
  if (e.key === "ArrowDown") {
    adminFocusIdx = Math.min(adminFocusIdx + 1, items.length - 1);
    adminHL(items);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    adminFocusIdx = Math.max(adminFocusIdx - 1, 0);
    adminHL(items);
    e.preventDefault();
  } else if (e.key === "Enter") {
    if (adminFocusIdx >= 0 && items[adminFocusIdx])
      items[adminFocusIdx].dispatchEvent(
        new Event("mousedown", { bubbles: true }),
      );
    e.preventDefault();
  } else if (e.key === "Escape") dd.classList.remove("open");
}
export function adminHL(items) {
  items.forEach((it, i) => it.classList.toggle("focused", i === adminFocusIdx));
  if (adminFocusIdx >= 0)
    items[adminFocusIdx].scrollIntoView({ block: "nearest" });
}
export async function adminCheckIn(key, profile) {
  try {
    await checkInPlayer(key, profile);
    clearRegistration("admin");
    const input = document.getElementById("adminSearchInput");
    if (input) {
      input.value = "";
      input.disabled = false;
    }
    document.getElementById("adminNpForm")?.classList.remove("open");
    document.getElementById("adminDD")?.classList.remove("open");
    renderGamePage();
    updateStats();
    renderAdmin();
    toast((getPlayers()[key]?.dn || key) + " checked in!");
  } catch (error) {
    adminAlert(error.message, "err");
  }
}
export function adminCreateAndCheckIn(name) {
  const dn = cleanPlayerName(name);
  if (!dn || dn.length < 2) {
    adminAlert("Name too short.", "err");
    return;
  }
  const form = document.getElementById("adminNpForm");
  const lbl = document.getElementById("adminNpNameLabel");
  const hint = document.getElementById("adminCheckinHint");
  if (!form) return;
  if (lbl) lbl.textContent = dn;
  document.getElementById("adminNpEmail").value = "";
  document.getElementById("adminNpPhone").value = "";
  form.classList.add("open");
  if (hint) hint.style.display = "none";
  const inp = document.getElementById("adminSearchInput");
  if (inp) {
    inp.value = dn;
    inp.disabled = true;
  }
  const dd = document.getElementById("adminDD");
  if (dd) dd.classList.remove("open");
  form.dataset.pendingName = dn;
  setRegistration("admin", dn);
  document.getElementById("adminNpEmail").focus();
}
export async function adminSubmitNewPlayer() {
  const form = document.getElementById("adminNpForm");
  const dn = form?.dataset.pendingName;
  if (!dn) return;
  return adminCheckIn(dn.toLowerCase(), {
    dn,
    email: document.getElementById("adminNpEmail").value.trim(),
    phone: document.getElementById("adminNpPhone").value.trim(),
  });
}
export function adminCancelNewPlayer() {
  clearRegistration("admin");
  const form = document.getElementById("adminNpForm");
  if (form) form.classList.remove("open");
  const inp = document.getElementById("adminSearchInput");
  if (inp) {
    inp.value = "";
    inp.disabled = false;
    inp.focus();
  }
  const hint = document.getElementById("adminCheckinHint");
  if (hint) hint.style.display = "";
}
export async function adminRemovePlayer(key) {
  try {
    await removeCheckIn(key);
    renderGamePage();
    updateStats();
    renderAdmin();
  } catch (error) {
    adminAlert(error.message, "err");
  }
}
export function adminClearTonight() {
  askConfirm("Clear tonight's entire check-in list?", async () => {
    await runCommand("clearAttendance");
    toast("Check-in list cleared.");
  });
}
