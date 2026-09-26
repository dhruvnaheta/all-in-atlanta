import { HttpsError } from "firebase-functions/v2/https";

export async function grantAdministrator(auth, request) {
  if (!request.auth?.uid || request.auth.token?.admin !== true)
    throw new HttpsError(
      "permission-denied",
      "Administrator sign-in required.",
    );
  // Recheck the live account so a revoked claim cannot grant more access.
  const caller = await auth.getUser(request.auth.uid);
  if (caller.disabled || caller.customClaims?.admin !== true)
    throw new HttpsError(
      "permission-denied",
      "Administrator sign-in required.",
    );
  const email = request.data?.email;
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const normalized = email.trim().toLowerCase();
  let user;
  try {
    user = await auth.getUserByEmail(normalized);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    try {
      user = await auth.createUser({ email: normalized });
    } catch (createError) {
      // Another request may have created the same identity in the meantime.
      if (createError.code !== "auth/email-already-exists") throw createError;
      user = await auth.getUserByEmail(normalized);
    }
  }
  if (user.disabled)
    throw new HttpsError(
      "failed-precondition",
      "This account is disabled. Restore it before granting access.",
    );
  const alreadyAdmin = user.customClaims?.admin === true;
  if (!alreadyAdmin)
    await auth.setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true,
    });
  return { email: normalized, alreadyAdmin };
}

const accessPath = "leagues/atlanta-v2/administratorAccess";
async function requireAdministrator(auth, request) {
  if (!request.auth?.uid || request.auth.token?.admin !== true)
    throw new HttpsError(
      "permission-denied",
      "Administrator sign-in required.",
    );
  const caller = await auth.getUser(request.auth.uid);
  if (caller.disabled || caller.customClaims?.admin !== true)
    throw new HttpsError(
      "permission-denied",
      "Administrator sign-in required.",
    );
}
export async function listAdministrators(auth, db, request) {
  await requireAdministrator(auth, request);
  const owners = await db.collection(accessPath).get();
  const ownerIds = new Set(
    owners.docs.filter((doc) => doc.data().owner === true).map((doc) => doc.id),
  );
  const administrators = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.customClaims?.admin === true)
        administrators.push({
          uid: user.uid,
          email: user.email || "",
          name: user.displayName || "",
          owner: ownerIds.has(user.uid),
          disabled: !!user.disabled,
        });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  administrators.sort((a, b) => a.email.localeCompare(b.email));
  return { administrators, owner: ownerIds.has(request.auth.uid) };
}
export async function removeAdministrator(auth, db, request) {
  await requireAdministrator(auth, request);
  const caller = await db.collection(accessPath).doc(request.auth.uid).get();
  if (caller.data()?.owner !== true)
    throw new HttpsError(
      "permission-denied",
      "Only owners can remove administrators.",
    );
  const uid = request.data?.uid;
  if (typeof uid !== "string" || !uid || uid.length > 128 || uid.includes("/"))
    throw new HttpsError(
      "invalid-argument",
      "Choose an administrator to remove.",
    );
  const target = await db.collection(accessPath).doc(uid).get();
  if (target.data()?.owner === true)
    throw new HttpsError("failed-precondition", "Owners cannot be removed.");
  const user = await auth.getUser(uid);
  const claims = { ...user.customClaims };
  delete claims.admin;
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);
  return { removed: true };
}
