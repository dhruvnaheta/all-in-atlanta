import { cleanPlayerName, hasPlayerName } from "./player-search.js";
import { validateContact } from "./contact.js";
import { isCheckInOpen } from "./public-games.js";
import { normalizeGame } from "./game-model.js";
// Shared with the callable function. No caller may supply points, game state, or totals.
export function applyCheckIn(
  snapshot,
  request,
  now = new Date(),
  { admin = false } = {},
) {
  const { action, key, profile } = request || {};
  if (
    !["checkIn", "remove"].includes(action) ||
    typeof key !== "string" ||
    !key.trim() ||
    key.length > 120 ||
    ["__proto__", "constructor", "prototype"].includes(key)
  )
    throw new Error("Invalid player.");
  const next = structuredClone(snapshot);
  const game = next.gameList.find((g) => g.id === next.activeGameId);
  const current = normalizeGame(game);
  if (action === "remove" && !admin)
    throw new Error("Administrator sign-in required.");
  if (
    current?.status !== "running" ||
    (action !== "remove" && !isCheckInOpen(current, now) && !admin)
  )
    throw new Error("Check-in is not open.");
  const tonight = game?.tonight ?? next.tonight;
  if (action === "remove") {
    next.tonight = tonight.filter((p) => p.key !== key);
  } else {
    if (tonight.some((p) => p.key === key))
      throw new Error("Already checked in tonight.");
    if (!Object.hasOwn(next.players, key)) {
      const dn =
        typeof profile?.dn === "string" ? cleanPlayerName(profile.dn) : null;
      if (
        typeof dn !== "string" ||
        dn.length < 2 ||
        dn.length > 120 ||
        dn.toLowerCase() !== key
      )
        throw new Error("Please enter a valid player name.");
      if (hasPlayerName(next.players, dn))
        throw new Error(
          "That player already exists. Select the existing profile.",
        );
      const contact = validateContact(profile);
      next.players[key] = {
        key,
        dn,
        ...contact,
        total: 0,
        month: 0,
        games: 0,
        best: null,
        registered: now.toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        gameDates: [],
      };
    }
    next.tonight = [
      ...tonight,
      {
        key,
        time: now.toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ];
  }
  if (game) game.tonight = next.tonight;
  return {
    players: next.players,
    tonight: next.tonight,
    gameList: next.gameList,
  };
}
