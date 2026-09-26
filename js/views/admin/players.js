import { runCommand } from "../../commands.js";

import { askConfirm } from "./dialogs.js";
import { getPlayers, setPlayers } from "../../state.js";
import { renderRankings, updateStats } from "../../refresh.js";
import { toast, esc } from "../../dom.js";

export function deletePlayerProfile(key) {
  askConfirm(
    "Delete this player profile and contact information? Historical results remain recorded.",
    async () => {
      await runCommand("deletePlayer", { key });
      document.getElementById("editPlayerOverlay")?.remove();
      toast("Player profile deleted.");
    },
  );
}
export function clearAllPlayers() {
  askConfirm(
    "Delete all player profiles and contacts? Historical results remain recorded.",
    async () => {
      await runCommand("clearPlayers");
      toast("Players cleared.");
    },
  );
}
export function resetAll() {
  askConfirm(
    "Permanently delete all league games, players, contacts, series and history?",
    async () => {
      await runCommand("wipeAll");
      toast("All league data cleared.");
    },
  );
}
export function renderPlayerTable() {
  const tbody = document.getElementById("playerDataBody");
  if (!tbody) return;
  const filter = (
    document.getElementById("playerSearchFilter")?.value || ""
  ).toLowerCase();
  const players = getPlayers();
  const rows = Object.values(players)
    .filter((p) => !filter || p.dn.toLowerCase().includes(filter))
    .sort((a, b) => b.total - a.total);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No players yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((p, ri) => {
      const bg = ri % 2 === 0 ? "var(--bg)" : "var(--bg2)";
      const hist =
        (p.gameDates || [])
          .slice(-5)
          .reverse()
          .map(
            (g) =>
              `${g.date}: ${typeof g.pos === "number" ? "#" + g.pos : "P"} (${g.pts}pts${g.streakBonus ? "+" + g.streakBonus + "streak" : ""})`,
          )
          .join(" · ") || "—";
      const cellStyle = `padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;background:${bg}`;
      const streakStr =
        p.currentStreak >= 2
          ? `🔥 ${p.currentStreak}/5`
          : p.currentStreak === 1
            ? "1/5"
            : "—";
      return `<tr>
      <td style="${cellStyle};font-weight:600">${esc(p.dn)}</td>
      <td style="${cellStyle};color:var(--muted)">${esc(p.email || "—")}</td>
      <td style="${cellStyle};color:var(--muted)">${esc(p.phone || "—")}</td>
      <td style="${cellStyle};text-align:center">${esc(p.registered || "Unknown")}</td>
      <td style="${cellStyle};text-align:center;font-weight:600">${p.games}</td>
      <td style="${cellStyle};text-align:center;font-weight:600;color:${p.currentStreak >= 3 ? "var(--gold-d)" : "var(--muted)"}">${streakStr}</td>
      <td style="${cellStyle};text-align:center"><span style="background:var(--green);color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;padding:2px 8px;border-radius:4px">${p.total}</span></td>
      <td style="${cellStyle};color:var(--muted);font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(hist)}">${esc(hist)}</td>
      <td style="${cellStyle};text-align:center"><button data-click="openEditPlayer" data-arg0="${esc(p.key)}" style="background:none;border:1px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;font-family:'Barlow Condensed',sans-serif;color:var(--muted);letter-spacing:.5px">✏ EDIT</button></td>
    </tr>`;
    })
    .join("");
}

export function openEditPlayer(key) {
  const players = getPlayers();
  const p = players[key];
  if (!p) return;
  const overlay = document.createElement("div");
  overlay.id = "editPlayerOverlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;color:var(--felt);margin-bottom:18px">Edit — ${esc(p.dn)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">DISPLAY NAME</div>
          <input id="ep_name" value="${esc(p.dn)}" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none"/>
        </div>
        <div style="font-size:12px;color:var(--muted)">Points, games, and streaks are calculated from recorded game results. Monthly points roll over automatically in Atlanta time.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button data-click="saveEditPlayer" data-arg0="${esc(key)}" style="flex:1;background:var(--green);color:#fff;border:none;border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;cursor:pointer">SAVE</button>
        <button data-click="closeEditPlayer" style="flex:1;background:none;border:1.5px solid var(--border);border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;cursor:pointer;color:var(--muted)">CANCEL</button>
      </div>
      <button data-click="deletePlayerProfile" data-arg0="${esc(key)}" style="width:100%;margin-top:10px;background:#dc2626;color:#fff;border:none;border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;cursor:pointer">DELETE PROFILE</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export async function saveEditPlayer(key) {
  const players = getPlayers();
  const p = players[key];
  if (!p) return;
  const name = (document.getElementById("ep_name")?.value || "").trim();
  if (name) p.dn = name;
  await setPlayers(players);
  document.getElementById("editPlayerOverlay")?.remove();
  renderPlayerTable();
  renderRankings();
  updateStats();
  toast("Player updated!");
}
export function exportPlayerCSV() {
  const players = getPlayers();
  const rows = Object.values(players).sort((a, b) => b.total - a.total);
  const headers = [
    "Name",
    "Email",
    "Phone",
    "Registered",
    "Games Played",
    "Current Streak",
    "Total Points",
    "Monthly Points",
    "Best Finish",
    "Game Dates & Points",
  ];
  const lines = [headers.join(",")];
  rows.forEach((p) => {
    const hist = (p.gameDates || [])
      .map(
        (g) =>
          `${g.date} #${typeof g.pos === "number" ? g.pos : "P"} ${g.pts}pts${g.streakBonus ? "+" + g.streakBonus + "streak" : ""}`,
      )
      .join("; ");
    const cols = [
      p.dn,
      p.email || "",
      p.phone || "",
      p.registered || "",
      p.games,
      p.currentStreak || 0,
      p.total,
      p.month,
      p.best ? "#" + p.best : "",
      hist,
    ];
    lines.push(cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "all-in-atlanta-players.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("CSV downloaded!");
}
