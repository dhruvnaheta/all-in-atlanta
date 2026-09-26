import { atlantaDateKey } from "/js/league-date.js";
import { configureAccount, updateAccount, clearAccount } from "/js/account.js";
import { currentUser } from "/js/auth.js";
// The browser suite swaps only the remote gateway; domain calculations are shared.
import { LS } from "/js/store.js";
import { DEFAULT_STATE } from "/js/sync.js";
import { configureAuth, setSession, isAdmin } from "/js/auth.js";
import { configureCheckIn } from "/js/checkin.js";
import { applyCheckIn } from "/js/checkin-model.js";
import { configureResults } from "/js/results.js";
import { scoreGame } from "/js/scoring.js";
import { configureCommands } from "/js/commands.js";
import { transitionGame } from "/js/game-model.js";
import { getTimerState } from "/js/state.js";
import { startTimer, pauseTimer, jumpTimer, resetTimer } from "/js/timer.js";
import { levelDur } from "/js/blinds.js";
export async function initializeFirebase() {
  LS.applySnapshot({
    ...DEFAULT_STATE,
    history:[{gameId:'previous',date:atlantaDateKey(),seriesId:'s_wickedwolf',results:[{key:'alice',pos:1,pts:25}]}],
    players: {
      alice: {
        key: "alice",
        dn: "Alice",
        total: 25,
        month: 25,
        games: 1,
        gameDates: [],
        email: "alice@example.test",
      },
    },
    seriesList: [
      {
        id: "s_wickedwolf",
        name: "Wicked Wolf League",
        venue: "Wicked Wolf",
        day: 4,
        time: "8:00 PM",
      },
    ],
    gameList: [
      {
        id: "g_test",
        seriesId: "s_wickedwolf",
        name: "Thursday Test",
        date: "Sep 24, 2026",
        status: "running",
        registrationOpen: true,
      },
    ],
    activeGameId: "g_test",
  });
  LS.connect({
    canWrite: isAdmin,
    write: async (key, value) => LS.applyRemote(key, value),
  });
  configureAuth({
    signIn: async (email, password) => {
      if (password !== "test-only") throw new Error("Invalid credentials.");
      const admin = email === "admin@example.test";
      setSession(
        { uid: admin ? "admin" : "player", email, emailVerified: true },
        admin,
      );
      updateAccount({
        loaded: true,
        account: admin ? null : { playerKey: "alice", status: "linked" },
        profile: admin ? null : { dn: "Alice", email, phone: "" },
      });
    },
    signOut: async () => {
      setSession(null, false);
      clearAccount();
    },
    signUp: async (email) => {
      setSession({ uid: "new", email, emailVerified: false }, false);
      updateAccount({ loaded: true });
    },
    verifyEmail: async () => {},
    refreshUser: async () => {
      setSession({ ...currentUser(), emailVerified: true }, false);
    },
    resetPassword: async () => {},
  });
  configureAccount(async (request) => {
    if (!currentUser()) throw new Error("Sign in first.");
    if (request.action === "requestLink") {
      updateAccount({
        account: {
          status: "pending",
          requestedName: request.newName || "Alice",
        },
      });
    } else if (request.action === "checkIn") {
      const checked = LS.get("attendance", []);
      if (checked.some((p) => p.key === "alice"))
        throw new Error("Already checked in.");
      LS.applyRemote("attendance", [
        ...checked,
        { key: "alice", time: "8:00 PM" },
      ]);
    } else if (request.action === "saveProfile") {
      const players = LS.get("players");
      players.alice.dn = request.dn;
      LS.applyRemote("players", players);
    }
    return { saved: true };
  });
  configureCommands(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    if (LS.get("simulateFailure", false)) throw new Error("Test save failed.");
    const gameList = LS.get("gameList"),
      game = gameList.find((g) => g.id === LS.get("activeGameId"));
    if (
      ["start", "openRegistration", "closeRegistration"].includes(
        request.action,
      )
    )
      LS.applyRemote(
        "gameList",
        gameList.map((g) =>
          g.id === game.id ? transitionGame(g, request.action) : g,
        ),
      );
    else if (request.action === "timer") {
      let state = getTimerState();
      if (request.operation === "start")
        state = startTimer(state, levelDur(state.levelIdx), Date.now());
      if (request.operation === "pause")
        state = pauseTimer(state, levelDur(state.levelIdx), Date.now());
      if (request.operation === "reset") state = resetTimer(levelDur(0));
      if (request.operation === "jump")
        state = jumpTimer(
          state,
          request.index,
          levelDur(request.index),
          Date.now(),
        );
      LS.applyRemote("timerState", {
        ...state,
        revision: (state.revision || 0) + 1,
      });
    } else if (request.action === "clearAttendance")
      LS.applyRemote("attendance", []);
    return { saved: true };
  });
  configureCheckIn(async (request) => {
    const gameList = LS.get("gameList").map((g) => ({
      ...g,
      tonight: g.id === LS.get("activeGameId") ? LS.get("attendance", []) : [],
    }));
    const next = applyCheckIn(
      {
        players: LS.get("players"),
        gameList,
        activeGameId: LS.get("activeGameId"),
      },
      request,
      new Date(),
      { admin: isAdmin() },
    );
    LS.applySnapshot({ players: next.players, attendance: next.tonight });
    return { saved: true };
  });
  configureResults(async (request) => {
    const gameList = LS.get("gameList"),
      game = gameList.find((g) => g.id === request.gameId);
    const result = scoreGame({
      players: LS.get("players"),
      history: LS.get("history"),
      game,
      tonight: LS.get("attendance"),
      ...request,
    });
    LS.applySnapshot({
      players: result.players,
      history: result.history,
      attendance: [],
      gameList: gameList.map((g) =>
        g.id === game.id ? transitionGame(g, "complete") : g,
      ),
      timerState: resetTimer(levelDur(0)),
    });
    return result;
  });
}
