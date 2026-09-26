import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {LEAGUE_PATH} from '../js/schema.js';
test('counter cleanup backs up originals and preserves profile metadata and game results', async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo emulator required');
  const app=initializeApp({projectId:'demo-all-in-atlanta'}, 'stats-cleanup');
  const db=getFirestore(app);
  try {
    await db.recursiveDelete(db.doc(LEAGUE_PATH));
    const profile={key:'a',dn:'A',registered:'Sep 1, 2026',total:999,month:4,games:77,gameDates:[{gameId:'phantom'}]};
    const result={gameId:'g',date:'Sep 24, 2026',results:[{key:'a',pos:1,pts:25}]};
    await db.doc(`${LEAGUE_PATH}/players/p_a`).set(profile);
    await db.doc(`${LEAGUE_PATH}/history/g`).set(result);
    const directory=await mkdtemp(join(tmpdir(),'aia-stats-cleanup-'));
    await promisify(execFile)(process.execPath,['scripts/audit-stats.js','demo-all-in-atlanta',directory,'--remove-counters'],{env:process.env});
    const backup=JSON.parse(await readFile(join(directory,'source.json'),'utf8'));
    assert.deepEqual(backup.players[0].data,profile);
    assert.deepEqual((await db.doc(`${LEAGUE_PATH}/players/p_a`).get()).data(),{key:'a',dn:'A',registered:'Sep 1, 2026'});
    assert.deepEqual((await db.doc(`${LEAGUE_PATH}/history/g`).get()).data(),result);
  } finally {await db.terminate();await deleteApp(app);}
});
