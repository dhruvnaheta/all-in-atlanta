// Resolve once, before navigation or Firebase initialization can change the URL.
export const emulator =
  ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname) &&
  new URLSearchParams(globalThis.location?.search).get("emulator") === "1";
export const firebaseAppName = emulator ? "aia-emulator" : "[DEFAULT]";
export const cachePrefix = emulator ? "aia_emulator_v2_" : "aia_v2_";

export function environmentURL(href) {
  const url = new URL(href, location.href);
  if (emulator && url.origin === location.origin && /^https?:$/.test(url.protocol))
    url.searchParams.set("emulator", "1");
  return url;
}
