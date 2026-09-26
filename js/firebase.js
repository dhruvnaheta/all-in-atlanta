import {configureCommands} from './commands.js';
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
  const emulator = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('emulator') === '1';
  const app = appSDK.initializeApp(emulator ? {...FIREBASE_CONFIG, projectId:'demo-all-in-atlanta'} : FIREBASE_CONFIG);
  const db = dbSDK.getFirestore(app);
  const auth = authSDK.getAuth(app);
  const functions = functionsSDK.getFunctions(app);
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    // Explicit opt-in keeps normal local development connected to production reads.
    if (new URLSearchParams(location.search).get('emulator') === '1') {
      dbSDK.connectFirestoreEmulator(db,'127.0.0.1',8080);
      authSDK.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
      functionsSDK.connectFunctionsEmulator(functions,'127.0.0.1',5001);
    }
  }
  const save = functionsSDK.httpsCallable(functions,'saveLeagueChanges');
  let queue = Promise.resolve();
  LS.connect({canWrite:isAdmin, write:(key,value,previous,context) => {
    const patches = documentPatches(key,previous,value,context);
    const operation = queue.then(() => save({patches,activeGameId:context.activeGameId}));
    queue = operation.catch(() => {});
    return operation;
  }});
  const sync = connectNativeSync(LS,dbSDK,db,onError);
  const stopAuthSync = subscribeAuth(({admin}) => sync.setAdmin(admin));
  configureAuth({
    async signIn(email, password) {
      const { user } = await authSDK.signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const token = await user.getIdTokenResult(true);
      if (token.claims.admin !== true) {
        await authSDK.signOut(auth);
        throw new Error("This account does not have administrator access.");
      }
      setSession(user, true);
    },
    signOut: () => authSDK.signOut(auth),
    resetPassword: (email) => authSDK.sendPasswordResetEmail(auth, email),
  });
  let authRevision = 0;
  authSDK.onIdTokenChanged(auth, async (user) => {
    const revision = ++authRevision;
    try {
      const admin = user
        ? (await user.getIdTokenResult()).claims.admin === true
        : false;
      if (revision === authRevision) setSession(user, admin);
    } catch (error) {
      if (revision === authRevision) setSession(null, false);
      onError(error);
    }
  });
  const manage=functionsSDK.httpsCallable(functions,'manageLeague');
  configureCommands(async request=>{
    if(!isAdmin())throw new Error('Administrator sign-in required.');
    const result=queue.then(()=>manage(request));queue=result.catch(()=>{});
    const {data}=await result;return data;
  });
  const checkIn = functionsSDK.httpsCallable(functions,'playerCheckIn');
  configureCheckIn(async request => {
    const {data} = await checkIn({...request,gameId:LS.get('activeGameId',null)});
    return data;
  });
  const finalize = functionsSDK.httpsCallable(functions,'finalizeResults');
  configureResults(async request => {
    if (!isAdmin()) throw new Error('Administrator sign-in required.');
    await queue;
    const {data} = await finalize(request);
    return data;
  });
  await sync.initialized;
  return () => {stopAuthSync();sync.stop();};
}
