import { LS } from "../../store.js";
import { equal } from "../../schema.js";
import { runCommand } from "../../commands.js";
import { clearGameDrafts } from "../../drafts.js";
import {
  _getTonight,
  getActiveGame,
  getActiveGameId,
  getHistory,
} from "../../state.js";
import { timerReset, timerPause, timerStart } from "../../timer-controller.js";
import {
  renderAdmin,
  renderGamePage,
  updateStats,
  renderRankings,
  renderPlayerTable,
  renderTimerUI,
} from "../../refresh.js";
import { toast, playerFieldId, esc } from "../../dom.js";
import { askConfirm, adminAlert } from "./dialogs.js";
import { commitResults, correctResults } from "../../results.js";
import { leagueDateKey, formatLeagueDate } from "../../league-date.js";
import { ptFor } from "../../scoring.js";
export async function adminSetState(action) {
  const before = getActiveGame();
  const receipt = await runCommand(action);
  // The callable response can beat the live listener. Publish confirmed state
  // immediately, but never replace a newer snapshot received during the request.
  if (receipt?.game && before && equal(getActiveGame(), before)) {
    LS.applyRemote(
      "gameList",
      LS.get("gameList", []).map((game) =>
        game.id === before.id ? receipt.game : game,
      ),
    );
  }
  renderAdmin();
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

function getHistoryGameName(record) {
  return record.date
    ? "All In Atlanta — " + formatLeagueDate(record.date)
    : "All In Atlanta";
}
let editingRecord;
let correcting = false;
export function adminEditResults(id) {
  if (correcting) return;
  const record = getHistory().find((h) => h._id === id);
  if (!record) return;
  editingRecord = structuredClone(record);
  const editor = document.getElementById("historyResultsEditor");
  editor.innerHTML = `<div class="asec-title">Edit played game — ${esc(record.gameName || formatLeagueDate(record.date))}</div>
    <div class="np-fields"><label class="np-field"><span class="np-label">Game name</span><input class="np-input" id="historyGameName" type="text" maxlength="160" value="${esc(record.gameName || getHistoryGameName(record))}"></label>
    <label class="np-field"><span class="np-label">Game date</span><input class="np-input" id="historyGameDate" type="date" value="${esc(leagueDateKey(record.date) || "")}"></label></div>
    <p>Correct the game details or finishing order. Date changes update monthly standings and attendance streaks.</p>
    <p>Enter the actual finishing order. Saving replaces this game's points; attendance stays the same. Unplaced players receive 1 participation point.</p>
    ${record.results
      .map(
        (r, i) => `<label class="finish-row">
      <span style="flex:1">${esc(r.name || r.key)}</span>
      <select class="fsel" data-result-index="${i}">
        ${["p", 1, 2, 3, 4, 5, 6, 7, 8].map((pos) => `<option value="${pos}"${String(r.pos) === String(pos) ? " selected" : ""}>${pos === "p" ? "Participation" : "#" + pos} — ${ptFor(pos)} pts</option>`).join("")}
      </select></label>`,
      )
      .join("")}
    <div role="alert" data-result-error></div>
    <button class="btn btn-green" data-click="adminSaveResults">Save game</button>
    <button class="btn btn-ghost" data-click="adminCancelResults">Cancel</button>`;
  const selects = [...editor.querySelectorAll("[data-result-index]")];
  for (const select of selects) {
    select.addEventListener("change", () => {
      const error = editor.querySelector("[data-result-error]");
      if (
        error.textContent !== "Two players share the same finishing position."
      )
        return;
      const positions = selects
        .map((el) => el.value)
        .filter((pos) => pos !== "p");
      if (new Set(positions).size === positions.length) error.textContent = "";
    });
  }
  editor.scrollIntoView({ block: "start", behavior: "smooth" });
  editor.querySelector("select")?.focus({ preventScroll: true });
}
export function adminCancelResults() {
  if (correcting) return;
  editingRecord = null;
  document.getElementById("historyResultsEditor")?.replaceChildren();
}
export async function adminSaveResults() {
  if (correcting || !editingRecord) return;
  const editor = document.getElementById("historyResultsEditor");
  const before = editingRecord;
  const positions = Object.fromEntries(
    before.results.map((r, i) => [
      r.key,
      editor.querySelector(`[data-result-index="${i}"]`).value,
    ]),
  );
  correcting = true;
  editor.querySelectorAll("button, select, input").forEach((el) => {
    el.disabled = true;
  });
  try {
    const gameName = editor.querySelector("#historyGameName").value.trim();
    const date = editor.querySelector("#historyGameDate").value;
    if (!gameName) throw new Error("Enter a game name.");
    if (!leagueDateKey(date)) throw new Error("Enter a valid game date.");
    await correctResults({
      historyId: before._id,
      before,
      positions,
      gameName,
      date,
    });
    editingRecord = null;
    editor.replaceChildren();
    toast("Game updated. Standings will update automatically.");
  } catch (error) {
    editor.querySelector("[data-result-error]").textContent = error.message;
  } finally {
    correcting = false;
    editor.querySelectorAll("button, select, input").forEach((el) => {
      el.disabled = false;
    });
  }
}
