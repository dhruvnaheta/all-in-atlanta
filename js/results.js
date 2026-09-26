let commit;
export function configureResults(adapter) {
  commit = adapter;
}
export async function commitResults(request) {
  if (!commit)
    throw new Error(
      "Results cannot be saved while disconnected. Please try again.",
    );
  return commit(request);
}

let amend;
export function configureResultCorrections(adapter) {
  amend = adapter;
}
export async function correctResults(request) {
  if (!amend)
    throw new Error(
      "Results cannot be saved while disconnected. Please try again.",
    );
  return amend(request);
}
