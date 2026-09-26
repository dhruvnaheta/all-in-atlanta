import { isCheckInOpen, checkInStatus } from "../../public-games.js";
import { newestGameFirst, formatLeagueDate } from "../../league-date.js";
import {
  timerGetRemaining,
  timerGetProgress,
  fmtTime,
} from "../../timer-controller.js";
import { levelDur, BLIND_LEVELS, levelDurMins } from "../../blinds.js";
import { esc, playerFieldId } from "../../dom.js";
import { previewNextStreak } from "../../scoring.js";
export function gameButtons(state, game) {
  const registrationOpen = game?.registrationOpen;
  const canCheckIn = isCheckInOpen(game);
  const isGameDay = isCheckInOpen({ ...game, registrationOpen: true });
  const gcBtns =
    state === "scheduled" && game
      ? '<button class="btn btn-green" data-click="adminSetState" data-arg0="start">▶ Start Game</button>'
      : state === "running"
        ? `<button class="btn btn-ghost" data-click="adminSetState" data-arg0="${registrationOpen ? "closeRegistration" : "openRegistration"}">${registrationOpen ? (canCheckIn ? "🔒 Close Check-In" : "Disable game-day check-in") : isGameDay ? "🔓 Open Check-In" : "Enable game-day check-in"}</button><button class="btn btn-red" data-click="adminStopGame">⏹ Stop Game</button>`
        : "";
  return {
    gcBtns,
    stateLabels: {
      scheduled: "Game scheduled",
      running: `Running · ${checkInStatus(game)}`,
      completed: "Game completed",
    },
    dotCls: {
      scheduled: "idle",
      running: canCheckIn ? "open" : "closed",
      completed: "idle",
    },
  };
}

export function timerSection(state, ts, level) {
  // Timer controls are available once a game has started.
  // Keep timer and check-in independent so late registration can remain open
  // while the blind clock is already running.
  const timerRemaining = timerGetRemaining();
  const timerProgress = timerGetProgress();
  const dur = levelDur(ts.levelIdx);
  const isUrg = timerRemaining < Math.min(dur * 0.1, 30000) && !level.isBreak;
  const isWarn = timerRemaining < Math.min(dur * 0.25, 60000) && !level.isBreak;
  const timerSection =
    state === "running"
      ? `
    <div class="gcp-div"></div>
    <div class="timer-ctrl">
      <div class="timer-ctrl-info">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:2px">Current Blinds</div>
        <div class="timer-ctrl-blind" id="tc-blind">${level.isBreak ? "☕ Break" : level.label}</div>
        <div class="timer-ctrl-sub">Level ${ts.levelIdx + 1} of ${BLIND_LEVELS.length}${!ts.running ? " · PAUSED" : ""}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="timer-ctrl-time${isUrg ? " urg" : isWarn ? " warn" : ""}" id="tc-time">${fmtTime(timerRemaining)}</div>
        <div style="width:100px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
          <div id="tc-prog" style="height:100%;width:${(timerProgress * 100).toFixed(1)}%;background:var(--gold);transition:width .95s linear"></div>
        </div>
      </div>
    </div>
    <div style="padding:0 18px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${
        ts.running
          ? `<button class="btn btn-ghost" data-click="adminTimerPause">⏸ Pause</button>`
          : `<button class="btn btn-green" data-click="adminTimerResume">${ts.pausedRemaining !== null && ts.pausedRemaining < levelDur(ts.levelIdx) ? "▶ Resume" : "▶ Start"} Timer</button>`
      }
      <button class="btn btn-ghost" data-click="adminTimerReset">↺ Reset to L1</button>
    </div>
    <div class="level-jumper">
      <div class="level-jump-label">Jump to level:</div>
      <div class="level-jump-btns">
        ${BLIND_LEVELS.map((l, i) => `<button class="ljbtn${l.isBreak ? " is-break" : ""}${i === ts.levelIdx ? " active" : ""}" data-idx="${i}" data-click="jumpLevel" data-arg0="${esc(i)}">${l.isBreak ? "☕" : l.label}</button>`).join("")}
      </div>
    </div>
    <div style="padding:12px 18px;border-top:1px solid var(--border)">
      <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1.5px;margin-bottom:10px">LEVEL DURATIONS (minutes)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
        ${BLIND_LEVELS.map((l, i) => {
          const mins = levelDurMins(i);
          return `<div style="display:flex;align-items:center;gap:6px">
            <div style="font-size:11px;color:var(--muted);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.isBreak ? "☕ Break" : l.label}</div>
            <input type="number" min="1" max="60" value="${mins}"
              style="width:48px;padding:4px 6px;border:1.5px solid var(--border);border-radius:5px;font-family:Barlow,sans-serif;font-size:12px;text-align:center;outline:none"
              data-change="adminSetLevelDur" data-arg0="${esc(i)}" />
            <span style="font-size:11px;color:var(--muted)">m</span>
          </div>`;
        }).join("")}
      </div>
      <button data-click="adminResetLevelDurs" style="margin-top:10px;background:none;border:1px solid var(--border);border-radius:5px;padding:4px 10px;font-family:'Barlow Condensed',sans-serif;font-size:11px;color:var(--muted);letter-spacing:.5px;cursor:pointer">↺ Reset to defaults</button>
    </div>`
      : "";

  return timerSection;
}

export function checkinSection(state) {
  // admin checkin search — available when game is active (open or closed)
  const checkinSection =
    state === "running"
      ? `
    <div class="gcp-div"></div>
    <div class="admin-checkin">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:9px">Add Player to Tonight</div>
      <div class="admin-search-wrap">
        <input class="admin-search-input" id="adminSearchInput" type="text" placeholder="Search by name…" autocomplete="off"
          data-input="adminSearch" data-keydown="adminKeydown"/>
        <div class="admin-dd" id="adminDD" data-preserve></div>
      </div>
      <div class="np-form" id="adminNpForm" style="margin-top:10px">
        <div class="np-form-title">New Player — <span id="adminNpNameLabel"></span></div>
        <div class="np-fields">
          <div class="np-field">
            <div class="np-label">Email <span class="np-optional">— optional</span></div>
            <input class="np-input" id="adminNpEmail" type="email" placeholder="you@example.com" autocomplete="off"/>
          </div>
          <div class="np-field">
            <div class="np-label">Phone <span class="np-optional">— optional</span></div>
            <input class="np-input" id="adminNpPhone" type="tel" placeholder="(404) 555-0100" autocomplete="off"/>
          </div>
        </div>
        <div class="np-btns">
          <button class="btn btn-green" data-click="adminSubmitNewPlayer">Add &amp; Check In</button>
          <button class="btn-ghost" data-click="adminCancelNewPlayer">Cancel</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:7px" id="adminCheckinHint">Type to search existing players or create a new one.</div>
    </div>`
      : "";

  return checkinSection;
}

export function tonightList(tonight, players) {
  // tonight list — show contact info
  const tonightList = tonight.length
    ? `
    <div class="asec attendance-section">
      <div class="attendance-heading">
        <div class="asec-title">Tonight's Check-Ins (${tonight.length})</div>
        <button class="attendance-clear" data-click="adminClearTonight">Clear all</button>
      </div>
      ${tonight
        .map((p) => {
          const rec = players[p.key] || {};
          const init = (rec.dn || p.key)
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const contactLine = [rec.email, rec.phone]
            .filter(Boolean)
            .join(" · ");
          return `<div class="pchip" data-key="attendee-${esc(p.key)}">
          <div class="pchip-left">
            <div class="pchip-av">${esc(init)}</div>
            <div class="attendee-info">
              <div class="pchip-name">${esc(rec.dn || p.key)}</div>
              <div class="pchip-meta">${esc(p.time)}${rec.games ? " · " + rec.games + (rec.games === 1 ? " game" : " games") : ""}${rec.currentStreak >= 2 ? ' · <span style="color:var(--gold-d);font-weight:600">🔥 ' + rec.currentStreak + "-game streak</span>" : ""}</div>
              ${contactLine ? `<div class="attendee-contact">${esc(contactLine)}</div>` : ""}
            </div>
          </div>
          <button aria-label="Remove ${esc(rec.dn || p.key)} from tonight" class="pchip-rm" data-click="adminRemovePlayer" data-arg0="${esc(p.key)}">✕</button>
        </div>`;
        })
        .join("")}
    </div>`
    : "";

  return tonightList;
}

export function finishSection(state, tonight, players, activeGame) {
  // finish positions
  const finishSection =
    state === "running" && tonight.length
      ? `
    <div class="asec" id="finishSection">
      <div class="asec-title">Assign Finish Positions</div>
      <p class="finish-intro">Assign places 1–8, then submit to award points. Unassigned players receive 1 participation point.</p>
      <details class="finish-help">
        <summary>Game streak &amp; chip awards</summary>
        <p> Monday, Wednesday, and Thursday games all count. Missing any scheduled game resets the streak. At 5 consecutive games, award the streak chips manually; the next attended scheduled game starts a new 1/5 cycle.</p>
      </details>
      ${tonight
        .map((p) => {
          const rec = players[p.key] || {};
          const sn = playerFieldId(p.key);
          const previewDate =
            activeGame?.date ||
            new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          const streakPreview = previewNextStreak(rec, previewDate);
          const streakBadge =
            streakPreview.count >= 2
              ? `<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:3px;background:#fef9e7;color:var(--gold-d);margin-left:6px">🔥 ${streakPreview.count}/5${streakPreview.completed ? " — AWARD CHIPS" : ""}</span>`
              : `<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:3px;background:#f7f5f0;color:var(--muted);margin-left:6px">${streakPreview.count}/5</span>`;
          return `<div class="finish-row" data-key="finish-${esc(p.key)}">
          <div class="fpos" id="fpos_${sn}">—</div>
          <div class="finish-player"><label for="fsel_${sn}">${esc(rec.dn || p.key)}</label><span class="finish-streak">Streak ${streakBadge}</span></div>
          <select aria-label="Finish position for ${esc(rec.dn || p.key)}" class="fsel" id="fsel_${sn}" data-player-key="${esc(p.key)}" data-change="syncFpos" data-arg0="${esc(sn)}">
            <option value="">— Not placed —</option>
            <option value="1">1st — 25 pts</option>
            <option value="2">2nd — 18 pts</option>
            <option value="3">3rd — 15 pts</option>
            <option value="4">4th — 12 pts</option>
            <option value="5">5th — 10 pts</option>
            <option value="6">6th — 8 pts</option>
            <option value="7">7th — 6 pts</option>
            <option value="8">8th — 4 pts</option>
            <option value="p">Participation — 1 pt</option>
          </select>
          <div class="fpts" id="fptsv_${sn}">— pts</div>
        </div>`;
        })
        .join("")}
      <div class="finish-actions">
        <button class="btn btn-green" data-click="submitResults">Submit &amp; Award Points</button>
        <button class="btn btn-ghost" data-click="adminStopWithoutResults">Stop Without Results…</button>
      </div>
    </div>`
      : "";

  return finishSection;
}

export function historyRows(history) {
  const histRows =
    history
      .map((h, idx) => ({ h, idx }))
      .sort((a, b) => newestGameFirst(a.h, b.h))
      .map(({ h, idx }) => {
        const winner = h.results.find((r) => r.pos === 1)?.name || "—";
        const isStopped = !!h.stopped;
        const badge = isStopped
          ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:#fef3c7;color:#92400e">STOPPED</span>`
          : `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:var(--red-soft);color:var(--red)">COMPLETE</span>`;
        const posLabel = (pos) => (typeof pos === "number" ? "#" + pos : "P");
        const detail = `<div id="gh_${idx}" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-size:11px">Player</th>
          <th style="padding:5px 8px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-size:11px">Finish</th>
          <th style="padding:5px 8px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-size:11px">Pts</th>
        </tr></thead>
        <tbody>${h.results
          .slice()
          .sort((a, b) => {
            if (typeof a.pos === "number" && typeof b.pos === "number")
              return a.pos - b.pos;
            if (typeof a.pos === "number") return -1;
            return 1;
          })
          .map(
            (
              r,
              ri,
            ) => `<tr style="border-bottom:1px solid var(--border);background:${ri % 2 === 0 ? "var(--bg)" : "var(--bg2)"}">
          <td style="padding:6px 8px;font-weight:${typeof r.pos === "number" && r.pos <= 3 ? "600" : "400"}">${esc(r.name)}</td>
          <td style="padding:6px 8px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;color:${typeof r.pos === "number" && r.pos === 1 ? "var(--gold)" : "var(--muted)"}">${posLabel(r.pos)}</td>
          <td style="padding:6px 8px;text-align:center"><span style="background:var(--green);color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;padding:1px 7px;border-radius:3px">${r.pts}</span></td>
        </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`;
        return `<div style="border:1px solid var(--border);border-radius:7px;margin-bottom:8px;overflow:hidden">
      <button type="button" aria-expanded="false" aria-controls="gh_${idx}" style="width:100%;border:0;text-align:left;color:inherit;font:inherit;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:var(--bg2)" data-click="toggleGameHist" data-arg0="gh_${idx}">
        <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${badge}
          <span style="font-weight:600;font-size:13px">${esc(h.gameName || formatLeagueDate(h.date))}</span>${h.gameName ? `<span style="font-size:12px;color:var(--muted)">${esc(formatLeagueDate(h.date))}</span>` : ""}
          <span style="font-size:12px;color:var(--muted)">${h.results.length} players${!isStopped ? " · 🏆 " + esc(winner) : ""}</span>
        </span>
        <span style="font-size:11px;color:var(--muted);font-weight:600;letter-spacing:1px" class="gh-toggle-lbl">▼ Details</span>
      </button>
      <div style="padding:0 14px 0">${detail}</div>
      ${h._id && h.results.length ? `<div style="padding:10px 14px"><button class="btn btn-ghost" data-click="adminEditResults" data-arg0="${esc(h._id)}">Edit results</button></div>` : ""}
    </div>`;
      })
      .join("") ||
    '<div style="font-size:13px;color:var(--muted);padding:7px 0">No games yet.</div>';

  return histRows;
}
