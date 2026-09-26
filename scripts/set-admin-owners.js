// Set the owner DB flag only on the two explicitly supplied existing admins.
import { getAuth } from "firebase-admin/auth";
import { adminDatabase } from "./admin-db.js";
const [projectId, megEmail, juliaEmail] = process.argv.slice(2);
if (
  !projectId ||
  !megEmail ||
  !juliaEmail ||
  megEmail.toLowerCase() === juliaEmail.toLowerCase()
)
  throw new Error(
    "Usage: node scripts/set-admin-owners.js PROJECT MEG_EMAIL JULIA_EMAIL",
  );
const { app, db } = await adminDatabase(projectId, true);
try {
  const auth = getAuth(app);
  const users = await Promise.all(
    [megEmail, juliaEmail].map((email) =>
      auth.getUserByEmail(email.trim().toLowerCase()),
    ),
  );
  if (users.some((user) => user.disabled || user.customClaims?.admin !== true))
    throw new Error("Both owners must already be enabled administrators.");
  const collection = db.collection("leagues/atlanta-v2/administratorAccess");
  const existing = await collection.get();
  const ownerIds = new Set(users.map((user) => user.uid));
  const batch = db.batch();
  for (const doc of existing.docs) {
    if (doc.data().owner === true && !ownerIds.has(doc.id))
      batch.set(doc.ref, { owner: false }, { merge: true });
  }
  for (const user of users)
    batch.set(collection.doc(user.uid), { owner: true }, { merge: true });
  await batch.commit();
  console.log("Owner flags saved for Meg and Julia.");
} finally {
  await db.terminate();
}
