import { requireRunning } from "../js/game-model.js";
import {
  LEAGUE_PATH,
  playerId,
  safeId,
  equal,
  splitPlayer,
} from "../js/schema.js";
import { applyCheckIn } from "../js/checkin-model.js";
import { scoreGame } from "../js/scoring.js";
import { DEFAULT_STATE } from "../js/sync.js";

async function writable(db, tx) {
  const control = await tx.get(db.doc(`${LEAGUE_PATH}/operations/control`));
  if (!control.exists || control.data().writesEnabled !== true)
    throw new Error(
      "League maintenance is in progress. Please try again shortly.",
    );
}
export async function savePatches(db, request) {
  const { patches, activeGameId } = request || {};
  if (!Array.isArray(patches) || patches.length > 490)
    throw new Error("Invalid edit size.");
  if (!patches.length) return { saved: true };
  const seen = new Set();
  for (const patch of patches) {
    if (
      !patch ||
      typeof patch.path !== "string" ||
      !/^(players|playerContacts|series|games|history)\/[^/]+$|^games\/[^/]+\/(participants\/[^/]+|runtime\/timer)$|^settings\/(current|idleTimer)$/.test(
        patch.path,
      ) ||
      seen.has(patch.path)
    )
      throw new Error("Invalid document path.");
    if (!/^(players|playerContacts|series)\/[^/]+$/.test(patch.path)) throw new Error("Use the dedicated game operation for this change.");
    if (patch.remove) throw new Error("Use the dedicated delete operation.");
    if (patch.path.startsWith("players/") && patch.after && ["email","phone","recoveryNote"].some(k=>k in patch.after)) throw new Error("Contact fields must be private.");
    seen.add(patch.path);
  }
  return db.runTransaction(async (tx) => {
    await writable(db, tx);
    const current = await tx.get(db.doc(`${LEAGUE_PATH}/settings/current`));
    if (
      activeGameId !== undefined &&
      current.data()?.activeGameId !== activeGameId
    )
      throw new Error("The active game changed. Refresh before editing.");
    const refs = patches.map((p) => db.doc(`${LEAGUE_PATH}/${p.path}`));
    const snapshots = await tx.getAll(...refs);
    for (const [i, patch] of patches.entries()) {
      const actual = snapshots[i].data();
      if (actual?.finalized && patch.after?.state && patch.after.state !== "idle") throw new Error("This game has already been finalized. Launch a new game.");
      if (patch.create) {
        // Historical participants can acquire a new check-in without losing results.
        if (
          actual &&
          !(patch.path.includes("/participants/") && !actual.checkIn)
        )
          throw new Error(
            "This record was created elsewhere. Refresh and try again.",
          );
      } else if (patch.remove) {
        if (!equal(actual, patch.before))
          throw new Error(
            "This record changed elsewhere. Refresh and try again.",
          );
      } else {
        for (const [key, value] of Object.entries(patch.before || {})) {
          const fallback =
            patch.path.endsWith("/runtime/timer") ||
            patch.path === "settings/idleTimer"
              ? DEFAULT_STATE[key]
              : null;
          if (!equal(actual?.[key] ?? fallback ?? null, value))
            throw new Error(
              "This field changed elsewhere. Refresh and try again.",
            );
        }
      }
    }
    for (const [i, patch] of patches.entries()) {
      if (patch.remove) tx.delete(refs[i]);
      else tx.set(refs[i], patch.after, { merge: true });
    }
    return { saved: true };
  });
}
export async function checkIn(db, request, now = new Date(), {admin = false} = {}) {
  if (request?.action === "remove" && !admin) throw new Error("Administrator sign-in required.");
  if (!request || typeof request.gameId !== "string")
    throw new Error("Select a game before checking in.");
  // Validate the key before constructing a path.
  if (
    typeof request.key !== "string" ||
    !request.key.trim() ||
    request.key.length > 120 ||
    ["__proto__", "constructor", "prototype"].includes(request.key)
  )
    throw new Error("Invalid player.");
  return db.runTransaction(async (tx) => {
    await writable(db, tx);
    const current = await tx.get(db.doc(`${LEAGUE_PATH}/settings/current`));
    if (current.data()?.activeGameId !== request.gameId)
      throw new Error("The active game changed. Please try again.");
    const gameRef = db.doc(`${LEAGUE_PATH}/games/${safeId(request.gameId)}`);
    const profileRef = db.doc(
      `${LEAGUE_PATH}/players/${playerId(request.key)}`,
    );
    const participantRef = gameRef
      .collection("participants")
      .doc(playerId(request.key));
    const [gameSnapshot, profileSnapshot, participantSnapshot] =
      await tx.getAll(gameRef, profileRef, participantRef);
    if (!gameSnapshot.exists || gameSnapshot.data().finalized)
      throw new Error("This game is not open.");
    const game = {
      ...gameSnapshot.data(),
      tonight: participantSnapshot.data()?.checkIn
        ? [participantSnapshot.data().checkIn]
        : [],
    };
    const state = {
      activeGameId: game.id,
      gameList: [game],
      players: profileSnapshot.exists
        ? { [request.key]: profileSnapshot.data() }
        : {},
    };
    const next = applyCheckIn(state, request, now, {admin});
    if (!profileSnapshot.exists && next.players[request.key]) {
      const { profile, contact } = splitPlayer(next.players[request.key]);
      tx.create(profileRef, profile);
      tx.create(
        db.doc(`${LEAGUE_PATH}/playerContacts/${playerId(request.key)}`),
        contact,
      );
    }
    tx.set(
      participantRef,
      { key: request.key, checkIn: next.tonight[0] || null },
      { merge: true },
    );
    return { saved: true };
  });
}
export async function finalizeGame(db, request, now = new Date()) {
  if (!request || typeof request.gameId !== "string")
    throw new Error("Invalid game.");
  if (
    request.positions !== undefined &&
    (!request.positions ||
      typeof request.positions !== "object" ||
      Array.isArray(request.positions))
  )
    throw new Error("Invalid finishing positions.");
  return db.runTransaction(async (tx) => {
    await writable(db, tx);
    const gameRef = db.doc(`${LEAGUE_PATH}/games/${safeId(request.gameId)}`);
    const [current, gameSnapshot, timerSnapshot] = await tx.getAll(
      db.doc(`${LEAGUE_PATH}/settings/current`),
      gameRef,
      gameRef.collection("runtime").doc("timer"),
    );
    const game = gameSnapshot.data();
    if (!game) throw new Error("Game not found.");
    // Return the original receipt even if the active game has since changed.
    if (game.finalized)
      return { ...game.resultSummary, alreadyFinalized: true };
    if (current.data()?.activeGameId !== request.gameId)
      throw new Error("The active game changed.");
    requireRunning(game);
    const participants = await tx.get(gameRef.collection("participants"));
    const tonight = participants.docs
      .map((d) => d.data().checkIn)
      .filter(Boolean);
    const playerRefs = tonight.map((p) =>
      db.doc(`${LEAGUE_PATH}/players/${playerId(p.key)}`),
    );
    const players = playerRefs.length ? await tx.getAll(...playerRefs) : [];
    const input = Object.fromEntries(
      players.filter((p) => p.exists).map((p) => [p.data().key, p.data()]),
    );
    const result = scoreGame({
      players: input,
      history: [],
      game,
      tonight,
      positions: request.positions || {},
      stopped: request.stopped === true,
      now,
    });
    const receipt = {
      awardedCount: result.awardedCount,
      alreadyAppliedCount: result.alreadyAppliedCount,
      streakSummary: result.streakSummary,
    };
    const history = result.history[0] || {
      gameId: game.id,
      gameName: game.name,
      date: game.date,
      seriesId: game.seriesId,
      completedAt: now.toISOString(),
      results: [],
      attendanceCount: 0,
      attendanceKeys: [],
      stopped: true,
    };
    const id = `game_${game.id}`;
    tx.create(db.doc(`${LEAGUE_PATH}/history/${safeId(id)}`), {
      ...history,
      _id: id,
      _order: now.getTime(),
    });
    for (const [key, profile] of Object.entries(result.players))
      tx.set(db.doc(`${LEAGUE_PATH}/players/${playerId(key)}`), profile);
    for (const participant of participants.docs) {
      const record = history.results.find(
        (r) => r.key === participant.data().key,
      );
      if (record)
        tx.set(
          participant.ref,
          { checkIn: null, results: { [id]: record } },
          { merge: true },
        );
    }
    tx.update(gameRef, {
      status: "completed",
      registrationOpen: false,
      finalized: true,
      resultSummary: receipt,
    });
    const timer = {
      levelIdx: 0,
      levelStartTs: null,
      pausedRemaining:
        (timerSnapshot.data()?.levelOverrides?.[0] ?? 15) * 60000,
      running: false,
    };
    tx.set(
      gameRef.collection("runtime").doc("timer"),
      { timerState: timer },
      { merge: true },
    );
    return receipt;
  });
}
