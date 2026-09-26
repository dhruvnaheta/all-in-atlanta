import { runCommand } from "../../commands.js";
import { clearGameDrafts } from "../../drafts.js";
import { _getTonight, getActiveGameId } from "../../state.js";
import { timerReset, timerPause, timerStart } from "../../timer-controller.js";
import {
  renderAdmin,
  renderGamePage,
  updateStats,
  renderRankings,
  renderPlayerTable,
  renderTimerUI,
} from "../../refresh.js";
import { toast, playerFieldId } from "../../dom.js";
import { askConfirm, adminAlert } from "./dialogs.js";
import { commitResults } from "../../results.js";
import { ptFor } from "../../scoring.js";
export async function adminSetState(action) {
  await runCommand(action);
  toast(
    {
      start: "Game started.",
      openRegistration: "Check-in opened.",
      closeRegistration: "Check-in closed.",
    }[action],
  );
}

export function adminStopGame() {
  const section = document.getElementById("finishSection");
  if (!section) return adminStopWithoutResults();
  section.scrollIntoView({ block: "start", behavior: "smooth" });
  section.querySelector("select")?.focus({ preventScroll: true });
}
export function adminStopWithoutResults() {
  askConfirm(
    "Stop without finishing results? No 1st–8th place points will be awarded, even if positions are selected. Every checked-in player will receive only 1 participation point, and the game will be logged as stopped. Confirm to continue without results, or cancel to enter the finishing order.",
    () => completeGame(true),
  );
}
let savingResults = false;
export async function completeGame(stopped = false) {
  if (savingResults) return;
  savingResults = true;
  try {
    const positions = Object.fromEntries(
      _getTonight().map((p) => [
        p.key,
        document.getElementById("fsel_" + playerFieldId(p.key))?.value || "p",
      ]),
    );
    const result = await commitResults({
      gameId: getActiveGameId(),
      positions,
      stopped,
    });
    clearGameDrafts(getActiveGameId());
    renderAdmin();
    renderGamePage();
    renderRankings();
    updateStats();
    renderPlayerTable();
    renderTimerUI();
    const awards = result.streakSummary.map((p) => p.name).join(", ");
    adminAlert(
      "Results saved! " +
        result.awardedCount +
        " players recorded." +
        (awards ? " Streak chips due: " + awards : ""),
      "ok",
    );
    toast(
      stopped
        ? "Game stopped and logged."
        : "Game complete — attendance and points permanently recorded!",
    );
  } catch (error) {
    adminAlert(error.message, "err");
  } finally {
    savingResults = false;
  }
}
export const adminTimerPause = () => timerPause();
export const adminTimerResume = () => timerStart();
export function adminTimerReset() {
  askConfirm("Reset timer to Level 1 (100/200)?", () => timerReset());
}
export function syncFpos(sn) {
  const sel = document.getElementById("fsel_" + sn),
    lbl = document.getElementById("fpos_" + sn),
    pts = document.getElementById("fptsv_" + sn);
  if (!sel) return;
  const v = sel.value;
  if (!v) {
    if (lbl) lbl.textContent = "—";
    if (pts) pts.textContent = "— pts";
    return;
  }
  if (v === "p") {
    if (lbl) lbl.textContent = "P";
    if (pts) pts.textContent = "1 pt";
    return;
  }
  const n = parseInt(v);
  if (lbl) lbl.textContent = n;
  if (pts) pts.textContent = ptFor(n) + " pts";
}
export function submitResults() {
  const hasFinish = _getTonight().some((p) => {
    const value = document.getElementById(
      "fsel_" + playerFieldId(p.key),
    )?.value;
    return value && value !== "p";
  });
  if (!hasFinish) return adminStopWithoutResults();
  return completeGame(false);
}
