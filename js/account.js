// Private account state stays in memory and is cleared whenever the user changes.
let state = {
  loaded: false,
  account: null,
  profile: null,
  requests: [],
  owners: [],
  error: null,
};
let command;
const listeners = new Set();
export const getAccountState = () => state;
export const subscribeAccount = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function updateAccount(values) {
  state = { ...state, ...values };
  listeners.forEach((listener) => listener(state));
}
export function clearAccount() {
  updateAccount({
    loaded: false,
    account: null,
    profile: null,
    requests: [],
    owners: [],
    error: null,
  });
}
export function configureAccount(adapter) {
  command = adapter;
}
export async function accountCommand(request) {
  if (!command)
    throw new Error("Account services are unavailable. Please try again.");
  return command(request);
}

export async function autoLinkAccount() {
  try {
    return await accountCommand({ action: "autoLink" });
  } catch (error) {
    // Older deployed functions still support manual profile requests. Automatic
    // matching is optional and must not block that flow during a rollout.
    if (
      error.code === "functions/failed-precondition" &&
      error.message === "Unknown account action."
    )
      return { linked: false };
    throw error;
  }
}
