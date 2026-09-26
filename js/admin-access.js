let gateway;
export function configureAdminAccess(adapter) {
  gateway = adapter;
}
export async function grantAdminAccess(email) {
  if (!gateway)
    throw new Error(
      "Changes cannot be saved while disconnected. Please try again.",
    );
  return gateway({ email });
}

let directoryGateway;
export function configureAdminDirectory(adapter) {
  directoryGateway = adapter;
}
export async function adminDirectory(request = {}) {
  if (!directoryGateway)
    throw new Error("Administrator list is unavailable. Please try again.");
  return directoryGateway(request);
}
