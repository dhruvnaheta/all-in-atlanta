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
