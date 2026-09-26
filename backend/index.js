import { playerAccount } from "./accounts.js";
import { leagueCommand } from "./commands.js";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  grantAdministrator,
  listAdministrators,
  removeAdministrator,
} from "./admin-access.js";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  checkIn,
  finalizeGame,
  savePatches,
  amendResults,
} from "./operations.js";
initializeApp();
const db = getFirestore();
export const addAdministrator = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      return await grantAdministrator(getAuth(), request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Administrator access change failed", { code: error.code });
      throw new HttpsError(
        "internal",
        "Administrator access could not be granted. Please try again.",
      );
    }
  },
);
function administratorCallable(operation) {
  return onCall(
    { region: "us-central1", maxInstances: 10 },
    async (request) => {
      try {
        return await operation(getAuth(), db, request);
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("Administrator operation failed", { code: error.code });
        throw new HttpsError(
          "internal",
          "Administrator access could not be updated. Please try again.",
        );
      }
    },
  );
}
export const getAdministrators = administratorCallable(listAdministrators);
export const deleteAdministrator = administratorCallable(removeAdministrator);
function callable(operation, admin = false) {
  return onCall(
    { region: "us-central1", maxInstances: 10 },
    async (request) => {
      if (admin && request.auth?.token.admin !== true)
        throw new HttpsError(
          "permission-denied",
          "Administrator sign-in required.",
        );
      try {
        return await operation(db, request.data, new Date(), {
          admin: request.auth?.token.admin === true,
        });
      } catch (error) {
        if (error.constructor === Error)
          throw new HttpsError("failed-precondition", error.message);
        console.error("League operation failed", { code: error.code });
        throw new HttpsError(
          "internal",
          "The change could not be saved. Please try again.",
        );
      }
    },
  );
}
export const playerCheckIn = callable(checkIn);
export const correctResults = callable(amendResults, true);
export const finalizeResults = callable(finalizeGame, true);
export const saveLeagueChanges = callable(savePatches, true);

export const manageLeague = callable(leagueCommand, true);

export const managePlayerAccount = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    if (request.auth?.token.admin !== true)
      throw new HttpsError(
        "permission-denied",
        "Administrator sign-in required.",
      );
    try {
      return await playerAccount(db, request.data, new Date(), request.auth);
    } catch (error) {
      if (error.constructor === Error)
        throw new HttpsError("failed-precondition", error.message);
      console.error("Account operation failed", { code: error.code });
      throw new HttpsError(
        "internal",
        "The change could not be saved. Please try again.",
      );
    }
  },
);
