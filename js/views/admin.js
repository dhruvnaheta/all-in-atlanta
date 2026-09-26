import { accountRequestMarkup } from "./account.js";
import { renderMarkup } from "../render.js";
import { renderPlayerTable } from "../refresh.js";
import { isAdmin } from "../auth.js";
import { go } from "../navigation.js";
import {
  _getState,
  _getTonight,
  getHistory,
  getPlayers,
  getActiveGame,
  getTimerState,
  getGameList,
  getActiveGameId,
} from "../state.js";
import { BLIND_LEVELS } from "../blinds.js";
import {
  gameButtons,
  timerSection,
  checkinSection,
  tonightList,
  finishSection,
  historyRows,
} from "./admin/sections.js";
import { renderSeriesSection } from "./series.js";
import { esc } from "../dom.js";
export function openAdmin() {
  document.getElementById("adminOverlay").classList.add("open");
  renderAdmin();
  renderPlayerTable();
}
export function closeAdmin() {
  document.getElementById("adminOverlay").classList.remove("open");
}
document.getElementById("adminOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("adminOverlay")) closeAdmin();
});
export function renderAdmin() {
  const body = document.getElementById("adminBody");
  if (!isAdmin()) {
    body.replaceChildren();
    closeAdmin();
    go("account");
    return;
  }
  const state = _getState(),
    tonight = _getTonight(),
    history = getHistory(),
    players = getPlayers();
  const activeGame = getActiveGame();
  const ts = getTimerState();
  const level =
    BLIND_LEVELS[ts.levelIdx] || BLIND_LEVELS[BLIND_LEVELS.length - 1];

  const { gcBtns, stateLabels, dotCls } = gameButtons(state, activeGame);
  renderMarkup(
    body,
    `
    <div class="aalert" id="aalert" data-preserve></div>
    <div class="aconfirm" id="aconfirm" data-preserve>
      <div class="aconfirm-msg" id="aconfirm-msg"></div>
      <div class="aconfirm-btns">
        <button class="aconfirm-yes" id="aconfirm-yes">Yes, confirm</button>
        <button class="aconfirm-no" data-click="cancelConfirm">Cancel</button>
      </div>
    </div>

    <div class="asec">
      <div class="asec-title">Recurring Games</div>
      ${renderSeriesSection()}
    </div>

    <div class="asec">
      <div class="asec-title">Game Control${activeGame ? " — " + esc(activeGame.name) : " — No Active Game"}</div>
      <div class="gcp">
        ${(() => {
          const allGames = getGameList().slice().reverse();
          if (!allGames.length)
            return '<div style="font-size:13px;color:var(--muted);padding:6px 0">No games yet — use "Launch" in the Recurring Games section above.</div>';
          const opts = allGames
            .map((g) => {
              const statusTag =
                g.status === "running" && g.registrationOpen
                  ? " · Check-in Open"
                  : g.status === "running"
                    ? " · Running"
                    : "";
              return `<option value="${g.id}"${g.id === getActiveGameId() ? " selected" : ""}>${esc(g.name)}${statusTag}</option>`;
            })
            .join("");
          return `<div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:5px">SELECT GAME</div>
            <select id="gcGameSelect" data-change="adminSwitchGame" style="width:100%;box-sizing:border-box;padding:9px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none;background:var(--bg);color:var(--text)">${opts}</select>
          </div>`;
        })()}
        <div class="gcp-row">
          <div style="display:flex;align-items:center;gap:9px">
            <div class="gcp-dot ${dotCls[state]}"></div>
            <div class="gcp-label">${stateLabels[state]}</div>
          </div>
          <div class="gcp-btns">${gcBtns}</div>
        </div>
        ${timerSection(state, ts, level)}
        ${checkinSection(state)}
      </div>
    </div>

    ${tonightList(tonight, players)}
    ${finishSection(state, tonight, players, activeGame)}

    <div class="asec">
      <div class="asec-title">Recent Games</div>
      ${historyRows(history)}
    </div>

    ${accountRequestMarkup()}
    <div class="asec">
      <div class="asec-title">Player Data</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <input id="playerSearchFilter" type="text" placeholder="Filter by name…" data-input="renderPlayerTable"
          style="padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;width:180px;outline:none"/>
        <button class="btn btn-green-sm" data-click="exportPlayerCSV">⬇ Export CSV</button>
      </div>
      <div id="playerTableWrap" style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse;font-size:13px" id="playerDataTable">
          <thead>
            <tr style="background:var(--bg2);border-bottom:2px solid var(--border)">
              <th style="padding:9px 12px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Name</th>
              <th style="padding:9px 12px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Email</th>
              <th style="padding:9px 12px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Phone</th>
              <th style="padding:9px 12px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Registered</th>
              <th style="padding:9px 12px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Games</th>
              <th style="padding:9px 12px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Game Streak</th>
              <th style="padding:9px 12px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Total Pts</th>
              <th style="padding:9px 12px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Game History</th>
            </tr>
          </thead>
          <tbody id="playerDataBody" data-preserve></tbody>
        </table>
      </div>
    </div>

    <div class="asec">
      <div class="asec-title">Data Management</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-red" data-click="clearAllPlayers">Clear All Players</button>
        <button class="btn btn-red" data-click="resetAll">Wipe All Data</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:7px">These actions are permanent.</div>
    </div>

    <div class="asec"><div class="asec-title">Account</div>
      <button class="btn btn-ghost" data-click="resetPassword">Email me a password reset link</button>
    </div>
    <div style="padding-top:4px;text-align:right">
      <button style="background:none;border:none;font-size:13px;color:var(--muted);cursor:pointer;text-decoration:underline" data-click="logout">Sign out</button>
    </div>`,
    `admin:${getActiveGameId()}`,
  );

  // kick off live update of timer ctrl
  if (state === "closed" && ts.running) {
    // the global interval already handles this via renderTimerUI()
  }
  // Always refresh player table after admin re-renders
  setTimeout(renderPlayerTable, 0);
}
