import { atlantaDateKey } from "./league-date.js";
import { bindDrafts, clearPrivateDrafts, clearGameDrafts } from "./drafts.js";
import { getActiveGame } from "./state.js";
import { registerViews, renderPlayerTable } from "./refresh.js";
import { getActiveGameId } from "./state.js";
import { syncTimer, timerJumpTo } from "./timer-controller.js";
import { LS } from "./store.js";
import { toast, closeEditPlayer } from "./dom.js";
import { isAdmin, subscribeAuth } from "./auth.js";

import { closeAdmin, openAdmin } from "./views/admin.js";
import { go, sR } from "./navigation.js";
import { setRankSeriesFilter } from "./views/rankings.js";
import {
  pubSearch,
  pubKeydown,
  pubSubmitNewPlayer,
  pubCancelNewPlayer,
  pubRemove,
  pubCheckIn,
  pubCreateAndCheckIn,
} from "./views/games.js";
import {
  adminLaunchGame,
  adminDeleteSeries,
  adminActivateGame,
  adminDeleteGame,
  adminAddSeries,
  adminSwitchGame,
} from "./views/series.js";
import { cancelConfirm, toggleGameHist } from "./views/admin/dialogs.js";
import {
  exportPlayerCSV,
  clearAllPlayers,
  resetAll,
  openEditPlayer,
  saveEditPlayer,
  deletePlayerProfile,
} from "./views/admin/players.js";
import { logout, tryLogin, resetPassword } from "./views/login.js";
import {
  adminCheckIn,
  adminCreateAndCheckIn,
  adminSearch,
  adminKeydown,
  adminSubmitNewPlayer,
  adminCancelNewPlayer,
  adminRemovePlayer,
  adminClearTonight,
} from "./views/admin/checkin.js";
import {
  adminSetState,
  adminStopGame,
  adminTimerPause,
  adminTimerResume,
  adminTimerReset,
  syncFpos,
  submitResults,
} from "./views/admin/game.js";
import { adminSetLevelDur, adminResetLevelDurs } from "./views/admin/timer.js";
import { bindActions } from "./events.js";
import { initializeFirebase } from "./firebase.js";
import { renderAdmin as drawAdmin } from "./views/admin.js";
import { renderGamePage as drawGames } from "./views/games.js";
import {
  renderRankings as drawRankings,
  updateStats as drawStats,
} from "./views/rankings.js";
import { updateHomeSched as drawSchedule } from "./views/home.js";
import {
  renderTimerUI as drawTimer,
  renderTVTimer as drawTV,
} from "./views/timer.js";
import { renderPlayerTable as drawPlayers } from "./views/admin/players.js";

registerViews({
  renderAdmin: drawAdmin,
  renderGamePage: drawGames,
  renderRankings: drawRankings,
  updateStats: drawStats,
  updateHomeSched: drawSchedule,
  renderTimerUI: drawTimer,
  renderTVTimer: drawTV,
  renderPlayerTable: drawPlayers,
});

export function renderAll() {
  drawGames();
  drawRankings();
  drawStats();
  drawSchedule();
  syncTimer();
}
const pendingKeys = new Set();
let refreshPending = false;
export function scheduleRefresh(keys) {
  for (const key of keys) pendingKeys.add(key);
  if (refreshPending) return;
  refreshPending = true;
  queueMicrotask(() => {
    refreshPending = false;
    const changed = new Set(pendingKeys);
    pendingKeys.clear();
    const has = (...keys) => keys.some((key) => changed.has(key));
    if (has("activeGameId")) {
      clearPrivateDrafts();
      document.getElementById("editPlayerOverlay")?.remove();
    }
    if (has("players", "history", "gameList", "seriesList", "activeGameId", "attendance"))
      drawGames();
    if (has("players", "history", "seriesList")) drawRankings();
    if (has("players", "history", "attendance")) drawStats();
    if (has("seriesList")) drawSchedule();
    if (has("timerState", "levelOverrides", "activeGameId")) syncTimer();
    if (
      isAdmin() &&
      document.getElementById("adminOverlay").classList.contains("open") &&
      has(
        "players",
        "history",
        "gameList",
        "seriesList",
        "activeGameId",
        "attendance",
        "levelOverrides",
      )
    )
      drawAdmin();
    if (getActiveGame()?.status === "completed")
      clearGameDrafts(getActiveGameId());
  });
}
LS.subscribe((event) => scheduleRefresh(event.keys || []));
subscribeAuth(() => {
  if (!isAdmin()) {
    clearPrivateDrafts();
    document.getElementById("editPlayerOverlay")?.remove();
  }
  document.getElementById("adminNavBtn").classList.toggle("authed", isAdmin());
  if (document.getElementById("adminOverlay").classList.contains("open"))
    drawAdmin();
});
export async function jumpLevel(index) {
  await timerJumpTo(index);
}
bindDrafts();
export const actions = {
  closeAdmin: (element, event) => closeAdmin(),
  go: (element, event) => go(element.dataset.arg0),
  openAdmin: (element, event) => openAdmin(),
  sR: (element, event) => sR(element, element.dataset.arg1),
  setRankSeriesFilter: (element, event) =>
    setRankSeriesFilter(element.dataset.arg0),
  pubSearch: (element, event) => pubSearch(element.value),
  pubKeydown: (element, event) => pubKeydown(event),
  pubSubmitNewPlayer: (element, event) => pubSubmitNewPlayer(),
  pubCancelNewPlayer: (element, event) => pubCancelNewPlayer(),
  pubRemove: (element, event) => pubRemove(element.dataset.arg0),
  pubCheckIn: (element, event) => pubCheckIn(element.dataset.arg0),
  pubCreateAndCheckIn: (element, event) =>
    pubCreateAndCheckIn(element.dataset.arg0),
  adminLaunchGame: (element, event) => adminLaunchGame(element.dataset.arg0),
  adminDeleteSeries: (element, event) =>
    adminDeleteSeries(element.dataset.arg0),
  adminActivateGame: (element, event) =>
    adminActivateGame(element.dataset.arg0),
  adminDeleteGame: (element, event) => adminDeleteGame(element.dataset.arg0),
  adminAddSeries: (element, event) => adminAddSeries(),
  cancelConfirm: (element, event) => cancelConfirm(),
  adminSwitchGame: (element, event) => adminSwitchGame(element.value),
  renderPlayerTable: (element, event) => renderPlayerTable(),
  exportPlayerCSV: (element, event) => exportPlayerCSV(),
  clearAllPlayers: (element, event) => clearAllPlayers(),
  resetAll: (element, event) => resetAll(),
  logout: (element, event) => logout(),
  adminCheckIn: (element, event) => adminCheckIn(element.dataset.arg0),
  adminCreateAndCheckIn: (element, event) =>
    adminCreateAndCheckIn(element.dataset.arg0),
  adminSetState: (element, event) => adminSetState(element.dataset.arg0),
  adminStopGame: (element, event) => adminStopGame(),
  adminTimerPause: (element, event) => adminTimerPause(),
  adminTimerResume: (element, event) => adminTimerResume(),
  adminTimerReset: (element, event) => adminTimerReset(),
  jumpLevel: (element, event) => jumpLevel(Number(element.dataset.arg0)),
  adminSetLevelDur: (element, event) =>
    adminSetLevelDur(Number(element.dataset.arg0), element.value),
  adminResetLevelDurs: (element, event) => adminResetLevelDurs(),
  adminSearch: (element, event) => adminSearch(element.value),
  adminKeydown: (element, event) => adminKeydown(event),
  adminSubmitNewPlayer: (element, event) => adminSubmitNewPlayer(),
  adminCancelNewPlayer: (element, event) => adminCancelNewPlayer(),
  adminRemovePlayer: (element, event) =>
    adminRemovePlayer(element.dataset.arg0),
  adminClearTonight: (element, event) => adminClearTonight(),
  syncFpos: (element, event) => syncFpos(element.dataset.arg0),
  submitResults: (element, event) => submitResults(),
  toggleGameHist: (element, event) =>
    toggleGameHist(element.dataset.arg0, element),
  openEditPlayer: (element, event) => openEditPlayer(element.dataset.arg0),
  saveEditPlayer: (element, event) => saveEditPlayer(element.dataset.arg0),
  closeEditPlayer: (element, event) => closeEditPlayer(),
  deletePlayerProfile: (element, event) =>
    deletePlayerProfile(element.dataset.arg0),
  tryLogin: () => tryLogin(),
  resetPassword: () => resetPassword(),
};
export const adminActions = new Set([
  "jumpLevel",
  "submitResults",
  "resetAll",
  "clearAllPlayers",
  "saveEditPlayer",
  "deletePlayerProfile",
  "exportPlayerCSV",
  "openEditPlayer",
  "resetPassword",
]);
for (const [name, handler] of Object.entries(actions)) {
  if (name.startsWith("admin") || adminActions.has(name))
    actions[name] = (element, event) => {
      if (!isAdmin()) throw new Error("Administrator sign-in required.");
      return handler(element, event);
    };
}
bindActions(actions);

renderAll();
initializeFirebase((error) =>
  toast("Live updates are unavailable. " + error.message),
)
  .then(() => {
    renderAll();
  })
  .catch((error) => toast("Unable to connect. " + error.message));

let statsDay = atlantaDateKey();
setInterval(() => {
  const day = atlantaDateKey();
  if (day !== statsDay) {
    statsDay = day;
    scheduleRefresh(["history"]);
  }
}, 30000);
