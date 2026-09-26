// Preserve spelling and punctuation while making spacing consistent.
export const cleanPlayerName = (name) => name.trim().replace(/\s+/gu, " ");
export const playerNameKey = (name) => cleanPlayerName(name).toLowerCase();
export const hasPlayerName = (players, name) => {
  const key = playerNameKey(name);
  return Object.values(players).some(
    (player) =>
      playerNameKey(player.dn || player.key) === key ||
      playerNameKey(player.key) === key,
  );
};

// Names are search hints, never proof that two profiles belong to one person.
export const normalizePlayerName = (name) =>
  String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function searchPlayers(players, query) {
  const terms = normalizePlayerName(query).split(/\s+/).filter(Boolean);
  return Object.values(players)
    .filter((player) => {
      const name = normalizePlayerName(player.dn || player.key);
      return terms.every((term) => name.includes(term));
    })
    .sort((a, b) => (a.dn || a.key).localeCompare(b.dn || b.key));
}
export function similarPlayers(players, query) {
  const name = normalizePlayerName(query);
  if (name.length < 2) return [];
  const first = name.split(" ")[0];
  return Object.values(players).filter((player) => {
    const other = normalizePlayerName(player.dn || player.key);
    const otherFirst = other.split(" ")[0];
    return (
      other === name ||
      other.startsWith(name + " ") ||
      name.startsWith(other + " ") ||
      (Math.min(first.length, otherFirst.length) >= 3 &&
        (first.startsWith(otherFirst) || otherFirst.startsWith(first)))
    );
  });
}
