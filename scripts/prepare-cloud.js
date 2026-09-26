// Enable only deployment prerequisites; this does not deploy code or change rules/data.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {adminDatabase} from './admin-db.js';
const project='all-in-atlanta-pok';
const directory=process.argv[2];
if (!directory) throw new Error('Usage: node scripts/prepare-cloud.js PRIVATE_BACKUP_DIRECTORY');
const {app,db}=await adminDatabase(project,true);
const {access_token}=await app.options.credential.getAccessToken();
async function request(url,method='GET',body) {
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
  const data=await response.json();
  if(!response.ok)throw new Error(`${response.status}: ${data.error?.message || 'Cloud API request failed'}`);
  return data;
}
const billing=await request(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`);
if(!billing.billingEnabled)throw new Error('Billing must be enabled first.');
await mkdir(directory,{recursive:true,mode:0o700});
const release=await request(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
const ruleset=await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
await writeFile(resolve(directory,'deployed-rules.json'),JSON.stringify({release,ruleset},null,2),{flag:'wx',mode:0o600});
console.log('Saved deployed Firestore rules for rollback.');
const services=['cloudfunctions.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','run.googleapis.com'];
let operation=await request(`https://serviceusage.googleapis.com/v1/projects/${project}/services:batchEnable`,'POST',{serviceIds:services});
for(let attempt=0;!operation.done && attempt<60;attempt++) {
 await new Promise(resolve=>setTimeout(resolve,1000));
 operation=await request(`https://serviceusage.googleapis.com/v1/${operation.name}`);
}
if(operation.error)throw new Error(operation.error.message);
if(!operation.done)throw new Error('API enablement is still running; check the service state before deploying.');
console.log('Required Functions, Build, Artifact Registry, and Cloud Run APIs are enabled.');
await db.terminate();
