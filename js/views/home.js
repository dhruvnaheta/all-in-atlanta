import { getSeriesList } from "../state.js";
import { DAYS, WEEKLY_GAMES, venueLabel } from "../schedule.js";
import { esc } from "../dom.js";
export function updateHomeSched() {
  const el = document.getElementById("schedGrid");
  if (!el) return;
  const configured = getSeriesList();
  const series = (configured.length ? configured : WEEKLY_GAMES)
    .slice()
    .sort((a, b) => {
      const order = { 1: 0, 3: 1, 4: 2 };
      return (order[a.day] ?? 10 + a.day) - (order[b.day] ?? 10 + b.day);
    });
  document.getElementById("s-weekly").textContent = series.length;
  el.innerHTML = series
    .map(
      (s) => `
    <div class="sched-card">
      <div class="sched-day">Every ${DAYS[s.day]}</div>
      <div class="sched-venue">${esc(venueLabel(s.venue))}</div>
      <div class="sched-time">${esc(s.time)}</div>
      <span class="badge badge-pts">Points Game</span>
    </div>`,
    )
    .join("");
}
