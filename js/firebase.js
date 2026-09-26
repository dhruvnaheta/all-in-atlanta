import { configureAccount, clearAccount, updateAccount } from "./account.js";
import { LEAGUE_PATH } from "./schema.js";
import { configureCommands } from "./commands.js";
import { FIREBASE_CONFIG } from "./config.js";
import { LS } from "./store.js";
import { connectNativeSync } from "./native-sync.js";
import { documentPatches } from "./schema.js";
import { configureAuth, setSession, isAdmin, subscribeAuth } from "./auth.js";
import { configureCheckIn } from "./checkin.js";
import { configureResults } from "./results.js";

export async function initializeFirebase(onError) {
  const [appSDK, dbSDK, authSDK, functionsSDK] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js"),
  ]);
  const emulator =
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("emulator") === "1";
  const app = appSDK.initializeApp(
    emulator
      ? { ...FIREBASE_CONFIG, projectId: "demo-all-in-atlanta" }
      : FIREBASE_CONFIG,
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
      const google = new authSDK.GoogleAuthProvider();
      google.setCustomParameters({ prompt: "select_account" });
      const { user } = await authSDK.signInWithPopup(auth, google);
      const token = await user.getIdTokenResult(true);
      setSession(user, token.claims.admin === true);
    },
    async signIn(email, password) {
      const { user } = await authSDK.signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const token = await user.getIdTokenResult(true);
      setSession(user, token.claims.admin === true);
    },
    async signUp(email, password) {
      const { user } = await authSDK.createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      setSession(user, false);
      await authSDK.sendEmailVerification(user);
    },
    verifyEmail: async () => {
      if (!auth.currentUser) throw new Error("Sign in first.");
      await authSDK.sendEmailVerification(auth.currentUser);
    },
    refreshUser: async () => {
      if (!auth.currentUser) return;
      await authSDK.reload(auth.currentUser);
      const token = await auth.currentUser.getIdTokenResult(true);
      setSession(auth.currentUser, token.claims.admin === true);
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
  let accountUid,
    accountAdmin,
    accountGeneration = 0,
    profileGeneration = 0;
  let stopAccount = () => {},
    stopRequests = () => {};
  const stopAccountSync = subscribeAuth(({ user, admin }) => {
    if (accountUid === user?.uid && accountAdmin === admin) return;
    accountUid = user?.uid;
    accountAdmin = admin;
    const generation = ++accountGeneration;
    ++profileGeneration;
    stopAccount();
    stopRequests();
    clearAccount();
    if (!user) return;
    stopAccount = dbSDK.onSnapshot(
      dbSDK.doc(db, `${LEAGUE_PATH}/accounts/${encodeURIComponent(user.uid)}`),
      async (snapshot) => {
        if (generation !== accountGeneration) return;
        const account = snapshot.data() || null;
        const profileRevision = ++profileGeneration;
        updateAccount({ loaded: true, account, profile: null, error: null });
        if (account?.playerKey) {
          try {
            const { data: profile } = await accountCall({ action: "profile" });
            if (
              generation === accountGeneration &&
              profileRevision === profileGeneration
            )
              updateAccount({ profile });
          } catch (error) {
            if (
              generation === accountGeneration &&
              profileRevision === profileGeneration
            )
              updateAccount({ error: error.message });
          }
        }
      },
      (error) => {
        if (generation === accountGeneration)
          updateAccount({ loaded: true, error: error.message });
      },
    );
    if (admin)
      stopRequests = dbSDK.onSnapshot(
        dbSDK.query(
          dbSDK.collection(db, `${LEAGUE_PATH}/accounts`),
          dbSDK.where("status", "==", "pending"),
        ),
        (snapshot) => {
          if (generation === accountGeneration)
            updateAccount({ requests: snapshot.docs.map((doc) => doc.data()) });
        },
        (error) => {
          if (generation === accountGeneration)
            updateAccount({ error: error.message });
        },
      );
  });
  let authRevision = 0;
  let tokenUser;
  authSDK.onIdTokenChanged(auth, async (user) => {
    const revision = ++authRevision;
    // Refresh restored sessions once; refreshing emits another token event.
    const forceRefresh = !!user && tokenUser !== user;
    tokenUser = user;
    try {
      const admin = user
        ? (await user.getIdTokenResult(forceRefresh)).claims.admin === true
        : false;
      if (revision === authRevision) setSession(user, admin);
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
    stopAccount();
    stopRequests();
    stopAuthSync();
    sync.stop();
  };
}
