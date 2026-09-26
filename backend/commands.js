import { mergePlayers } from "./merge-players.js";
import { LEAGUE_PATH, safeId, playerId } from "../js/schema.js";
import {
  normalizeGame,
  transitionGame,
  requireRunning,
} from "../js/game-model.js";
import { BLIND_LEVELS, MIN } from "../js/blind-structure.js";
import {
  advanceTimer,
  startTimer,
  pauseTimer,
  jumpTimer,
  resetTimer,
} from "../js/timer.js";

// Each operation checks current state and commits all affected records together.
export async function leagueCommand(db, request, now = new Date()) {
  const { action, gameId, expectedActiveGameId } = request || {};
  if (
    action === "deletePlayer" &&
    (typeof request.key !== "string" ||
      !request.key.trim() ||
      request.key.length > 120)
  )
    throw new Error("Invalid player.");
  if (
    action === "deleteSeries" &&
    (typeof request.seriesId !== "string" || !request.seriesId)
  )
    throw new Error("Invalid series.");
  return db.runTransaction(async (tx) => {
    const ref = (path) => db.doc(`${LEAGUE_PATH}/${path}`);
    const [control, current] = await tx.getAll(
      ref("operations/control"),
      ref("settings/current"),
    );
    if (!control.data()?.writesEnabled)
      throw new Error(
        "League maintenance is in progress. Please try again shortly.",
      );
    const activeId = current.data()?.activeGameId ?? null;
    if (expectedActiveGameId !== undefined && activeId !== expectedActiveGameId)
      throw new Error(
        "The active game changed. Review it before trying again.",
      );
    const writes = [];
    const set = (path, value) =>
      writes.push(() => tx.set(ref(path), value, { merge: true }));
    const remove = (snapshot) => writes.push(() => tx.delete(snapshot.ref));
    const collection = async (path) =>
      (await tx.get(db.collection(`${LEAGUE_PATH}/${path}`))).docs;
    const target = gameId ?? activeId;
    const gameSnapshot = target
      ? await tx.get(ref(`games/${safeId(target)}`))
      : null;
    const game = normalizeGame(gameSnapshot?.data());
    const gamePath = target ? `games/${safeId(target)}` : null;
    const receipt = { saved: true, serverNow: now.getTime() };
    const updateGame = (value) => {
      set(gamePath, value);
      receipt.game = { ...game, ...value };
    };
    if (action === "launchGame") {
      const series = (
        await tx.get(ref(`series/${safeId(request.seriesId || "")}`))
      ).data();
      if (!series) throw new Error("Recurring series not found.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(request.date || ""))
        throw new Error("Invalid game date.");
      const id = `${series.id}_${request.date}`;
      const path = `games/${safeId(id)}`;
      if ((await tx.get(ref(path))).exists)
        throw new Error("A game already exists for this series and date.");
      const date = new Date(request.date + "T12:00:00Z").toLocaleDateString(
        "en-US",
        { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" },
      );
      const created = {
        id,
        seriesId: series.id,
        name: series.name + " — " + date,
        date,
        status: "scheduled",
        registrationOpen: false,
        scheduled: true,
      };
      set(path, created);
      set("settings/current", { activeGameId: id });
      receipt.game = created;
      receipt.activeGameId = id;
    } else if (action === "activateGame") {
      if (!game || game.scheduled === false) throw new Error("Game not found.");
      set("settings/current", { activeGameId: target });
      receipt.activeGameId = target;
    } else if (
      ["start", "openRegistration", "closeRegistration"].includes(action)
    ) {
      if (target !== activeId)
        throw new Error("Select this game before changing it.");
      updateGame(transitionGame(game, action));
      if (action === "start") {
        const timer =
          (await tx.get(ref(`${gamePath}/runtime/timer`))).data() || {};
        const timerState = {
          ...resetTimer((timer.levelOverrides?.[0] ?? 15) * MIN),
          revision: (timer.timerState?.revision || 0) + 1,
        };
        set(`${gamePath}/runtime/timer`, { timerState });
        receipt.timerState = timerState;
      }
    } else if (action === "timer") {
      if (target !== activeId)
        throw new Error("Select this game before changing its timer.");
      requireRunning(game);
      const record =
        (await tx.get(ref(`${gamePath}/runtime/timer`))).data() || {};
      let overrides = record.levelOverrides || {};
      const durations = BLIND_LEVELS.map((level, i) =>
        overrides[i] === undefined ? level.dur : overrides[i] * MIN,
      );
      const raw = record.timerState || resetTimer(durations[0]);
      if (request.revision !== (raw.revision || 0))
        throw new Error(
          "The timer changed on another device. Review it and try again.",
        );
      let state = advanceTimer(raw, durations, now.getTime());
      const index = request.index;
      switch (request.operation) {
        case "start":
          state = startTimer(state, durations[state.levelIdx], now.getTime());
          break;
        case "pause":
          state = pauseTimer(state, durations[state.levelIdx], now.getTime());
          break;
        case "reset":
          state = resetTimer(durations[0]);
          break;
        case "jump":
          if (!Number.isInteger(index) || !BLIND_LEVELS[index])
            throw new Error("Invalid timer level.");
          state = jumpTimer(state, index, durations[index], now.getTime());
          break;
        case "duration":
        case "resetDurations": {
          if (
            request.operation === "duration" &&
            (!Number.isInteger(index) ||
              !BLIND_LEVELS[index] ||
              !Number.isInteger(request.minutes) ||
              request.minutes < 1 ||
              request.minutes > 60)
          )
            throw new Error("Duration must be 1–60 minutes.");
          const elapsed =
            durations[state.levelIdx] -
            (state.running
              ? Math.max(
                  0,
                  durations[state.levelIdx] -
                    (now.getTime() - state.levelStartTs),
                )
              : (state.pausedRemaining ?? durations[state.levelIdx]));
          overrides =
            request.operation === "resetDurations"
              ? {}
              : { ...overrides, [index]: request.minutes };
          const newDuration =
            overrides[state.levelIdx] === undefined
              ? BLIND_LEVELS[state.levelIdx].dur
              : overrides[state.levelIdx] * MIN;
          if (!state.running)
            state.pausedRemaining = Math.max(0, newDuration - elapsed);
          // Running level's start timestamp already retains elapsed time.
          break;
        }
        default:
          throw new Error("Invalid timer operation.");
      }
      state.revision = (raw.revision || 0) + 1;
      set(`${gamePath}/runtime/timer`, {
        timerState: state,
        levelOverrides: overrides,
      });
      receipt.timerState = state;
      receipt.levelOverrides = overrides;
    } else if (action === "clearAttendance") {
      requireRunning(game);
      for (const participant of await collection(`${gamePath}/participants`))
        set(`${gamePath}/participants/${participant.id}`, { checkIn: null });
    } else if (action === "deleteGame" || action === "deleteSeries") {
      const games =
        action === "deleteSeries"
          ? (await collection("games")).filter(
              (g) => g.data().seriesId === request.seriesId,
            )
          : gameSnapshot?.exists
            ? [gameSnapshot]
            : [];
      for (const item of games) {
        if (normalizeGame(item.data()).status === "running")
          throw new Error(
            "Complete or stop a running game before deleting it.",
          );
        set(`games/${item.id}`, { scheduled: false });
      }
      if (action === "deleteSeries") {
        const series = await tx.get(ref(`series/${safeId(request.seriesId)}`));
        if (series.exists) remove(series);
      }
      if (games.some((g) => g.data().id === activeId)) {
        set("settings/current", { activeGameId: null });
        receipt.activeGameId = null;
      }
    } else if (action === "mergePlayers") {
      await mergePlayers(tx, ref, collection, set, remove, request);
    } else if (action === "deletePlayer") {
      const players = await collection("players"),
        contacts = await collection("playerContacts");
      const selected = (p) => p.id === playerId(request.key);
      for (const p of [...players, ...contacts].filter(selected)) remove(p);
      const link = await tx.get(ref(`playerAccounts/${playerId(request.key)}`));
      if (link.exists) remove(link);
      for (const account of await collection("accounts")) {
        const data = account.data();
        if (data.playerKey === request.key)
          set(`accounts/${account.id}`, {
            playerKey: null,
            playerIdentity: null,
            playerCreatedAt: null,
            status: "unlinked",
            unlinkedAt: now.toISOString(),
            unlinkReason: "player-deleted",
          });
        else if (data.status === "pending" && data.requestedKey === request.key)
          set(`accounts/${account.id}`, {
            status: "rejected",
            reviewedAt: now.toISOString(),
            rejectionReason: "player-deleted",
          });
      }
      const games = await collection("games");
      for (const g of games) {
        const participants = await collection(`games/${g.id}/participants`);
        for (const p of participants.filter(selected))
          set(`games/${g.id}/participants/${p.id}`, { checkIn: null });
      }
    } else throw new Error("Unknown league operation.");
    // Oversized operations fail before any writes to prevent partial changes.
    if (writes.length > 490)
      throw new Error(
        "This operation is too large to complete atomically. Use the maintenance tools.",
      );
    for (const write of writes) write();
    return receipt;
  });
}
