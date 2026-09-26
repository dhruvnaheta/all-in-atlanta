// Creates only explicitly supplied admin identities; generates local setup links.
// No email is sent and no existing account password is changed.
import {getAuth} from 'firebase-admin/auth';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {adminDatabase} from './admin-db.js';
const [projectId,output,...emails]=process.argv.slice(2);
if(!projectId || !output || !emails.length || emails.some(e=>!/^\S+@\S+\.\S+$/.test(e))) throw new Error('Usage: node scripts/provision-admins.js PROJECT PRIVATE_OUTPUT.md ADMIN_EMAIL...');
const {app,db}=await adminDatabase(projectId,true);
const auth=getAuth(app);
const rows=[];
for(const email of emails) {
  let user,created=false;
  try {user=await auth.getUserByEmail(email);}
  catch(error) {
    if(error.code!=='auth/user-not-found')throw error;
    user=await auth.createUser({email,password:randomBytes(36).toString('base64url')});
    created=true;
  }
  if(user.disabled) throw new Error(`Account ${email} is disabled; review it before granting access.`);
  await auth.setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
  const verified=await auth.getUser(user.uid);
  if(verified.customClaims?.admin!==true)throw new Error('Admin claim verification failed.');
  const link=await auth.generatePasswordResetLink(email);
  rows.push(`## ${email}\n\n[Set your administrator password](${link})\n\n${created ? 'New account created.' : 'Existing account retained; its password was not changed.'}\n`);
  console.log(`Administrator access verified for ${email}.`);
}
await mkdir(dirname(resolve(output)),{recursive:true,mode:0o700});
await writeFile(output,`# Private administrator setup links\n\nGenerated ${new Date().toISOString()}. These links grant password-setting access; share each link only with its named recipient. No emails were sent.\n\n${rows.join('\n')}`,{mode:0o600,flag:'wx'});
console.log(`Setup links saved privately to ${output}.`);
await db.terminate();
