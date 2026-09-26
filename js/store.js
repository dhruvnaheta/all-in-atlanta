export const SYNC_KEYS = [
  "players",
  "gameList",
  "seriesList",
  "history",
  "activeGameId",
  "timerState",
  "levelOverrides",
];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createStore(storage) {
  const listeners = new Set(),
    memory = new Map();
  let transport;
  const emit = (event) => listeners.forEach((listener) => listener(event));
  const get = (key, fallback) => {
    if (memory.has(key)) return structuredClone(memory.get(key));
    try {
      const raw = storage?.getItem("aia_v2_" + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const cache = (key, value) => {
    memory.set(key, structuredClone(value));
    try {
      const persisted = structuredClone(value);
      if (key === "players")
        for (const p of Object.values(persisted || {})) {
          delete p.email;
          delete p.phone;
          delete p.recoveryNote;
        }
      storage?.setItem("aia_v2_" + key, JSON.stringify(persisted));
    } catch {
      /* in-memory operation works if browser storage is unavailable */
    }
  };
  return {
    get,
    connect(adapter) {
      transport = adapter;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(key, value) {
      if (!transport?.canWrite())
        throw new Error("Sign in as an administrator before making changes.");
      if (!["players", "seriesList"].includes(key))
        throw new Error("Use the dedicated game operation for this change.");
      const previous = get(key, null),
        context = { activeGameId: get("activeGameId", null) };
      value = structuredClone(value);
      // The cache contains confirmed state only. A rejected save cannot roll back a
      // newer snapshot or temporarily display a change that never reached the server.
      await transport.write(key, value, previous, context);
      if (equal(get(key, null), previous)) {
        cache(key, value);
        emit({ keys: [key], source: "saved" });
      }
    },
    applyRemote(key, value) {
      this.applySnapshot({ [key]: value });
    },
    applySnapshot(values) {
      const keys = Object.keys(values).filter(
        (key) => !equal(get(key), values[key]),
      );
      for (const key of keys) cache(key, values[key]);
      if (keys.length) emit({ keys, source: "snapshot" });
    },
  };
}
let storage;
try {
  storage = globalThis.localStorage;
  for(const key of [...SYNC_KEYS,'adminpw','gameState','tonight','attendance'])storage?.removeItem('aia_'+key);
} catch {
  /* optional */
}
export const LS = createStore(storage);
