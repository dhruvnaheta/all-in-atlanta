import { playerNameKey } from "./player-search.js";
import { validateContact } from "./contact.js";
let gateway;
export function configureCheckIn(adapter) {
  gateway = adapter;
}
export function findCheckInMatches(players, tonight, query) {
  const checked = new Set(tonight.map((p) => p.key));
  const text = playerNameKey(query);
  return Object.values(players)
    .filter((p) => playerNameKey(p.dn).includes(text) && !checked.has(p.key))
    .slice(0, 8);
}
export async function checkInPlayer(key, profile) {
  if (!gateway)
    throw new Error(
      "Check-in is unavailable. Please check your connection and try again.",
    );
  if (profile) validateContact(profile);
  return gateway({ action: "checkIn", key, ...(profile ? { profile } : {}) });
}
export async function removeCheckIn(key) {
  if (!gateway) throw new Error("Check-in is unavailable. Please try again.");
  return gateway({ action: "remove", key });
}
