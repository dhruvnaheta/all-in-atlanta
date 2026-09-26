import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  stateDocuments,
  safeId,
  playerId,
  equal,
  LEAGUE_PATH,
} from "../js/schema.js";

export function convertBackup(backup) {
  const state = {};
  for (const document of backup.documents) {
    const key = document.name.split("/").at(-1);
    if (key === "adminpw") continue;
    if (typeof document.fields?.v?.stringValue !== "string")
      throw new Error(`Invalid legacy document: ${key}`);
    if (Object.hasOwn(state, key))
      throw new Error(`Duplicate legacy document: ${key}`);
    state[key] = JSON.parse(document.fields.v.stringValue);
  }
  for (const key of ["players", "gameList", "seriesList", "history"])
    if (!state[key]) throw new Error(`Missing ${key}`);
  const documents = {};
  const warnings = [];
  const put = (path, data) => {
    documents[path] = { ...documents[path], ...data };
  };
  for (const key of ["players", "seriesList", "gameList"])
    for (const [path, data] of Object.entries(stateDocuments(key, state[key])))
      put(path, data);
  const knownPlayers = new Set(Object.keys(state.players));
  const missingPlayers = new Set();
  const historyIds = new Set();
  const history = state.history.map((record, index) => {
    const id = `history_${String(index).padStart(4, "0")}`;
    const gameId = record.gameId || `legacy_${id}`;
    if (!record.gameId)
      warnings.push(
        `History ${index}: assigned ${gameId}; original game association unknown.`,
      );
    if (!record.seriesId)
      warnings.push(`History ${index}: series association unknown.`);
    if (historyIds.has(gameId))
      warnings.push(
        `Multiple history records reference ${gameId}; preserved separately.`,
      );
    historyIds.add(gameId);
    const gamePath = `games/${safeId(gameId)}`;
    if (!documents[gamePath])
      put(gamePath, {
        id: gameId,
        name: record.gameName || `Historical game ${index + 1}`,
        date: record.date,
        seriesId: record.seriesId || null,
        state: "idle",
        scheduled: false,
      });
    put(gamePath, { finalized: true });
    for (const result of record.results || []) {
      if (!knownPlayers.has(result.key)) missingPlayers.add(result.key);
      // Preserve duplicates in history, and put one result per record on the participant.
      const path = `${gamePath}/participants/${playerId(result.key)}`;
      put(path, {
        key: result.key,
        results: { ...documents[path]?.results, [id]: result },
      });
    }
    return {
      ...record,
      gameId,
      seriesId: record.seriesId || null,
      _id: id,
      _order: index,
    };
  });
  Object.assign(documents, stateDocuments("history", history));
  for (const [legacyId, attendance] of Object.entries(state.attendance || {})) {
    // Archive the complete original record privately; only explicit game IDs link.
    put(`legacyAttendance/${safeId(legacyId)}`, attendance);
    const gameId = attendance.gameId || `legacy_attendance_${legacyId}`;
    const gamePath = `games/${safeId(gameId)}`;
    if (!documents[gamePath]) {
      put(gamePath, {
        id: gameId,
        date: attendance.date,
        seriesId: attendance.seriesId || null,
        name: "Historical attendance",
        state: "idle",
        scheduled: false,
      });
      warnings.push(
        `Attendance ${legacyId}: retained as a separate historical game; no inferred date match.`,
      );
    }
    for (const [key, entry] of Object.entries(attendance.players || {})) {
      if (!knownPlayers.has(key)) missingPlayers.add(key);
      const path = `${gamePath}/participants/${playerId(key)}`;
      put(path, { key, attendance: entry });
    }
  }
  if (
    state.activeGameId &&
    !state.gameList.some((g) => g.id === state.activeGameId)
  )
    throw new Error("Active game is missing.");
  if (state.tonight?.length) {
    if (!state.activeGameId)
      throw new Error(
        "Unassigned legacy check-ins need manual reconciliation.",
      );
    const active = state.gameList.find((g) => g.id === state.activeGameId);
    if (active.tonight?.length && !equal(active.tonight, state.tonight))
      throw new Error("Legacy and active-game check-ins disagree.");
    for (const [path, data] of Object.entries(
      stateDocuments("tonight", state.tonight, state),
    ))
      put(path, data);
  }
  put("settings/current", {
    activeGameId: state.activeGameId || null,
    gameState: state.gameState || "idle",
    schemaVersion: 2,
  });
  for (const key of ["timerState", "levelOverrides"]) {
    const value =
      state[key] ??
      (key === "timerState"
        ? {
            levelIdx: 0,
            levelStartTs: null,
            pausedRemaining: null,
            running: false,
          }
        : {});
    for (const [path, data] of Object.entries(
      stateDocuments(key, value, state),
    ))
      put(path, data);
  }
  const totals = Object.values(state.players).reduce(
    (out, p) => {
      for (const key of ["total", "month", "games"])
        out[key] += Number(p[key]) || 0;
      return out;
    },
    { total: 0, month: 0, games: 0 },
  );
  for (const [key, original] of Object.entries(state.players)) {
    const restored = {
      ...documents[`players/${playerId(key)}`],
      ...documents[`playerContacts/${playerId(key)}`],
    };
    if (!equal(original, restored))
      throw new Error(`Player preservation failed: ${playerId(key)}`);
  }
  const report = {
    sourceProject: backup.project,
    sourceReadTime: backup.readTime,
    players: Object.keys(state.players).length,
    scheduledGames: state.gameList.length,
    history: history.length,
    attendance: Object.keys(state.attendance || {}).length,
    series: state.seriesList.length,
    documents: Object.keys(documents).length,
    totals,
    missingPlayerReferences: [...missingPlayers].sort(),
    warnings,
    credentialsExcluded: true,
    playerFieldsPreserved: true,
  };
  return {
    format: "aia-native-v2",
    leaguePath: LEAGUE_PATH,
    documents,
    report,
  };
}
export async function readVerifiedBackup(file) {
  const bytes = await readFile(file);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const sums = await readFile(resolve(dirname(file), "SHA256SUMS"), "utf8");
  if (
    !sums
      .split("\n")
      .some((line) => line.trim() === `${checksum}  firestore.json`)
  )
    throw new Error("Backup checksum mismatch.");
  return { backup: JSON.parse(bytes), checksum };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [file, output] = process.argv.slice(2);
  if (!file || !output)
    throw new Error(
      "Usage: node scripts/convert-backup.js BACKUP/firestore.json OUTPUT_DIRECTORY",
    );
  const { backup, checksum } = await readVerifiedBackup(file);
  const converted = convertBackup(backup);
  converted.sourceChecksum = checksum;
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(output, "migration.json"),
    JSON.stringify(converted, null, 2),
    { mode: 0o600 },
  );
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(converted.report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        ...converted.report,
        warnings: converted.report.warnings.length,
        missingPlayerReferences:
          converted.report.missingPlayerReferences.length,
      },
      null,
      2,
    ),
  );
}
