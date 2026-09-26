import { playerId } from "../js/schema.js";
import { calculateStats } from "../js/stats.js";

// Queue writes in the caller's transaction; any conflict aborts the entire merge.
export async function mergePlayers(tx, ref, collection, set, remove, request) {
  const { sourceKey, targetKey } = request;
  for (const key of [sourceKey, targetKey])
    if (
      typeof key !== "string" ||
      !key.trim() ||
      key.length > 120 ||
      ["__proto__", "constructor", "prototype"].includes(key)
    )
      throw new Error("Choose a valid player.");
  if (sourceKey === targetKey) throw new Error("Choose two different players.");
  const sourceId = playerId(sourceKey),
    targetId = playerId(targetKey);
  const [source, target, sourceContact, targetContact, sourceLink, targetLink] =
    await tx.getAll(
      ...[
        `players/${sourceId}`,
        `players/${targetId}`,
        `playerContacts/${sourceId}`,
        `playerContacts/${targetId}`,
        `playerAccounts/${sourceId}`,
        `playerAccounts/${targetId}`,
      ].map(ref),
    );
  if (!source.exists || !target.exists)
    throw new Error("A player no longer exists. Refresh and try again.");
  if (sourceLink.exists && targetLink.exists)
    throw new Error(
      "Both profiles have linked accounts. Resolve account ownership before merging.",
    );
  const name = target.data().dn;
  const transfer = (record) =>
    record?.key === sourceKey
      ? { ...record, key: targetKey, ...(record.name ? { name } : {}) }
      : record;
  const sameResult = (a, b) =>
    a.pts === b.pts &&
    a.pos === b.pos &&
    (a.streakBonus || 0) === (b.streakBonus || 0);
  const mergeResults = (records) => {
    const result = [];
    for (const original of records || []) {
      const record = transfer(original);
      const prior =
        record.key === targetKey && result.find((r) => r.key === targetKey);
      if (prior && !sameResult(prior, record))
        throw new Error(
          "These players have conflicting results in the same game. Correct those results before merging.",
        );
      if (!prior) result.push(record);
    }
    return result;
  };
  const histories = await collection("history");
  const updatedHistory = histories.map((doc) => {
    const record = doc.data();
    const results = mergeResults(record.results);
    const attendanceKeys = record.attendanceKeys?.map((key) =>
      key === sourceKey ? targetKey : key,
    );
    const updated = {
      ...record,
      results,
      ...(attendanceKeys
        ? {
            attendanceKeys: [...new Set(attendanceKeys)],
            attendanceCount: new Set(attendanceKeys).size,
          }
        : {}),
    };
    if (JSON.stringify(record) !== JSON.stringify(updated))
      set(`history/${doc.id}`, updated);
    return updated;
  });
  // Also detects conflicts spread across multiple history records for one game.
  calculateStats({}, updatedHistory);
  for (const game of await collection("games")) {
    const path = `games/${game.id}/participants`;
    const [from, to] = await tx.getAll(
      ref(`${path}/${sourceId}`),
      ref(`${path}/${targetId}`),
    );
    if (!from.exists) continue;
    const a = from.data(),
      b = to.data() || {};
    const results = { ...b.results };
    for (const [id, result] of Object.entries(a.results || {})) {
      if (results[id] && !sameResult(results[id], result))
        throw new Error(
          "These players have conflicting participant results. Correct those results before merging.",
        );
      results[id] = transfer(result);
    }
    set(`${path}/${targetId}`, {
      ...a,
      ...b,
      key: targetKey,
      checkIn: b.checkIn || transfer(a.checkIn) || null,
      results,
    });
    remove(from);
  }
  for (const account of await collection("accounts")) {
    const data = account.data();
    if (data.playerKey === sourceKey) {
      if (!sourceLink.exists || sourceLink.data().uid !== data.uid)
        throw new Error("Resolve inconsistent account links before merging.");
      const validIdentity = data.playerIdentity
        ? data.playerIdentity === source.data().identityVersion
        : data.playerCreatedAt?.isEqual(source.createTime);
      if (!validIdentity)
        throw new Error("Resolve stale account links before merging.");
      set(`accounts/${account.id}`, {
        playerKey: targetKey,
        playerIdentity: target.data().identityVersion || null,
        playerCreatedAt: target.createTime,
      });
    }
    if (data.requestedKey === sourceKey)
      set(`accounts/${account.id}`, {
        requestedKey: targetKey,
        requestedName: name,
        newPlayer: false,
      });
  }
  if (sourceLink.exists) {
    set(`playerAccounts/${targetId}`, {
      ...sourceLink.data(),
      playerKey: targetKey,
    });
    remove(sourceLink);
  }
  const contacts = { ...sourceContact.data(), ...targetContact.data() };
  for (const field of ["email", "phone", "recoveryNote"])
    if (!contacts[field] && sourceContact.data()?.[field])
      contacts[field] = sourceContact.data()[field];
  if (Object.keys(contacts).length) set(`playerContacts/${targetId}`, contacts);
  if (sourceContact.exists) remove(sourceContact);
  remove(source);
}
