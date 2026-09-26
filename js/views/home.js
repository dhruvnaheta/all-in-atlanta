import { getSeriesList } from "../state.js";
import { DAYS } from "../schedule.js";
import { esc } from "../dom.js";
export function updateHomeSched() {
  const el = document.getElementById("schedGrid");
  if (!el) return;
  const series = getSeriesList()
    .slice()
    .sort((a, b) => {
      const order = { 1: 0, 3: 1, 4: 2 };
      return (order[a.day] ?? 10 + a.day) - (order[b.day] ?? 10 + b.day);
    });
  if (!series.length) {
    el.innerHTML = `<div class="sched-card"><div class="sched-day">Every Thursday</div><div class="sched-venue">Wicked Wolf</div><div class="sched-time">8:00 PM</div><span class="badge badge-pts">Points Game</span></div>`;
    return;
  }
  el.innerHTML = series
    .map(
      (s) => `
    <div class="sched-card">
      <div class="sched-day">Every ${DAYS[s.day]}</div>
      <div class="sched-venue">${esc(s.venue)}</div>
      <div class="sched-time">${esc(s.time)}</div>
      <span class="badge badge-pts">Points Game</span>
    </div>`,
    )
    .join("");
}
