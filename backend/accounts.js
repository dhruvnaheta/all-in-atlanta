import { cleanPlayerName, hasPlayerName } from "../js/player-search.js";
import { validateContact } from "../js/contact.js";
import { randomUUID } from "node:crypto";
import { LEAGUE_PATH, playerId } from "../js/schema.js";
import { checkInTransaction } from "./operations.js";

const clean = (value, max = 120) => {
  if (typeof value !== "string" || value.trim().length > max)
    throw new Error("Please enter valid account details.");
  return value.trim();
};
const isLinkedProfile = (account, profile) =>
  profile.exists &&
  (account.playerIdentity
    ? profile.data().identityVersion === account.playerIdentity
    : account.playerCreatedAt?.isEqual(profile.createTime));
const validKey = (key) => {
  key = clean(key);
  if (!key || ["__proto__", "constructor", "prototype"].includes(key))
    throw new Error("Choose a valid player.");
  return key;
};

const normalizedEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

// Account identity is separate from league statistics. Verified unique email
// matches and admin approvals both use the reverse mapping to prevent duplicates.
export async function playerAccount(db, request, now = new Date(), auth) {
  if (!auth?.uid) throw new Error("Sign in to manage your player account.");
  const action = request?.action;
  const admin = auth.token?.admin === true;
  const ref = (path) => db.doc(`${LEAGUE_PATH}/${path}`);
  const ownRef = ref(`accounts/${encodeURIComponent(auth.uid)}`);
  if (action === "checkIn") {
    return db.runTransaction(async (tx) => {
      const account = (await tx.get(ownRef)).data();
      if (!account?.playerKey)
        throw new Error("Your player profile is not linked yet.");
      const key = validKey(account.playerKey);
      const player = await tx.get(ref(`players/${playerId(key)}`));
      if (!isLinkedProfile(account, player))
        throw new Error(
          "Your player profile is unavailable. Please contact an admin.",
        );
      // Resolve the player from the account, never from caller-supplied input.
      return checkInTransaction(
        db,
        tx,
        { action: "checkIn", gameId: request.gameId, key },
        now,
        { admin },
      );
    });
  }
  if (action === "profile") {
    const account = (await ownRef.get()).data();
    if (!account?.playerKey)
      throw new Error("Your player profile is not linked yet.");
    const key = validKey(account.playerKey);
    const player = await ref(`players/${playerId(key)}`).get();
    if (!isLinkedProfile(account, player))
      throw new Error(
        "Your player profile is unavailable. Please contact an admin.",
      );
    const contact =
      (await ref(`playerContacts/${playerId(key)}`).get()).data() || {};
    return {
      dn: player.data().dn || key,
      email: contact.email || "",
      phone: contact.phone || "",
    };
  }
  return db.runTransaction(async (tx) => {
    const control = await tx.get(ref("operations/control"));
    if (control.data()?.writesEnabled !== true)
      throw new Error(
        "League maintenance is in progress. Please try again shortly.",
      );
    if (action === "autoLink") {
      const email = normalizedEmail(auth.token?.email);
      if (
        !auth.token?.email_verified ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
        return { linked: false };
      const current = (await tx.get(ownRef)).data();
      if (current?.playerKey) return { linked: true };
      // Do not override an administrator's rejection or a different pending claim.
      if (current?.status === "rejected") return { linked: false };
      // Legacy contacts have no normalized index. Scan privately in the transaction
      // so case/whitespace variants and duplicate addresses cannot evade matching.
      const contacts = await tx.get(
        db.collection(`${LEAGUE_PATH}/playerContacts`),
      );
      const matches = contacts.docs.filter(
        (doc) => normalizedEmail(doc.data().email) === email,
      );
      if (matches.length !== 1) return { linked: false };
      const id = matches[0].id;
      const profile = await tx.get(ref(`players/${id}`));
      if (!profile.exists) return { linked: false };
      const key = validKey(profile.data().key);
      if (playerId(key) !== id) return { linked: false };
      if (
        current?.status === "pending" &&
        (current.newPlayer ||
          current.requestedKey !== key ||
          !current.requestedPlayerCreatedAt?.isEqual(profile.createTime))
      )
        return { linked: false };
      const linkRef = ref(`playerAccounts/${id}`);
      if ((await tx.get(linkRef)).exists) return { linked: false };
      tx.create(linkRef, { uid: auth.uid, playerKey: key });
      tx.set(ownRef, {
        uid: auth.uid,
        email: auth.token.email,
        playerKey: key,
        playerCreatedAt: profile.createTime,
        status: "linked",
        linkedBy: "verified-email",
        linkedAt: now.toISOString(),
      });
      return { linked: true };
    }
    if (action === "requestLink") {
      if (!auth.token?.email_verified)
        throw new Error(
          "Verify your email before requesting a player profile.",
        );
      const current = (await tx.get(ownRef)).data();
      if (current?.playerKey)
        throw new Error("Your account already has a player profile.");
      if (current?.status === "pending")
        throw new Error("Your request is already waiting for approval.");
      const newName = request.newName
        ? cleanPlayerName(clean(request.newName))
        : "";
      const key = validKey(newName ? newName.toLowerCase() : request.playerKey);
      if (newName && newName.length < 2)
        throw new Error("Enter your full player name.");
      const profile = await tx.get(ref(`players/${playerId(key)}`));
      const names = newName
        ? (await tx.get(db.collection(`${LEAGUE_PATH}/players`))).docs.map(
            (doc) => doc.data(),
          )
        : [];
      if (newName && (profile.exists || hasPlayerName(names, newName)))
        throw new Error(
          "That player already exists. Select the existing profile.",
        );
      if (!newName && !profile.exists)
        throw new Error("That player is no longer available.");
      const link = await tx.get(ref(`playerAccounts/${playerId(key)}`));
      if (link.exists)
        throw new Error(
          "That profile is already linked. Please contact an admin.",
        );
      tx.set(ownRef, {
        uid: auth.uid,
        email: auth.token.email || "",
        status: "pending",
        requestedKey: key,
        requestedName: newName || profile.data().dn || key,
        newPlayer: !!newName,
        ...(!newName ? { requestedPlayerCreatedAt: profile.createTime } : {}),
        requestedAt: now.toISOString(),
      });
      return { saved: true };
    }
    if (action === "approveLink" || action === "rejectLink") {
      if (!admin) throw new Error("Administrator sign-in required.");
      const uid = clean(request.uid, 128);
      if (!uid) throw new Error("Choose an account.");
      const target = ref(`accounts/${encodeURIComponent(uid)}`);
      const account = (await tx.get(target)).data();
      if (account?.status !== "pending" || account.playerKey)
        throw new Error("This request has already been handled.");
      if (action === "rejectLink") {
        tx.update(target, {
          status: "rejected",
          reviewedAt: now.toISOString(),
          reviewedBy: auth.uid,
        });
        return { saved: true };
      }
      const key = validKey(
        account.newPlayer
          ? cleanPlayerName(account.requestedKey)
          : account.requestedKey,
      );
      const profileRef = ref(`players/${playerId(key)}`);
      const linkRef = ref(`playerAccounts/${playerId(key)}`);
      const [profile, link] = await tx.getAll(profileRef, linkRef);
      if (link.exists)
        throw new Error("Another account already owns this player profile.");
      const names = account.newPlayer
        ? (await tx.get(db.collection(`${LEAGUE_PATH}/players`))).docs.map(
            (doc) => doc.data(),
          )
        : [];
      if (
        account.newPlayer &&
        (profile.exists || hasPlayerName(names, account.requestedName))
      )
        throw new Error(
          "This player was created since the request. Reject it and ask them to select the existing profile.",
        );
      if (!account.newPlayer && !profile.exists)
        throw new Error(
          "This player no longer exists. Reject this request and ask the player to try again.",
        );
      // Older requests lack an identity binding and must be submitted again.
      if (
        !account.newPlayer &&
        !account.requestedPlayerCreatedAt?.isEqual(profile.createTime)
      )
        throw new Error(
          "The player identity changed or this request predates identity verification. Reject it and ask the player to submit a new request.",
        );
      const playerIdentity = profile.exists ? null : randomUUID();
      if (!profile.exists) {
        tx.create(profileRef, {
          identityVersion: playerIdentity,
          key,
          dn: cleanPlayerName(account.requestedName),
          total: 0,
          month: 0,
          games: 0,
          best: null,
          gameDates: [],
          bySeries: {},
          registered: now.toLocaleDateString("en-US", {
            timeZone: "America/New_York",
          }),
        });
        tx.set(
          ref(`playerContacts/${playerId(key)}`),
          { email: account.email, phone: "" },
          { merge: true },
        );
      }
      tx.create(linkRef, { uid, playerKey: key });
      tx.update(target, {
        playerKey: key,
        ...(profile.exists
          ? { playerCreatedAt: profile.createTime }
          : { playerIdentity }),
        status: "linked",
        reviewedAt: now.toISOString(),
        reviewedBy: auth.uid,
      });
      return { saved: true };
    }
    if (action === "saveProfile") {
      const account = (await tx.get(ownRef)).data();
      if (!account?.playerKey)
        throw new Error("Your player profile is not linked yet.");
      const key = validKey(account.playerKey);
      const profileRef = ref(`players/${playerId(key)}`);
      if (!isLinkedProfile(account, await tx.get(profileRef)))
        throw new Error(
          "Your player profile is unavailable. Please contact an admin.",
        );
      const dn = clean(request.dn),
        email = clean(request.email, 254),
        phone = clean(request.phone, 40);
      if (dn.length < 2) throw new Error("Enter a valid player name.");
      validateContact({ email, phone });
      // Explicit fields only: totals, results, roles and stable player keys are never editable here.
      tx.update(profileRef, { dn });
      tx.set(
        ref(`playerContacts/${playerId(key)}`),
        { email, phone },
        { merge: true },
      );
      return { saved: true };
    }
    throw new Error("Unknown account action.");
  });
}
