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
