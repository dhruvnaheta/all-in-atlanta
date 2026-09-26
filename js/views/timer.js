import { getTimerState, getActiveGame } from "../state.js";
import { BLIND_LEVELS, levelDur } from "../blinds.js";
import {
  timerGetRemaining,
  timerGetProgress,
  fmtTime,
} from "../timer-controller.js";
import { esc } from "../dom.js";
export function renderTimerUI() {
  // Update all .blind-clock elements on page
  document.querySelectorAll(".blind-clock").forEach((el) => {
    const isAdmin = el.dataset.admin === "1";
    _renderClockEl(el, isAdmin);
  });
  // Update TV timer if visible
  renderTVTimer();
  // Update admin timer controls if open
  const tcInfo = document.getElementById("tc-blind");
  const tcTime = document.getElementById("tc-time");
  const tcProg = document.getElementById("tc-prog");
  if (tcInfo) _updateAdminTimerCtrl(tcInfo, tcTime, tcProg);
  const state = getTimerState();
  const button = document.querySelector(
    '[data-click="adminTimerPause"], [data-click="adminTimerResume"]',
  );
  if (button) {
    button.dataset.click = state.running
      ? "adminTimerPause"
      : "adminTimerResume";
    button.textContent = state.running ? "⏸ Pause" : "▶ Resume Timer";
  }
  const sub = document.querySelector(".timer-ctrl-sub");
  if (sub)
    sub.textContent =
      "Level " +
      (state.levelIdx + 1) +
      " of " +
      BLIND_LEVELS.length +
      (state.running ? "" : " · PAUSED");
  // Update level jumper active state
  document.querySelectorAll(".ljbtn").forEach((btn) => {
    const idx = parseInt(btn.dataset.idx);
    btn.classList.toggle("active", idx === getTimerState().levelIdx);
  });
}

export function _renderClockEl(el, isAdmin) {
  const ts = getTimerState();
  const level =
    BLIND_LEVELS[ts.levelIdx] || BLIND_LEVELS[BLIND_LEVELS.length - 1];
  const remaining = timerGetRemaining();
  const progress = timerGetProgress();
  const dur = levelDur(ts.levelIdx);
  const isBreak = !!level.isBreak;
  const isPaused = !ts.running;
  const warningMs = Math.min(dur * 0.25, 60000); // last 25% or 60s
  const urgentMs = Math.min(dur * 0.1, 30000); // last 10% or 30s
  const isWarn = remaining < warningMs && !isBreak;
  const isUrg = remaining < urgentMs && !isBreak;

  el.className =
    "blind-clock" +
    (isBreak ? " is-break" : "") +
    (isPaused ? " is-paused" : "");

  // next level label
  const nextIdx = ts.levelIdx + 1;
  const nextLevel = BLIND_LEVELS[nextIdx];
  const nextLabel = nextLevel
    ? nextLevel.isBreak
      ? "Break"
      : nextLevel.label
    : "—";

  // progress color class
  const progClass = isBreak
    ? "is-break-fill"
    : isUrg
      ? "urgent"
      : isWarn
        ? "warning"
        : "";
  const timerClass = isUrg
    ? "bc-timer urgent"
    : isWarn
      ? "bc-timer warning"
      : "bc-timer";

  el.innerHTML = `
    <div class="bc-main">
      <div class="bc-blinds-wrap">
        <div class="bc-level-label">Level ${ts.levelIdx + 1} ${isPaused ? "· PAUSED" : ""}</div>
        <div class="bc-blinds${isBreak ? " is-break-text" : ""}">${isBreak ? "☕ Break" : level.label}</div>
      </div>
      <div class="bc-timer-wrap">
        <div class="${timerClass}">${fmtTime(remaining)}</div>
        <div class="bc-timer-label">${isBreak ? "break time" : "time left"}</div>
      </div>
      <div class="bc-next-wrap">
        <div class="bc-next-label">Up next</div>
        <div class="bc-next">${nextLabel}</div>
      </div>
    </div>
    <div class="bc-progress-track">
      <div class="bc-progress-fill ${progClass}" style="width:${(progress * 100).toFixed(1)}%"></div>
    </div>
    <div class="bc-levels">${BLIND_LEVELS.map((l, i) => {
      const isCur = i === ts.levelIdx;
      const isDone = i < ts.levelIdx;
      const cls =
        "bc-level-chip" +
        (isCur ? " active" : "") +
        (isDone ? " done" : "") +
        (l.isBreak ? " is-break-chip" : "");
      return `<div class="${cls}">${l.isBreak ? "☕" : l.label}</div>`;
    }).join("")}</div>
  `;
}

export function renderTVTimer() {
  const el = document.getElementById("tvTimerContent");
  if (!el) return;
  const activeGame = getActiveGame();
  const exit =
    '<div class="tv-toolbar"><a class="tv-exit" href="/games/" data-click="go" data-arg0="games">Exit timer</a></div>';
  if (activeGame?.status !== "running") {
    el.innerHTML = `${exit}<h1 class="tv-heading">No live game</h1><p class="tv-empty">The public timer will appear here when a game starts.</p>`;
    return;
  }
  const ts = getTimerState();
  const level =
    BLIND_LEVELS[ts.levelIdx] || BLIND_LEVELS[BLIND_LEVELS.length - 1];
  const remaining = timerGetRemaining();
  const progress = timerGetProgress();
  const isBreak = !!level.isBreak;
  const isPaused = !ts.running;
  const dur = levelDur(ts.levelIdx);
  const urgentMs = Math.min(dur * 0.1, 30000);
  const warnMs = Math.min(dur * 0.25, 60000);
  const isUrg = remaining < urgentMs && !isBreak;
  const isWarn = remaining < warnMs && !isBreak;
  const timeColor = isUrg
    ? "#e74c3c"
    : isWarn
      ? "#f39c12"
      : isBreak
        ? "#27ae60"
        : "#ffffff";
  const nextIdx = ts.levelIdx + 1;
  const nextLevel = BLIND_LEVELS[nextIdx];
  const nextLabel = nextLevel
    ? nextLevel.isBreak
      ? "Break"
      : nextLevel.label
    : "Final Level";
  const gameLabel = activeGame ? activeGame.name : "All In Atlanta";
  el.innerHTML = `
    ${exit}
    <div class="tv-heading" style="color:rgba(255,255,255,.4);font-family:'Barlow Condensed',sans-serif;font-size:clamp(14px,2vw,20px);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px">
      ${esc(gameLabel)} &nbsp;·&nbsp; LEVEL ${ts.levelIdx + 1}${isPaused ? " &nbsp;·&nbsp; PAUSED" : ""}
    </div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:clamp(60px,14vw,160px);color:${timeColor};line-height:1;letter-spacing:-2px;transition:color .3s">
      ${fmtTime(remaining)}
    </div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:clamp(36px,8vw,90px);font-weight:700;color:${isBreak ? "#27ae60" : "#c89e3a"};margin:12px 0 8px;letter-spacing:1px">
      ${isBreak ? "BREAK" : level.label}
    </div>
    <div style="width:90%;max-width:700px;height:10px;background:rgba(255,255,255,.1);border-radius:5px;margin:24px auto;overflow:hidden">
      <div style="height:100%;width:${(progress * 100).toFixed(1)}%;background:${isUrg ? "#e74c3c" : isWarn ? "#f39c12" : isBreak ? "#27ae60" : "#c89e3a"};border-radius:5px;transition:width .5s linear"></div>
    </div>
    <div style="color:rgba(255,255,255,.45);font-family:'Barlow Condensed',sans-serif;font-size:clamp(16px,3vw,28px);letter-spacing:2px;margin-top:8px">
      UP NEXT &nbsp; <span style="color:rgba(255,255,255,.75);font-weight:600">${nextLabel}</span>
    </div>
  `;
}

export function _updateAdminTimerCtrl(infoEl, timeEl, progEl) {
  const ts = getTimerState();
  const level =
    BLIND_LEVELS[ts.levelIdx] || BLIND_LEVELS[BLIND_LEVELS.length - 1];
  const remaining = timerGetRemaining();
  const progress = timerGetProgress();
  const dur = levelDur(ts.levelIdx);
  const isBreak = !!level.isBreak;
  const isUrg = remaining < Math.min(dur * 0.1, 30000) && !isBreak;
  const isWarn = remaining < Math.min(dur * 0.25, 60000) && !isBreak;

  if (infoEl) {
    infoEl.textContent = isBreak ? "☕ Break" : level.label;
    infoEl.style.color = isBreak ? "#0369a1" : "var(--text)";
  }
  if (timeEl) {
    timeEl.textContent = fmtTime(remaining);
    timeEl.className =
      "timer-ctrl-time" + (isUrg ? " urg" : isWarn ? " warn" : "");
  }
  if (progEl) {
    progEl.style.width = (progress * 100).toFixed(1) + "%";
    progEl.style.background = isBreak
      ? "#7dd3fc"
      : isUrg
        ? "#f87171"
        : isWarn
          ? "#fbbf24"
          : "var(--gold)";
  }
}
