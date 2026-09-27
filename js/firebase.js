import { emulator, firebaseAppName } from "./environment.js";
import { configureAccount, clearAccount, updateAccount } from "./account.js";
import { LEAGUE_PATH } from "./schema.js";
import { configureCommands } from "./commands.js";
import {
  configureAdminAccess,
  configureAdminDirectory,
} from "./admin-access.js";
import { FIREBASE_CONFIG } from "./config.js";
import { LS } from "./store.js";
import { connectNativeSync } from "./native-sync.js";
import { documentPatches } from "./schema.js";
import { configureAuth, setSession, isAdmin, subscribeAuth } from "./auth.js";
import {
  googleAuthDomain,
  googleSignIn,
  acceptGoogleAdministrator,
} from "./google-auth.js";
import { configureCheckIn } from "./checkin.js";
import { configureResults, configureResultCorrections } from "./results.js";

export async function initializeFirebase(onError, onAuthError = onError) {
  const [appSDK, dbSDK, authSDK, functionsSDK] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js"),
  ]);
  const app = appSDK.initializeApp(
    emulator
      ? { ...FIREBASE_CONFIG, projectId: "demo-all-in-atlanta" }
      : { ...FIREBASE_CONFIG, authDomain: googleAuthDomain(FIREBASE_CONFIG) },
    firebaseAppName,
  );
  const db = dbSDK.getFirestore(app);
  const auth = authSDK.getAuth(app);
  const functions = functionsSDK.getFunctions(app);
  // Local development uses production services unless emulators are explicitly requested.
  if (emulator) {
    dbSDK.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    authSDK.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    functionsSDK.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  const save = functionsSDK.httpsCallable(functions, "saveLeagueChanges");
  const addAdministrator = functionsSDK.httpsCallable(
    functions,
    "addAdministrator",
  );
  configureAdminAccess(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    const { data } = await addAdministrator(request);
    return data;
  });
  const getAdministrators = functionsSDK.httpsCallable(
    functions,
    "getAdministrators",
  );
  const deleteAdministrator = functionsSDK.httpsCallable(
    functions,
    "deleteAdministrator",
  );
  configureAdminDirectory(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    return (
      await (request.uid ? deleteAdministrator : getAdministrators)(request)
    ).data;
  });
  let queue = Promise.resolve();
  LS.connect({
    canWrite: isAdmin,
    write: (key, value, previous, context) => {
      const patches = documentPatches(key, previous, value, context);
      const operation = queue.then(() =>
        save({ patches, activeGameId: context.activeGameId }),
      );
      queue = operation.catch(() => {});
      return operation;
    },
  });
  const sync = connectNativeSync(LS, dbSDK, db, onError);
  const stopAuthSync = subscribeAuth(({ admin }) => sync.setAdmin(admin));
  configureAuth({
    async signInWithGoogle() {
      const result = await googleSignIn(authSDK, auth);
      await acceptGoogleAdministrator(authSDK, auth, result, setSession);
    },
    async signIn(email, password) {
      const { user } = await authSDK.signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const token = await user.getIdTokenResult(true);
      if (token.claims.admin !== true) {
        await authSDK.signOut(auth);
        throw new Error(
          "Administrator access required. Players do not need to sign in.",
        );
      }
      setSession(user, true);
    },
    // onIdTokenChanged publishes the refreshed claims to all auth subscribers.
    refreshToken: () => auth.currentUser?.getIdTokenResult(true),
    signOut: () => authSDK.signOut(auth),
    resetPassword: (email) => authSDK.sendPasswordResetEmail(auth, email),
  });
  const accountCall = functionsSDK.httpsCallable(
    functions,
    "managePlayerAccount",
  );
  configureAccount(async (request) => (await accountCall(request)).data);
  let stopRequests = () => {};
  let accountGeneration = 0;
  const stopAccountSync = subscribeAuth(({ admin }) => {
    const generation = ++accountGeneration;
    stopRequests();
    clearAccount();
    if (!admin) return;
    stopRequests = dbSDK.onSnapshot(
      dbSDK.collection(db, `${LEAGUE_PATH}/accounts`),
      (snapshot) => {
        if (generation === accountGeneration)
          updateAccount({
            owners: snapshot.docs
              .map((doc) => doc.data())
              .filter((a) => a.playerKey),
          });
      },
      (error) => {
        if (generation === accountGeneration)
          updateAccount({ error: error.message });
      },
    );
  });
  let authRevision = 0;
  let tokenUser;
  // Consume the returned credential once and report sign-in failures separately
  // from live-data failures. The token listener also restores existing sessions.
  try {
    const result = await authSDK.getRedirectResult(auth);
    await acceptGoogleAdministrator(authSDK, auth, result, setSession);
  } catch (error) {
    onAuthError(error);
  }
  authSDK.onIdTokenChanged(auth, async (user) => {
    const revision = ++authRevision;
    // Refresh restored sessions once; refreshing emits another token event.
    const forceRefresh = !!user && tokenUser !== user;
    tokenUser = user;
    try {
      const admin = user
        ? (await user.getIdTokenResult(forceRefresh)).claims.admin === true
        : false;
      if (revision === authRevision) {
        setSession(user, admin);
        if (user && !admin) await authSDK.signOut(auth);
      }
    } catch (error) {
      if (revision === authRevision) setSession(null, false);
      onError(error);
    }
  });
  const manage = functionsSDK.httpsCallable(functions, "manageLeague");
  configureCommands(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    const result = queue.then(() => manage(request));
    queue = result.catch(() => {});
    const { data } = await result;
    return data;
  });
  const checkIn = functionsSDK.httpsCallable(functions, "playerCheckIn");
  configureCheckIn(async (request) => {
    const { data } = await checkIn({
      ...request,
      gameId: LS.get("activeGameId", null),
    });
    return data;
  });
  const correct = functionsSDK.httpsCallable(functions, "correctResults");
  configureResultCorrections(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    await queue;
    const { data } = await correct(request);
    return data;
  });
  const finalize = functionsSDK.httpsCallable(functions, "finalizeResults");
  configureResults(async (request) => {
    if (!isAdmin()) throw new Error("Administrator sign-in required.");
    await queue;
    const { data } = await finalize(request);
    return data;
  });
  await sync.initialized;
  return () => {
    stopAccountSync();
    stopRequests();
    stopAuthSync();
    sync.stop();
  };
}
