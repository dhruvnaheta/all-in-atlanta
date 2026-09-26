import { LS } from "./store.js";
import { MIN, BLIND_LEVELS } from './blind-structure.js';
export { MIN, BLIND_LEVELS } from './blind-structure.js';
// levelDur: use per-level override from admin settings, then fall back to level default
export function getLevelOverrides() {
  return LS.get("levelOverrides", {});
}
export function levelDur(idx) {
  const overrides = getLevelOverrides();
  if (overrides[idx] !== undefined) return overrides[idx] * MIN;
  return BLIND_LEVELS[idx]?.dur ?? 5 * MIN;
}
export function levelDurMins(idx) {
  return Math.round(levelDur(idx) / MIN);
}
export function fmtChips(n) {
  return n >= 1000 ? n / 1000 + "k" : String(n);
}
