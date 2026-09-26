import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {adminDatabase} from './admin-db.js';
import {convertBackup,readVerifiedBackup} from './convert-backup.js';
import {LEAGUE_PATH,equal} from '../js/schema.js';
const [command,projectId,directory,...flags] = process.argv.slice(2);
if (!['backup','import','verify','publish','pause'].includes(command) || !projectId || !directory) throw new Error('Usage: node scripts/migrate-firestore.js backup|import|verify|publish|pause PROJECT DIRECTORY [--firebase-cli-auth]');
const {db} = await adminDatabase(projectId,flags.includes('--firebase-cli-auth'));
const controlRef = db.doc(`${LEAGUE_PATH}/operations/control`);
if (command === 'backup') {
  const snapshot = await db.collection('aia').get();
  const documents = snapshot.docs.map(doc => {
    if (typeof doc.data().v !== 'string' || Object.keys(doc.data()).length !== 1) throw new Error('Unexpected legacy document shape.');
    return {name:`projects/${projectId}/databases/(default)/documents/${doc.ref.path}`,fields:{v:{stringValue:doc.data().v}},createTime:doc.createTime.toDate().toISOString(),updateTime:doc.updateTime.toDate().toISOString()};
  });
  const backup = {format:'aia-firestore-rest-backup-v1',project:projectId,database:'(default)',readTime:snapshot.readTime.toDate().toISOString(),collections:['aia'],excludedCollections:['aia_backups'],documents};
  await mkdir(directory,{recursive:true,mode:0o700});
  const content = JSON.stringify(backup,null,2);
  await writeFile(resolve(directory,'firestore.json'),content,{mode:0o600,flag:'wx'});
  await writeFile(resolve(directory,'SHA256SUMS'),`${createHash('sha256').update(content).digest('hex')}  firestore.json\n`,{mode:0o600,flag:'wx'});
  console.log(`Backed up ${documents.length} legacy documents to ${directory}`);
} else if (command === 'pause') {
  await controlRef.set({writesEnabled:false},{merge:true});
  console.log('V2 writes paused. Legacy rules must separately deny writes before taking a cutover snapshot.');
} else {
  const {backup,checksum} = await readVerifiedBackup(resolve(directory,'firestore.json'));
  if (!process.env.FIRESTORE_EMULATOR_HOST && backup.project !== projectId) throw new Error('Backup project mismatch.');
  const plan = convertBackup(backup);
  const control = (await controlRef.get()).data();
  if (command === 'import') {
    // A resumed import may only continue the same unpublished immutable plan.
    if (control?.published || control?.writesEnabled || (control?.sourceChecksum && control.sourceChecksum !== checksum)) throw new Error('Target is live or belongs to another migration.');
    if (!control?.sourceChecksum) {
      const existing = await db.doc(LEAGUE_PATH).listCollections();
      for (const collection of existing) if (collection.id !== 'operations' && !(await collection.limit(1).get()).empty) throw new Error('Target contains data without a matching migration manifest.');
      await controlRef.set({sourceChecksum:checksum,published:false,writesEnabled:false,status:'importing'});
    }
    const entries = Object.entries(plan.documents);
    for (let start=0;start<entries.length;start+=400) {
      const batch = db.batch();
      for (const [path,data] of entries.slice(start,start+400)) batch.set(db.doc(`${LEAGUE_PATH}/${path}`),data);
      await batch.commit();
    }
    await controlRef.update({status:'imported',documentCount:entries.length});
    await writeFile(resolve(directory,'migration-report.json'),JSON.stringify(plan.report,null,2),{mode:0o600});
    console.log(`Imported ${entries.length} documents; target remains unpublished and writes disabled.`);
  } else {
    if (control?.sourceChecksum !== checksum) throw new Error('Migration checksum does not match target.');
    if (control?.writesEnabled) throw new Error('Pause writes before snapshot verification.');
    const entries = Object.entries(plan.documents);
    for (let start=0;start<entries.length;start+=200) {
      const chunk=entries.slice(start,start+200);
      const docs=await db.getAll(...chunk.map(([path]) => db.doc(`${LEAGUE_PATH}/${path}`)));
      for (const [i,doc] of docs.entries()) if (!doc.exists || !equal(doc.data(),chunk[i][1])) throw new Error(`Verification failed: ${chunk[i][0]}`);
    }
    // Count recursively, including subcollections whose parent documents are absent.
    async function count(ref) {
      let total=0;
      for (const collection of await ref.listCollections()) {
        if (ref.path === LEAGUE_PATH && collection.id === 'operations') continue;
        for (const doc of await collection.listDocuments()) {
          if ((await doc.get()).exists) total++;
          total += await count(doc);
        }
      }
      return total;
    }
    const countActual=await count(db.doc(LEAGUE_PATH));
    if (countActual !== entries.length) throw new Error(`Unexpected target documents: expected ${entries.length}, found ${countActual}`);
    await controlRef.update({status:'verified',verifiedAt:new Date().toISOString()});
    console.log(`Verified ${entries.length} documents exactly, including private contacts and attendance.`);
    if (command === 'publish') {
      await controlRef.update({published:true,writesEnabled:true,status:'live'});
      console.log('V2 is published and writable.');
    }
  }
}
await db.terminate();
