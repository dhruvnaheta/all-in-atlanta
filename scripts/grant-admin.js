// Run only in a trusted environment with Firebase Admin application credentials.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const [projectId, email] = process.argv.slice(2);
if (!projectId || !email)
  throw new Error(
    "Usage: node scripts/grant-admin.js PROJECT_ID EXISTING_USER_EMAIL",
  );
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
console.log(
  "Administrator access granted. Sign out and sign back in to refresh the account.",
);
