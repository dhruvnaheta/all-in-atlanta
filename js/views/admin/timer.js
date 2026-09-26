import { timerCommand } from "../../timer-controller.js";
import { toast } from "../../dom.js";
export async function adminSetLevelDur(index, value) {
  await timerCommand("duration", { index, minutes: Number(value) });
  toast("Level duration saved.");
}
export async function adminResetLevelDurs() {
  await timerCommand("resetDurations");
  toast("Level durations reset to defaults.");
}
