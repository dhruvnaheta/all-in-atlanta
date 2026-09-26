import { standings } from "../standings.js";
import { esc } from "../dom.js";
import {
  getPlayers,
  getSeriesList,
  _getTonight,
  getLeagueStats,
} from "../state.js";
export function rankTable(rows, empty, showStreak = true) {
  if (!rows.length)
    return `<div class="empty-box"><div style="font-size:26px;opacity:.3;margin-bottom:10px">♠</div><div style="font-weight:500">${empty}</div></div>`;
  return `<table class="rt"><thead><tr><th style="width:44px">#</th><th>Player</th><th>Games</th>${showStreak ? "<th>Streak</th>" : ""}<th>Points</th></tr></thead>
  <tbody>${rows.map((r) => `<tr><td><div class="rn${r.rank <= 3 ? " g" : ""}">${r.rank}</div></td><td><div class="pnm">${esc(r.dn)}</div></td><td>${r.games}</td>${showStreak ? `<td>${r.streak > 0 ? "🔥 " + r.streak + "/5" : "—"}</td>` : ""}<td><span class="pts-pill">${r.pts}</span></td></tr>`).join("")}</tbody></table>`;
}
let _rankSeriesFilter = "combined"; // 'combined' | seriesId

export function getRows(field) {
  return standings(
    getPlayers(),
    field,
    _rankSeriesFilter === "combined" ? undefined : _rankSeriesFilter,
  );
}

export function renderSeriesFilter() {
  const wrap = document.getElementById("seriesFilterWrap");
  if (!wrap) return;
  const series = getSeriesList();
  if (series.length <= 1) {
    wrap.innerHTML = "";
    return;
  } // no need to filter with only 1 series
  const pill = (id, label) =>
    `<button data-click="setRankSeriesFilter" data-arg0="${esc(id)}" style="padding:6px 14px;border-radius:20px;border:1.5px solid ${_rankSeriesFilter === id ? "var(--red)" : "var(--border)"};background:${_rankSeriesFilter === id ? "var(--red)" : "transparent"};color:${_rankSeriesFilter === id ? "#fff" : "var(--muted)"};font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap">${esc(label)}</button>`;
  wrap.innerHTML = `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px">
    ${pill("combined", "Combined")}
    ${series.map((s) => pill(s.id, s.name)).join("")}
  </div>`;
}

export function setRankSeriesFilter(id) {
  _rankSeriesFilter = id;
  renderSeriesFilter();
  renderRankings();
}

export function renderRankings() {
  const s = (id, h) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = h;
  };
  renderSeriesFilter();
  const m = getRows("month"),
    a = getRows("total");
  s("monthly-rankings", rankTable(m, "No results yet"));
  s("alltime-rankings", rankTable(a, "No results yet"));
  // Home page always shows combined monthly top 5, regardless of rankings page filter
  const savedFilter = _rankSeriesFilter;
  _rankSeriesFilter = "combined";
  const homeRows = getRows("month").slice(0, 5);
  _rankSeriesFilter = savedFilter;
  s(
    "home-rankings",
    rankTable(homeRows, "Play a game to get on the board", false),
  );
}
export function updateStats() {
  const p = getPlayers(),
    t = _getTonight(),
    stats = getLeagueStats();
  const s = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  s("s-players", Object.keys(p).length);
  s("s-games", stats.totals.games);
  s("s-tonight", t.length);
}
