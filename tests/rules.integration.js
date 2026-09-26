import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {savePatches,checkIn,finalizeGame} from '../backend/operations.js';
import {leagueCommand} from '../backend/commands.js';
import {advanceTimer,remainingTime} from '../js/timer.js';
import {LEAGUE_PATH as root} from '../js/schema.js';
let env,app,db;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-all-in-atlanta',firestore:{rules:await readFile('firestore.rules','utf8')}});
  app=initializeApp({projectId:'demo-all-in-atlanta'},'integration');db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
  await env.clearFirestore();
  await db.doc(`${root}/operations/control`).set({writesEnabled:true,published:true});
  await db.doc(`${root}/settings/current`).set({activeGameId:'g'});
  await db.doc(`${root}/games/g`).set({id:'g',name:'Test',date:'Sep 24, 2026',seriesId:'s',status:'running',registrationOpen:true,scheduled:true});
  await db.doc(`${root}/series/s`).set({id:'s',name:'Series',day:4});
  await db.doc(`${root}/players/p_alice`).set({key:'alice',dn:'Alice',total:10,games:2,month:0});
  await db.doc(`${root}/playerContacts/p_alice`).set({email:'private@example.com'});
});
const command=(action,fields={},now)=>leagueCommand(db,{action,expectedActiveGameId:'g',...fields},now);
test('public read boundaries and all direct client writes remain protected',async()=>{
  const anonymous=env.unauthenticatedContext().firestore(),admin=env.authenticatedContext('admin',{admin:true}).firestore();
  await assertSucceeds(getDocs(collection(anonymous,`${root}/players`)));
  await assertFails(getDoc(doc(anonymous,`${root}/playerContacts/p_alice`)));
  await assertSucceeds(getDoc(doc(admin,`${root}/playerContacts/p_alice`)));
  for(const client of [anonymous,admin])await assertFails(setDoc(doc(client,`${root}/players/p_alice`),{total:999}));
  await assertFails(getDoc(doc(anonymous,'aia/adminpw')));
});
test('public removal is rejected and administrator removal preserves the participant record',async()=>{
  await checkIn(db,{gameId:'g',action:'checkIn',key:'alice'});
  await assert.rejects(checkIn(db,{gameId:'g',action:'remove',key:'alice'}),/Administrator/);
  await checkIn(db,{gameId:'g',action:'remove',key:'alice'},new Date(),{admin:true});
  assert.equal((await db.doc(`${root}/games/g/participants/p_alice`).get()).data().checkIn,null);
});
test('closing registration keeps the game running and blocks public check-in on the server',async()=>{
  await command('closeRegistration');
  const game=(await db.doc(`${root}/games/g`).get()).data();
  assert.equal(game.status,'running');assert.equal(game.registrationOpen,false);
  await assert.rejects(checkIn(db,{gameId:'g',action:'checkIn',key:'alice'}),/not open/);
  await command('openRegistration');await checkIn(db,{gameId:'g',action:'checkIn',key:'alice'});
  await assert.rejects(savePatches(db,{patches:[{path:'games/g',before:{status:'running'},after:{status:'scheduled'}}]}),/dedicated/);
});
test('launch and activation are atomic, duplicate launch is rejected, and stale commands fail',async()=>{
  const result=await command('launchGame',{seriesId:'s',date:'2026-09-24'});
  const active=(await db.doc(`${root}/settings/current`).get()).data().activeGameId;
  assert.equal(active,result.activeGameId);assert.equal((await db.doc(`${root}/games/${active}`).get()).data().status,'scheduled');
  await assert.rejects(command('closeRegistration'),/active game changed/);
  await assert.rejects(leagueCommand(db,{action:'launchGame',seriesId:'s',date:'2026-09-24',expectedActiveGameId:active}),/already exists/);
  await leagueCommand(db,{action:'start',expectedActiveGameId:active});
  assert.equal((await db.doc(`${root}/games/${active}`).get()).data().registrationOpen,true);
});
test('timer commands use server timestamps, catch up after reload, and reject stale revisions',async()=>{
  const start=await command('timer',{operation:'start',revision:0},new Date(1000000));
  assert.equal(start.timerState.levelStartTs,1000000);
  const paused=await command('timer',{operation:'pause',revision:1},new Date(1000000+31*60000));
  assert.equal(paused.timerState.levelIdx,2);assert.equal(paused.timerState.pausedRemaining,14*60000);
  await assert.rejects(command('timer',{operation:'reset',revision:1}),/changed on another device/);
  const resumed=await command('timer',{operation:'start',revision:2},new Date(5000000));
  const projected=advanceTimer(resumed.timerState,Array(17).fill(15*60000),5000000+60000);
  assert.equal(remainingTime(projected,15*60000,5000000+60000),13*60000);
});
test('concurrent timer control allows one change and rejects the competing revision',async()=>{
  const results=await Promise.allSettled(['start','reset'].map(operation=>command('timer',{operation,revision:0})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('concurrent check-ins and result submissions retain attendance and award points once',async()=>{
  await Promise.all(['alice','bob'].map(key=>checkIn(db,{gameId:'g',action:'checkIn',key,profile:{dn:key}})));
  const receipts=await Promise.all([1,2].map(()=>finalizeGame(db,{gameId:'g',positions:{alice:1,bob:2}})));
  assert.equal(receipts.filter(r=>r.alreadyFinalized).length,1);
  assert.equal((await db.doc(`${root}/players/p_alice`).get()).data().total,35);
  assert.equal((await db.doc(`${root}/games/g`).get()).data().status,'completed');
  await assert.rejects(command('start'),/scheduled/);
  await assert.rejects(command('timer',{operation:'start',revision:0}),/not running/);
});
test('deleting a player clears contacts and live attendance together while preserving results',async()=>{
  await db.doc(`${root}/games/g/participants/p_alice`).set({key:'alice',checkIn:{key:'alice'},results:{old:{pts:25}}});
  await command('deletePlayer',{key:'alice'});
  assert.equal((await db.doc(`${root}/players/p_alice`).get()).exists,false);
  assert.equal((await db.doc(`${root}/playerContacts/p_alice`).get()).exists,false);
  const participant=(await db.doc(`${root}/games/g/participants/p_alice`).get()).data();
  assert.equal(participant.checkIn,null);assert.equal(participant.results.old.pts,25);
});
test('wipe clears the whole league atomically; oversized and maintenance operations do not partially delete',async()=>{
  await db.doc(`${root}/history/h`).set({results:[]});
  await command('wipeAll');
  for(const name of ['games','players','playerContacts','history','series'])assert.equal((await db.collection(`${root}/${name}`).get()).size,0);
  assert.equal((await db.doc(`${root}/settings/current`).get()).data().activeGameId,null);
  const batch=db.batch();for(let i=0;i<491;i++)batch.set(db.doc(`${root}/players/p_${i}`),{key:String(i)});await batch.commit();
  await assert.rejects(leagueCommand(db,{action:'clearPlayers',expectedActiveGameId:null}),/too large/);
  assert.equal((await db.collection(`${root}/players`).get()).size,491);
  await db.doc(`${root}/operations/control`).update({writesEnabled:false});
  await assert.rejects(leagueCommand(db,{action:'clearPlayers'}),/maintenance/);
});
