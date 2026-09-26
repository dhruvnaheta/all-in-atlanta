import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const source=process.env.BACKUP_FILE;
test('migration CLI resumes the same import, verifies all documents, and refuses a published target',{skip:!source,timeout:120000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'aia-migration-'));
  try {
    await copyFile(source,join(directory,'firestore.json'));
    await copyFile(join(dirname(source),'SHA256SUMS'),join(directory,'SHA256SUMS'));
    const call=command=>run(process.execPath,['scripts/migrate-firestore.js',command,'demo-all-in-atlanta',directory],{env:process.env,maxBuffer:1024*1024});
    assert.match((await call('import')).stdout,/Imported 1336 documents/);
    assert.match((await call('import')).stdout,/Imported 1336 documents/);
    assert.match((await call('verify')).stdout,/Verified 1336 documents exactly/);
    assert.match((await call('publish')).stdout,/published and writable/);
    await assert.rejects(call('import'),/Target is live/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
