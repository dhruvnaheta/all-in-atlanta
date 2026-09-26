// Native Firestore schema. Legacy keys remain view-model identifiers, never paths.
export const LEAGUE_PATH = "leagues/atlanta-v2";
export const playerId = (key) => "p_" + encodeURIComponent(key);
export const safeId = (id) => encodeURIComponent(id);
export const equal = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function splitPlayer(player) {
  const { email, phone, recoveryNote, ...profile } = player;
  const contact = Object.fromEntries(
    Object.entries({ email, phone, recoveryNote }).filter(
      ([, v]) => v !== undefined,
    ),
  );
  return { profile, contact };
}
export function stateDocuments(key, value, context = {}) {
  const docs = {};
  if (key === "players") {
    for (const [id, player] of Object.entries(value || {})) {
      const { profile, contact } = splitPlayer(player);
      docs[`players/${playerId(id)}`] = profile;
      // Public readers never send empty contacts back over a private record.
      if (Object.keys(contact).length)
        docs[`playerContacts/${playerId(id)}`] = contact;
    }
  } else if (key === "seriesList") {
    for (const series of value || [])
      docs[`series/${safeId(series.id)}`] = series;
  } else if (key === "gameList") {
    for (const [index,game] of (value || []).entries()) {
      const { tonight = [], ...fields } = game;
      const path = `games/${safeId(game.id)}`;
      docs[path] = { ...fields, scheduled: true };
      for (const checkIn of tonight)
        docs[`${path}/participants/${playerId(checkIn.key)}`] = {
          key: checkIn.key,
          checkIn,
        };
    }
  } else if (key === "history") {
    for (const [index, record] of (value || []).entries()) {
      const id = record._id || record.gameId || `legacy_history_${index}`;
      docs[`history/${safeId(id)}`] = {
        ...record,
        _id: id,
        _order: record._order ?? index,
      };
    }
  } else if (key === "activeGameId")
    docs["settings/current"] = { activeGameId: value };
  else if (key === "timerState" || key === "levelOverrides") {
    const gameId = context.activeGameId;
    docs[
      gameId ? `games/${safeId(gameId)}/runtime/timer` : "settings/idleTimer"
    ] = { [key]: value };
  } else if (key === "gameState") {
    if (context.activeGameId)
      docs[`games/${safeId(context.activeGameId)}`] = { state: value };
    else docs["settings/current"] = { gameState: value };
  } else if (key === "tonight") {
    if (context.activeGameId) {
      for (const checkIn of value || [])
        docs[
          `games/${safeId(context.activeGameId)}/participants/${playerId(checkIn.key)}`
        ] = { key: checkIn.key, checkIn };
    } else if (value?.length)
      throw new Error("Select a game before checking in players.");
  } else throw new Error("Unknown state key.");
  return docs;
}
// Patches carry only changed fields and their prior values. The server checks these
// inside a transaction, allowing unrelated simultaneous edits without lost updates.
export function documentPatches(key, before, after, context) {
  const previous = stateDocuments(key, before, context);
  const next = stateDocuments(key, after, context);
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap(
    (path) => {
      const old = previous[path],
        value = next[path];
      if (equal(old, value)) return [];
      if (!value) {
        if (path.includes("/participants/"))
          return [
            {
              path,
              before: { checkIn: old.checkIn },
              after: { checkIn: null },
            },
          ];
        if (path.startsWith("games/"))
          return [
            { path, before: { scheduled: true }, after: { scheduled: false } },
          ];
        return [{ path, before: old, after: null, remove: true }];
      }
      if (!old) return [{ path, before: null, after: value, create: true }];
      const fields = [
        ...new Set([...Object.keys(old), ...Object.keys(value)]),
      ].filter((field) => !equal(old[field], value[field]));
      return [
        {
          path,
          before: Object.fromEntries(fields.map((f) => [f, old[f] ?? null])),
          after: Object.fromEntries(fields.map((f) => [f, value[f] ?? null])),
        },
      ];
    },
  );
}
