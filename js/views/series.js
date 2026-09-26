import { newestGameFirst } from "../league-date.js";
import { runCommand } from "../commands.js";
import { toast } from "../dom.js";
import {
  getSeriesList,
  getGameList,
  getActiveGameId,
  setSeriesList,
} from "../state.js";
import { nextOccurrence, fmtDate, DAYS } from "../schedule.js";
import { esc } from "../dom.js";
import { adminAlert, askConfirm } from "./admin/dialogs.js";
import { renderAdmin, updateHomeSched } from "../refresh.js";
export function renderSeriesSection() {
  const series = getSeriesList();
  const games = getGameList();
  const activeId = getActiveGameId();

  const seriesHTML = series.length
    ? series
        .map((s) => {
          const next = nextOccurrence(s.day);
          const nextLabel = fmtDate(next);
          // find most recent game for this series
          const myGames = games
            .filter((g) => g.seriesId === s.id)
            .sort(newestGameFirst);
          return `<div style="border:1.5px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;background:var(--bg)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;color:var(--text)">${esc(s.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap">
            <span>${esc(s.venue)}</span>
            <span>Every ${DAYS[s.day]} · ${esc(s.time)}</span>
            <span style="color:var(--gold-d);font-weight:600">Next: ${nextLabel}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-green" style="padding:5px 13px;font-size:12px" data-click="adminLaunchGame" data-arg0="${esc(s.id)}">+ Launch ${nextLabel}</button>
          ${s.id === "s_wickedwolf_monday" || s.id === "s_wickedwolf" || s.id === "s_5paces" ? "" : `<button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;color:var(--muted)" data-click="adminDeleteSeries" data-arg0="${esc(s.id)}">✕</button>`}
        </div>
      </div>
      ${
        myGames.length
          ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
        ${myGames
          .slice(0, 5)
          .map((g) => {
            const isSelected = g.id === activeId;
            const isActive = isSelected && g.status === "running";
            const stateLabel =
              {
                scheduled: "Scheduled",
                running: "Running",
                completed: "Completed",
              }[g.status] || g.status;
            const stateColor =
              {
                scheduled: "var(--muted)",
                running: "var(--green)",
                completed: "var(--gold)",
              }[g.status] || "var(--muted)";
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.04)">
            <div style="flex:1;font-size:12px;color:var(--text)">${esc(g.name)}</div>
            <div style="font-size:11px;color:${stateColor};font-weight:600;white-space:nowrap">${stateLabel}</div>
            ${(g.tonight || []).length ? `<div style="font-size:11px;color:var(--muted)">${g.tonight.length} in</div>` : ""}
            ${
              isActive
                ? `<span style="font-size:10px;font-weight:700;color:var(--red);padding:2px 6px;border-radius:3px;background:rgba(166,28,28,.1);letter-spacing:.5px">ACTIVE</span>`
                : isSelected
                  ? `<span style="font-size:10px;color:var(--muted)">SELECTED</span>`
                  : `<button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" data-click="adminActivateGame" data-arg0="${esc(g.id)}">▶</button>`
            }
            ${!isSelected ? `<button class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--muted)" data-click="adminDeleteGame" data-arg0="${esc(g.id)}">✕</button>` : ""}
          </div>`;
          })
          .join("")}
      </div>`
          : ""
      }
    </div>`;
        })
        .join("")
    : '<div style="font-size:13px;color:var(--muted);padding:4px 0 8px">No recurring games set up yet. Add one below.</div>';

  return `${seriesHTML}
    <details style="margin-top:10px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.5px;user-select:none">+ ADD RECURRING GAME</summary>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div style="flex:2;min-width:140px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">SERIES NAME</div>
            <input id="sName" type="text" placeholder="e.g. Wicked Wolf League" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none"/>
          </div>
          <div style="flex:2;min-width:120px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">VENUE</div>
            <input id="sVenue" type="text" placeholder="e.g. Wicked Wolf" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none"/>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">DAY OF WEEK</div>
            <select id="sDay" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none;background:var(--bg)">
              ${DAYS.map((d, i) => `<option value="${i}"${i === 4 ? " selected" : ""}>${d}</option>`).join("")}
            </select>
          </div>
          <div style="flex:1;min-width:100px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">TIME</div>
            <input id="sTime" type="text" placeholder="8:00 PM" value="8:00 PM" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none"/>
          </div>
          <div style="display:flex;align-items:flex-end;padding-bottom:1px">
            <button class="btn btn-green" data-click="adminAddSeries" style="white-space:nowrap">Save Series</button>
          </div>
        </div>
      </div>
    </details>`;
}

export async function adminAddSeries() {
  const name = (document.getElementById("sName") || {}).value?.trim();
  const venue = (document.getElementById("sVenue") || {}).value?.trim();
  const day = parseInt((document.getElementById("sDay") || {}).value || "4");
  const time =
    (document.getElementById("sTime") || {}).value?.trim() || "8:00 PM";
  if (!name || !venue) {
    adminAlert("Please enter a name and venue.", "err");
    return;
  }
  const list = getSeriesList();
  list.push({ id: "s_" + Date.now(), name, venue, day, time });
  await setSeriesList(list);
  // Migrate existing Wicked Wolf hardcoded game if no series existed before
  adminAlert('Series "' + name + '" added.', "ok");
  renderAdmin();
  updateHomeSched();
}

export async function adminLaunchGame(seriesId) {
  const series = getSeriesList().find((s) => s.id === seriesId);
  if (!series) return;
  const day = nextOccurrence(series.day);
  const date = [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
  await runCommand("launchGame", { seriesId, date });
  toast("Game scheduled.");
}
export async function adminSwitchGame(id) {
  if (id && id !== getActiveGameId())
    await runCommand("activateGame", { gameId: id });
}
export const adminActivateGame = adminSwitchGame;
export function adminDeleteGame(id) {
  askConfirm(
    "Remove this game from the schedule? Completed results are kept.",
    async () => {
      await runCommand("deleteGame", { gameId: id });
      toast("Game removed from schedule.");
    },
  );
}
export function adminDeleteSeries(id) {
  askConfirm(
    "Delete this recurring series and remove its games from the schedule? Completed results are kept.",
    async () => {
      await runCommand("deleteSeries", { seriesId: id });
      toast("Series deleted.");
    },
  );
}
