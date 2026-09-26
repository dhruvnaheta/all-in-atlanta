import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
export async function adminDatabase(projectId,cliAuth = false) {
  let credential;
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    credential = applicationDefault();
    if (cliAuth) {
      const globalRoot = execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
      const require = createRequire(join(globalRoot,'firebase-tools','package.json'));
      const {getAccessToken} = require('./lib/auth.js');
      const config = JSON.parse(await readFile(join(homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
      const refresh = config.tokens?.refresh_token;
      if (!refresh) throw new Error('Firebase CLI sign-in is required.');
      credential = {async getAccessToken() {
        const token = await getAccessToken(refresh,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
        return {access_token:token.access_token,expires_in:3600};
      }};
    }
  } else if (!projectId.startsWith('demo-')) throw new Error('Use a demo project with the emulator.');
  const app = initializeApp({projectId,...(credential ? {credential} : {})});
  if (cliAuth && !process.env.FIRESTORE_EMULATOR_HOST) {
    const client = new OAuth2Client();
    client.getRequestHeaders = async () => {
      const token = await credential.getAccessToken();
      // Firestore 7 / google-gax 4 expects a plain header map (Auth v9 contract).
      return {Authorization:`Bearer ${token.access_token}`};
    };
    return {app,db:new Firestore({projectId,authClient:client})};
  }
  return {app,db:getFirestore(app)};
}
