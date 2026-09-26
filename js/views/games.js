import { formatLeagueDate } from "../league-date.js";
import { cleanPlayerName, hasPlayerName } from "../player-search.js";
import {
  isCheckInOpen,
  upcomingGames,
  completedResults,
} from "../public-games.js";
import { renderMarkup } from "../render.js";
import { getActiveGameId } from "../state.js";
import { setRegistration, clearRegistration } from "../drafts.js";
import {
  _getState,
  _getTonight,
  getActiveGame,
  getSeriesList,
  getPlayers,
  getHistory,
} from "../state.js";
import { DAYS, WEEKLY_GAMES, venueLabel } from "../schedule.js";
import { esc, toast } from "../dom.js";
import { _renderClockEl } from "./timer.js";
import {
  findCheckInMatches,
  checkInPlayer,
  removeCheckIn,
} from "../checkin.js";
import { updateStats } from "../refresh.js";
export function renderGamePage() {
  const state = _getState();
  const tonight = _getTonight();
  const card = document.getElementById("gameStatusCard");
  const hdrSt = document.getElementById("games-page-status");

  // Resolve venue info from active game's series
  const activeGame = getActiveGame();
  const canCheckIn = isCheckInOpen(activeGame);
  const action = document.getElementById("homeGameAction");
  if (action)
    action.textContent = canCheckIn
      ? "Check In for Tonight"
      : "View Game Schedule";
  const upcoming = document.getElementById("upcomingGames");
  if (upcoming)
    upcoming.innerHTML =
      upcomingGames(getSeriesList().length ? getSeriesList() : WEEKLY_GAMES)
        .map(
          (series) => `
    <div class="sched-card"><div class="sched-day">${DAYS[series.day]} · ${esc(series.date)}</div>
    <div class="sched-venue">${esc(venueLabel(series.venue))}</div><div class="sched-time">${esc(series.time)}</div>
    <span class="badge badge-pts">${canCheckIn && activeGame.seriesId === series.id ? "Check-in open above" : "Scheduled · check-in not open"}</span></div>`,
        )
        .join("") || "<p>No upcoming games have been announced.</p>";
  const results =
    state === "completed" ? completedResults(activeGame, getHistory()) : null;
  const activeSeries =
    activeGame && activeGame.seriesId
      ? getSeriesList().find((s) => s.id === activeGame.seriesId)
      : null;
  const venueName = activeSeries
    ? venueLabel(activeSeries.venue)
    : "Weekly Games";
  const venueSub = activeSeries
    ? "Every " + DAYS[activeSeries.day] + " · " + activeSeries.time
    : "Monday & Thursday · Wicked Wolf · Wednesday · 5 Paces · 8:00 PM";

  if (state === "running") {
    hdrSt.innerHTML = `<span style="display:flex;align-items:center;gap:7px;font-size:13px;color:rgba(255,255,255,.7)"><span class="dot-live"></span>${canCheckIn ? "Check-in open" : "Game running · check-in closed"}</span>`;
  } else {
    hdrSt.innerHTML = "";
  }

  let inner = `
    <div class="gsc-header">
      <div><div class="gsc-venue">${esc(venueName)}</div><div class="gsc-sub">${esc(venueSub)}${activeGame?.date ? " · " + esc(formatLeagueDate(activeGame.date)) : ""}</div></div>
      <div>${stateBadge(state, canCheckIn)}</div>
    </div>
    <div class="gsc-meta">
      <div class="gsc-cell"><span class="gsc-label">Format</span><span class="gsc-val">Texas Hold'em</span></div>
      <div class="gsc-cell"><span class="gsc-label">Checked in</span><span class="gsc-val">${state === "completed" ? (results === null ? "History unavailable" : results.length + " recorded players") : tonight.length + " players"}</span></div>
    </div>`;

  // Blind clock — show when game active
  if (state === "running") {
    inner += `<div class="blind-clock" id="pubClock"></div>`;
  }

  if (!canCheckIn) {
    inner += `<div class="no-game-notice">
      <div style="font-size:34px;opacity:.3;margin-bottom:12px">♠</div>
      <div style="font-weight:600;font-size:16px;margin-bottom:6px">${state === "completed" ? "Game completed" : state === "running" ? "Check-in is closed" : "No active game right now"}</div>
      <div style="font-size:14px">${state === "running" ? "Ask the host if you need to join this game." : "See the upcoming games below. Check-in opens when the host starts the game."}</div>
    </div>`;
  } else {
    inner += `
      <div class="checkin-area">
        <div class="checkin-label">Check In for Tonight</div>
        <div class="search-wrap" id="pubSearchWrap">
          <input class="search-input" id="pubSearchInput" type="text" placeholder="Search your name…" autocomplete="off"
            data-input="pubSearch" data-keydown="pubKeydown"/>
          <div class="dropdown" id="pubDropdown" data-preserve></div>
        </div>
        <div class="np-form" id="pubNpForm">
          <div class="np-form-title">Create New Player</div>
          <div class="np-name-badge" id="pubNpName"></div>
          <div class="np-fields">
            <div class="np-field">
              <div class="np-label">Email <span class="np-optional">— optional</span></div>
              <input class="np-input" id="pubNpEmail" type="email" placeholder="you@example.com" autocomplete="email"/>
            </div>
            <div class="np-field">
              <div class="np-label">Phone <span class="np-optional">— optional</span></div>
              <input class="np-input" id="pubNpPhone" type="tel" placeholder="(404) 555-0100" autocomplete="tel"/>
            </div>
          </div>
          <div class="np-btns">
            <button class="btn btn-green" data-click="pubSubmitNewPlayer">Check In</button>
            <button class="btn-ghost" data-click="pubCancelNewPlayer">Cancel</button>
          </div>
        </div>
        <div class="checkin-msg" id="pubMsg" data-preserve></div>
      </div>`;
  }

  if (state === "completed") {
    inner += `<div class="plist"><div class="plist-hdr"><div class="plist-title">Recorded results</div></div>${results === null ? "<p>Historical attendance is unavailable for this game.</p>" : results.length ? `<table class="rt"><thead><tr><th>Player</th><th>Finish</th><th>Points</th></tr></thead><tbody>${results.map((result) => `<tr><td>${esc(result.name || getPlayers()[result.key]?.dn || result.key)}</td><td>${Number.isInteger(result.pos) ? result.pos : "Participation"}</td><td>${result.pts}</td></tr>`).join("")}</tbody></table>` : "<p>No results were recorded for this game.</p>"}</div>`;
  } else inner += buildPlistHTML(tonight, false);
  renderMarkup(card, inner, `pub:${getActiveGameId()}`);

  // render clock after DOM injection
  if (state === "running") {
    const clockEl = document.getElementById("pubClock");
    if (clockEl) _renderClockEl(clockEl, false);
  }
}

export function stateBadge(state, registrationOpen) {
  const text =
    state === "completed"
      ? "Completed"
      : state === "running"
        ? registrationOpen
          ? "Check-in Open"
          : "Check-in Closed"
        : "Scheduled";
  return `<span class="status-badge ${registrationOpen ? "open" : "idle"}">${text}</span>`;
}

export function buildPlistHTML(tonight, allowRemove) {
  const players = getPlayers();
  if (!tonight.length) {
    return `<div class="plist"><div class="plist-hdr"><div class="plist-title">Tonight's Players (0)</div></div>
      <div class="empty-box" style="padding:26px 0"><div style="font-size:24px;opacity:.3;margin-bottom:8px">♠</div><div style="font-size:13px">No players checked in yet</div></div>
    </div>`;
  }
  const rows = tonight
    .map((p) => {
      const rec = players[p.key] || {};
      const init = (rec.dn || p.key)
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const rm = allowRemove
        ? `<button class="pchip-rm" data-click="pubRemove" data-arg0="${esc(p.key)}" title="Remove">✕</button>`
        : "";
      return `<div class="pchip" data-key="attendee-${esc(p.key)}">
      <div class="pchip-left">
        <div class="pchip-av">${esc(init)}</div>
        <div>
          <div class="pchip-name">${esc(rec.dn || p.key)}</div>
          <div class="pchip-meta">Checked in ${esc(p.time)}${rec.games ? " · " + rec.games + " game" + (rec.games !== 1 ? "s" : "") : ""}${rec.total ? " · " + rec.total + " pts" : ""}${rec.currentStreak >= 2 ? ' · <span style="color:var(--gold-d);font-weight:600">🔥 ' + rec.currentStreak + "-game streak</span>" : ""}</div>
        </div>
      </div>${rm}
    </div>`;
    })
    .join("");
  return `<div class="plist"><div class="plist-hdr"><div class="plist-title">Tonight's Players (${tonight.length})</div></div>${rows}</div>`;
}

// pub search
let pubFocusIdx = -1;
export function pubSearch(q) {
  const dd = document.getElementById("pubDropdown");
  pubFocusIdx = -1;
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
      (p, i) =>
        `<div class="dd-item" data-idx="${i}" data-mousedown="pubCheckIn" data-arg0="${esc(p.key)}">
      <span>${esc(p.dn)}</span>
      <span class="dd-tag exists">${p.total} pts</span>
    </div>`,
    )
    .join("");
  if (!exact) {
    const nk = q.trim().toLowerCase();
    if (!players[nk])
      html += `<div class="dd-item new-player" data-mousedown="pubCreateAndCheckIn" data-arg0="${esc(q.trim())}">
      <span>Add "<strong>${esc(q.trim())}</strong>"</span><span class="dd-tag new">New player</span></div>`;
  }
  if (html) {
    dd.innerHTML = html;
    dd.classList.add("open");
  } else dd.classList.remove("open");
}
export function pubKeydown(e) {
  const dd = document.getElementById("pubDropdown"),
    items = dd.querySelectorAll(".dd-item");
  if (!dd.classList.contains("open") || !items.length) return;
  if (e.key === "ArrowDown") {
    pubFocusIdx = Math.min(pubFocusIdx + 1, items.length - 1);
    pubHL(items);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    pubFocusIdx = Math.max(pubFocusIdx - 1, 0);
    pubHL(items);
    e.preventDefault();
  } else if (e.key === "Enter") {
    if (pubFocusIdx >= 0 && items[pubFocusIdx])
      items[pubFocusIdx].dispatchEvent(
        new Event("mousedown", { bubbles: true }),
      );
    e.preventDefault();
  } else if (e.key === "Escape") closePubDD();
}
export function pubHL(items) {
  items.forEach((it, i) => it.classList.toggle("focused", i === pubFocusIdx));
  if (pubFocusIdx >= 0) items[pubFocusIdx].scrollIntoView({ block: "nearest" });
}
export function closePubDD(e) {
  const wrap = document.getElementById("pubSearchWrap");
  if (e && wrap && wrap.contains(e.target)) return;
  const dd = document.getElementById("pubDropdown");
  if (dd) dd.classList.remove("open");
}
document.addEventListener("click", closePubDD);

export async function pubCheckIn(key, profile) {
  try {
    await checkInPlayer(key, profile);
    clearRegistration("pub");
    const input = document.getElementById("pubSearchInput");
    if (input) {
      input.value = "";
      input.disabled = false;
    }
    document.getElementById("pubNpForm")?.classList.remove("open");
    document.getElementById("pubDropdown")?.classList.remove("open");
    renderGamePage();
    updateStats();
    toast((getPlayers()[key]?.dn || key) + " checked in!");
  } catch (error) {
    showPubMsg(error.message, "err");
  }
}
export function pubCreateAndCheckIn(name) {
  // Show the new player form instead of immediately creating
  const dn = cleanPlayerName(name);
  if (!dn || dn.length < 2) {
    showPubMsg("Please enter at least 2 characters.", "err");
    return;
  }
  const form = document.getElementById("pubNpForm");
  const nameEl = document.getElementById("pubNpName");
  if (!form || !nameEl) return;
  // close dropdown, freeze search input
  closePubDD();
  const inp = document.getElementById("pubSearchInput");
  if (inp) {
    inp.value = dn;
    inp.disabled = true;
  }
  nameEl.textContent = dn;
  document.getElementById("pubNpEmail").value = "";
  document.getElementById("pubNpPhone").value = "";
  form.classList.add("open");
  document.getElementById("pubNpEmail").focus();
  // stash pending name
  form.dataset.pendingName = dn;
  setRegistration("pub", dn);
}
export async function pubSubmitNewPlayer() {
  const form = document.getElementById("pubNpForm");
  const dn = form?.dataset.pendingName;
  if (!dn) return;
  return pubCheckIn(dn.toLowerCase(), {
    dn,
    email: document.getElementById("pubNpEmail").value.trim(),
    phone: document.getElementById("pubNpPhone").value.trim(),
  });
}
export function pubCancelNewPlayer() {
  clearRegistration("pub");
  const form = document.getElementById("pubNpForm");
  if (form) form.classList.remove("open");
  const inp = document.getElementById("pubSearchInput");
  if (inp) {
    inp.value = "";
    inp.disabled = false;
    inp.focus();
  }
}
export async function pubRemove(key) {
  try {
    await removeCheckIn(key);
    renderGamePage();
    updateStats();
  } catch (error) {
    showPubMsg(error.message, "err");
  }
}
export function showPubMsg(msg, type) {
  const el = document.getElementById("pubMsg");
  if (!el) return;
  el.textContent = msg;
  el.className = "checkin-msg " + type;
  el.style.display = "block";
  setTimeout(() => {
    if (el) el.style.display = "none";
  }, 3000);
}
