import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {convertBackup,readVerifiedBackup} from '../scripts/convert-backup.js';
import {createStore} from '../js/store.js';
import {connectNativeSync} from '../js/native-sync.js';
import {LEAGUE_PATH} from '../js/schema.js';
const source=process.env.BACKUP_FILE;
test('full backup imports, reconciles, and hydrates the existing views without private data', {skip:!source,timeout:90000},async () => {
  const {backup}=await readVerifiedBackup(source);
  const converted=convertBackup(backup);
  const env=await initializeTestEnvironment({projectId:'demo-all-in-atlanta',firestore:{rules:await readFile('firestore.rules','utf8')}});
  const app=initializeApp({projectId:'demo-all-in-atlanta'},'backup');const db=getFirestore(app);
  let sync;
  try {
    await env.clearFirestore();
    const entries=Object.entries(converted.documents);
    for (let i=0;i<entries.length;i+=400) {
      const batch=db.batch();for (const [path,data] of entries.slice(i,i+400)) batch.set(db.doc(`${LEAGUE_PATH}/${path}`),data);await batch.commit();
    }
    await db.doc(`${LEAGUE_PATH}/operations/control`).set({published:true,writesEnabled:true});
    const errors=[];const cache=new Map();
    const store=createStore({getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)});
    sync=connectNativeSync(store,sdk,env.unauthenticatedContext().firestore(),e=>errors.push(e));
    await sync.initialized;
    assert.equal(Object.keys(store.get('players')).length,converted.report.players);
    assert.equal(store.get('history').length,converted.report.history);
    assert.equal(store.get('gameList').length,converted.report.scheduledGames);
    assert.equal(store.get('seriesList').length,converted.report.series);
    assert.equal(Object.values(store.get('players')).reduce((sum,p)=>sum+p.total,0),converted.report.totals.total);
    assert.ok(Object.values(store.get('players')).every(p=>!('email' in p) && !('phone' in p) && !('recoveryNote' in p)));
    assert.equal(errors.length,0);
    sync.stop();
    sync=connectNativeSync(store,sdk,env.authenticatedContext('admin',{admin:true}).firestore(),e=>errors.push(e));
    sync.setAdmin(true);await sync.initialized;
    assert.ok(Object.values(store.get('players')).some(p=>p.email));
    assert.ok(!cache.get('aia_v2_players').includes('"email"'));
    sync.setAdmin(false);
    assert.ok(Object.values(store.get('players')).every(p=>!('email' in p)));
    assert.equal(errors.length,0);
  } finally {sync?.stop();await db.terminate();await deleteApp(app);await env.cleanup();}
});
