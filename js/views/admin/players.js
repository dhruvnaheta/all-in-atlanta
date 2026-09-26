import { formatLeagueDate } from "../../league-date.js";
import { getAccountState, accountCommand } from "../../account.js";
import { validateContact } from "../../contact.js";
import { runCommand } from "../../commands.js";

import { askConfirm } from "./dialogs.js";
import { getPlayers, setPlayers } from "../../state.js";
import { renderRankings, updateStats } from "../../refresh.js";
import { openModal } from "../../modal.js";
import { toast, esc, closeEditPlayer } from "../../dom.js";

export function deletePlayerProfile(key) {
  askConfirm(
    "Delete this player profile and contact information? Historical results remain recorded.",
    async () => {
      await runCommand("deletePlayer", { key });
      closeEditPlayer();
      toast("Player profile deleted.");
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
    tbody.innerHTML = `<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No players yet.</td></tr>`;
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
              `${formatLeagueDate(g.date)}: ${typeof g.pos === "number" ? "#" + g.pos : "P"} (${g.pts}pts${g.streakBonus ? "+" + g.streakBonus + "streak" : ""})`,
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
      <td style="${cellStyle};font-weight:600">${esc(p.dn)}<br><button data-click="openEditPlayer" data-arg0="${esc(p.key)}" style="background:none;border:1px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;font-family:'Barlow Condensed',sans-serif;color:var(--muted);letter-spacing:.5px">✏ EDIT</button></td>
      <td style="${cellStyle};color:var(--muted)">${esc(p.email || "—")}</td>
      <td style="${cellStyle};color:var(--muted)">${esc(p.phone || "—")}</td>
      <td style="${cellStyle};text-align:center">${esc(p.registered || "Unknown")}</td>
      <td style="${cellStyle};text-align:center;font-weight:600">${p.games}</td>
      <td style="${cellStyle};text-align:center;font-weight:600;color:${p.currentStreak >= 3 ? "var(--gold-d)" : "var(--muted)"}">${streakStr}</td>
      <td style="${cellStyle};text-align:center"><span style="background:var(--green);color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;padding:2px 8px;border-radius:4px">${p.total}</span></td>
      <td style="${cellStyle};color:var(--muted);font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(hist)}">${esc(hist)}</td>

    </tr>`;
    })
    .join("");
}

export function openEditPlayer(key) {
  const players = getPlayers();
  const p = players[key];
  if (!p) return;
  closeEditPlayer();
  const owner = getAccountState().owners.find((a) => a.playerKey === key);
  const overlay = document.createElement("div");
  overlay.id = "editPlayerOverlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px;max-width:400px;width:100%;max-height:90dvh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div id="editPlayerTitle" style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;color:var(--felt);margin-bottom:18px">Edit — ${esc(p.dn)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:1px;margin-bottom:4px">DISPLAY NAME</div>
          <input aria-label="Display name" id="ep_name" value="${esc(p.dn)}" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Barlow,sans-serif;font-size:13px;outline:none"/>
        </div>
        ${owner ? `<p>Legacy profile link: ${esc(owner.email || owner.uid)}</p>` : ""}
        ${owner ? '<button class="btn btn-ghost" id="unlinkPlayerAccount">Remove legacy link</button>' : ""}
        <label>Contact email<input id="ep_email" type="email" value="${esc(p.email || "")}" style="width:100%;padding:8px"/></label>
        <label>Phone<input id="ep_phone" type="tel" value="${esc(p.phone || "")}" style="width:100%;padding:8px"/></label>
        <div id="editPlayerError" role="alert"></div>
        <div style="font-size:12px;color:var(--muted)">Points, games, and streaks are calculated from recorded game results. To correct a past finish or awarded points, use Edit results on the played game. Monthly points roll over automatically in Atlanta time.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button data-click="saveEditPlayer" data-arg0="${esc(key)}" style="flex:1;background:var(--green);color:#fff;border:none;border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;cursor:pointer">SAVE</button>
        <button data-click="closeEditPlayer" style="flex:1;background:none;border:1.5px solid var(--border);border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;cursor:pointer;color:var(--muted)">CANCEL</button>
      </div>
      <div style="margin-top:20px">
        <label for="ep_merge">Merge this duplicate into</label>
        <select id="ep_merge" style="width:100%;padding:8px"><option value="">Choose the profile to keep…</option>${Object.values(
          players,
        )
          .filter((other) => other.key !== key)
          .sort((a, b) => a.dn.localeCompare(b.dn))
          .map(
            (other) =>
              `<option value="${esc(other.key)}">${esc(other.dn)} (${esc(other.email || other.key)})</option>`,
          )
          .join("")}</select>
        <p style="font-size:12px">Keeps the selected profile and its contact details, fills missing contacts, and transfers game records. Conflicting results or legacy profile links on both players must be resolved first.</p>
        <button class="btn btn-ghost" data-click="mergePlayerProfile" data-arg0="${esc(key)}">Merge duplicate</button>
      </div>
      <button data-click="deletePlayerProfile" data-arg0="${esc(key)}" style="width:100%;margin-top:10px;background:var(--red);color:#fff;border:none;border-radius:7px;padding:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;cursor:pointer">DELETE PROFILE</button>
    </div>`;
  overlay.setAttribute("aria-labelledby", "editPlayerTitle");
  overlay
    .querySelector("#unlinkPlayerAccount")
    ?.addEventListener("click", () => {
      askConfirm(
        `Remove the legacy profile link for ${owner.email || owner.uid} from "${p.dn}"? Stats and contact details are preserved.`,
        async () => {
          await accountCommand({
            action: "unlink",
            uid: owner.uid,
            playerKey: key,
          });
          closeEditPlayer();
          toast("Legacy profile link removed.");
        },
      );
    });
  document.body.appendChild(overlay);
  openModal(overlay, closeEditPlayer);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEditPlayer();
  });
}

export async function saveEditPlayer(key) {
  const players = getPlayers();
  const p = players[key];
  if (!p) return;
  const name = (document.getElementById("ep_name")?.value || "").trim();
  const email = document.getElementById("ep_email").value.trim();
  const phone = document.getElementById("ep_phone").value.trim();
  try {
    if (name.length < 2 || name.length > 120)
      throw new Error("Enter a valid player name.");
    validateContact({ email, phone });
  } catch (error) {
    document.getElementById("editPlayerError").textContent = error.message;
    return;
  }
  Object.assign(p, { dn: name, email, phone });
  await setPlayers(players);
  closeEditPlayer();
  renderPlayerTable();
  renderRankings();
  updateStats();
  toast("Player updated!");
}
export function mergePlayerProfile(key) {
  const targetKey = document.getElementById("ep_merge").value;
  const players = getPlayers();
  if (!players[targetKey] || targetKey === key) {
    document.getElementById("editPlayerError").textContent =
      "Choose the profile to keep.";
    return;
  }
  askConfirm(
    `Merge "${players[key].dn}" into "${players[targetKey].dn}"? The duplicate profile will be removed and its game records transferred.`,
    async () => {
      await runCommand("mergePlayers", { sourceKey: key, targetKey });
      closeEditPlayer();
      toast("Players merged.");
    },
  );
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
          `${formatLeagueDate(g.date)} #${typeof g.pos === "number" ? g.pos : "P"} ${g.pts}pts${g.streakBonus ? "+" + g.streakBonus + "streak" : ""}`,
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
