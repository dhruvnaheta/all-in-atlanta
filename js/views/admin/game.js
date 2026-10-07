import { LS } from "../../store.js";
import { equal } from "../../schema.js";
import { runCommand } from "../../commands.js";
import { clearGameDrafts } from "../../drafts.js";
import {
  _getTonight,
  getActiveGame,
  getActiveGameId,
  getHistory,
  getPlayers,
} from "../../state.js";
import {
  cleanPlayerName,
  hasPlayerName,
  searchPlayers,
} from "../../player-search.js";
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
import { ptFor, PLACES, MAX_EDITED_POINTS } from "../../scoring.js";
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
    "Stop without finishing results? No 1st–3rd place points will be awarded, even if positions are selected. Every checked-in player will receive only 1 participation point, and the game will be logged as stopped. Confirm to continue without results, or cancel to enter the finishing order.",
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
// Recorded results followed by players added after the game; removed additions become null.
let editingRows = [];
let correcting = false;
function resultRow(r, i) {
  const name = esc(r.name || r.key);
  return `<label class="finish-row${r.added ? " is-added" : ""}" data-result-row="${i}">
      <span style="flex:1">${name}${r.added ? ` <span class="dd-tag new">${r.isNew ? "New player" : "Added"}</span>` : ""}</span>
      <select class="fsel" data-result-index="${i}">
        ${["p", ...PLACES].map((pos) => `<option value="${pos}"${String(r.pos) === String(pos) ? " selected" : ""}>${pos === "p" ? "Participation" : "#" + pos} — ${ptFor(pos)} pts</option>`).join("")}
      </select><input class="np-input" style="width:90px" type="number" min="0" max="${MAX_EDITED_POINTS}" step="1" aria-label="Points for ${name}" data-result-points="${i}" value="${esc(r.pts)}">${r.added ? `<button type="button" class="btn btn-ghost" aria-label="Remove ${name}" data-click="adminResultsRemovePlayer" data-arg0="${i}">Remove</button>` : ""}</label>`;
}
function bindResultSelect(editor, select) {
  select.addEventListener("change", () => {
    editor.querySelector(`[data-result-points="${select.dataset.resultIndex}"]`).value = ptFor(select.value);
    const error = editor.querySelector("[data-result-error]");
    if (
      error.textContent !== "Two players share the same finishing position."
    )
      return;
    const positions = [...editor.querySelectorAll("[data-result-index]")]
      .map((el) => el.value)
      .filter((pos) => pos !== "p");
    if (new Set(positions).size === positions.length) error.textContent = "";
  });
}
export function adminEditResults(id) {
  if (correcting) return;
  const record = getHistory().find((h) => h._id === id);
  if (!record) return;
  editingRecord = structuredClone(record);
  editingRows = structuredClone(record.results || []);
  const editor = document.getElementById("historyResultsEditor");
  editor.innerHTML = `<div class="asec-title">Edit played game — ${esc(record.gameName || formatLeagueDate(record.date))}</div>
    <div class="np-fields"><label class="np-field"><span class="np-label">Game name</span><input class="np-input" id="historyGameName" type="text" maxlength="160" value="${esc(record.gameName || getHistoryGameName(record))}"></label>
    <label class="np-field"><span class="np-label">Game date</span><input class="np-input" id="historyGameDate" type="date" value="${esc(leagueDateKey(record.date) || "")}"></label></div>
    <p>Correct the game details or finishing order. Date changes update monthly standings and attendance streaks.</p>
    <p>Changing a finish fills in the standard points. Adjust awarded points below when needed (0–${MAX_EDITED_POINTS} per player per game). Saving updates standings; attendance stays the same unless you add players.</p>
    <div data-result-rows>${editingRows.map(resultRow).join("")}</div>
    <div class="history-add-player">
      <label class="np-label" for="historyAddPlayer">Add a player who didn't check in</label>
      <div class="admin-search-wrap">
        <input class="admin-search-input" id="historyAddPlayer" type="text" placeholder="Search by name…" autocomplete="off" data-input="adminResultsSearch" data-keydown="adminResultsSearchKeydown">
        <div class="admin-dd" id="historyAddDD"></div>
      </div>
    </div>
    <div role="alert" data-result-error></div>
    <button class="btn btn-green" data-click="adminSaveResults">Save game</button>
    <button class="btn btn-ghost" data-click="adminCancelResults">Cancel</button>`;
  for (const select of editor.querySelectorAll("[data-result-index]"))
    bindResultSelect(editor, select);
  editor.scrollIntoView({ block: "start", behavior: "smooth" });
  editor.querySelector("select, #historyAddPlayer")?.focus({ preventScroll: true });
}
export function adminResultsSearch(query) {
  const dd = document.getElementById("historyAddDD");
  if (!dd) return;
  const name = cleanPlayerName(query);
  if (!name) {
    dd.classList.remove("open");
    dd.replaceChildren();
    return;
  }
  const players = getPlayers();
  const taken = new Set(editingRows.filter(Boolean).map((r) => r.key));
  const matches = searchPlayers(players, name)
    .filter((p) => !taken.has(p.key))
    .slice(0, 8);
  let html = matches
    .map(
      (p) => `<button type="button" class="admin-dd-item" data-click="adminResultsAddPlayer" data-arg0="${esc(p.key)}"><span>${esc(p.dn || p.key)}</span><span class="dd-tag exists">Existing</span></button>`,
    )
    .join("");
  const key = name.toLowerCase();
  if (
    name.length >= 2 &&
    !hasPlayerName(players, name) &&
    !Object.hasOwn(players, key) &&
    !taken.has(key)
  )
    html += `<button type="button" class="admin-dd-item is-new" data-click="adminResultsCreatePlayer" data-arg0="${esc(name)}"><span>Create "<strong>${esc(name)}</strong>"</span><span class="dd-tag new">New player</span></button>`;
  dd.innerHTML = html;
  dd.classList.toggle("open", !!html);
}
export function adminResultsSearchKeydown(event) {
  if (event.key === "Escape")
    document.getElementById("historyAddDD")?.classList.remove("open");
  if (event.key !== "Enter") return;
  event.preventDefault();
  document.querySelector("#historyAddDD.open .admin-dd-item")?.click();
}
function addResultRow(row) {
  const editor = document.getElementById("historyResultsEditor");
  if (!editor || !editingRecord || correcting) return;
  if (editingRows.some((r) => r?.key === row.key)) return;
  const index = editingRows.length;
  editingRows.push({ ...row, pos: "p", pts: ptFor("p"), added: true });
  editor
    .querySelector("[data-result-rows]")
    .insertAdjacentHTML("beforeend", resultRow(editingRows[index], index));
  bindResultSelect(
    editor,
    editor.querySelector(`[data-result-index="${index}"]`),
  );
  const input = editor.querySelector("#historyAddPlayer");
  input.value = "";
  adminResultsSearch("");
  editor.querySelector(`[data-result-index="${index}"]`).focus();
}
export function adminResultsAddPlayer(key) {
  const player = getPlayers()[key];
  if (!player) return;
  addResultRow({ key, name: player.dn || key });
}
export function adminResultsCreatePlayer(name) {
  const dn = cleanPlayerName(name);
  if (dn.length < 2) return;
  addResultRow({ key: dn.toLowerCase(), name: dn, isNew: true });
}
export function adminResultsRemovePlayer(index) {
  if (correcting || !editingRows[index]?.added) return;
  editingRows[index] = null;
  document
    .querySelector(`#historyResultsEditor [data-result-row="${index}"]`)
    ?.remove();
  document.getElementById("historyAddPlayer")?.focus();
}
export function adminCancelResults() {
  if (correcting) return;
  editingRecord = null;
  editingRows = [];
  document.getElementById("historyResultsEditor")?.replaceChildren();
}
export async function adminSaveResults() {
  if (correcting || !editingRecord) return;
  const editor = document.getElementById("historyResultsEditor");
  const before = editingRecord;
  const rows = editingRows
    .map((r, i) => r && { ...r, index: i })
    .filter(Boolean);
  const positions = Object.fromEntries(
    rows.map((r) => [
      r.key,
      editor.querySelector(`[data-result-index="${r.index}"]`).value,
    ]),
  );
  const newPlayers = Object.fromEntries(
    rows.filter((r) => r.isNew).map((r) => [r.key, { dn: r.name }]),
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
    if (!rows.length) throw new Error("Add at least one player.");
    const points = Object.fromEntries(rows.map((r) => {
      const value = editor.querySelector(`[data-result-points="${r.index}"]`).value;
      const amount = Number(value);
      if (!value.trim() || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_EDITED_POINTS)
        throw new Error(`Points must be whole numbers between 0 and ${MAX_EDITED_POINTS} for every player.`);
      return [r.key, amount];
    }));
    await correctResults({
      historyId: before._id,
      before,
      positions,
      points,
      gameName,
      date,
      ...(Object.keys(newPlayers).length ? { newPlayers } : {}),
    });
    editingRecord = null;
    editingRows = [];
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
