import {LEAGUE_PATH,safeId} from './schema.js';
import {normalizeGame} from './game-model.js';
import {DEFAULT_STATE} from './sync.js';

// Subscribe to participants and timer for the selected game only. Each callback
// publishes the affected slice, rather than rebuilding all league data.
export function connectNativeSync(store,sdk,db,onError) {
  const stops=new Map(), tokens=new Map(), waiting=new Set();
  let stopped=false,ready=false,admin=false,selected,publicPlayers={},contacts={};
  let resolveReady,rejectReady;
  const initialized=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const finish=()=>{if(!ready && !waiting.size && !stopped){ready=true;resolveReady();}};
  const remove=key=>{stops.get(key)?.();stops.delete(key);tokens.delete(key);waiting.delete(key);};
  const listen=(key,reference,callback)=>{
    remove(key);const token={};tokens.set(key,token);waiting.add(key);
    stops.set(key,sdk.onSnapshot(reference,snapshot=>{
      if(stopped || tokens.get(key)!==token)return;
      waiting.delete(key);callback(snapshot);finish();
    },error=>{if(tokens.get(key)!==token)return;waiting.delete(key);if(!ready)rejectReady(error);onError(error);finish();}));
  };
  const playersChanged=()=>store.applyRemote('players',Object.fromEntries(Object.entries(publicPlayers).map(([key,p])=>[key,{...p,...contacts[key]}])));
  const select=id=>{
    if(selected===id)return;selected=id;
    remove('attendance');remove('timer');
    store.applySnapshot({activeGameId:id,attendance:[],timerState:DEFAULT_STATE.timerState,levelOverrides:{}});
    if(!id)return;
    listen('attendance',sdk.collection(db,`${LEAGUE_PATH}/games/${safeId(id)}/participants`),snapshot=>store.applyRemote('attendance',snapshot.docs.map(d=>d.data().checkIn).filter(Boolean)));
    listen('timer',sdk.doc(db,`${LEAGUE_PATH}/games/${safeId(id)}/runtime/timer`),snapshot=>{
      const value=snapshot.data() || {};
      store.applySnapshot({timerState:value.timerState || DEFAULT_STATE.timerState,levelOverrides:value.levelOverrides || {}});
    });
  };
  listen('players',sdk.collection(db,`${LEAGUE_PATH}/players`),snapshot=>{publicPlayers=Object.fromEntries(snapshot.docs.map(d=>[d.data().key,d.data()]));playersChanged();});
  listen('series',sdk.collection(db,`${LEAGUE_PATH}/series`),snapshot=>store.applyRemote('seriesList',snapshot.docs.map(d=>d.data())));
  listen('games',sdk.collection(db,`${LEAGUE_PATH}/games`),snapshot=>store.applyRemote('gameList',snapshot.docs.map(d=>normalizeGame(d.data())).filter(g=>g.scheduled!==false)));
  // History still feeds the existing ranking/statistics model; its redesign is separate.
  listen('history',sdk.collection(db,`${LEAGUE_PATH}/history`),snapshot=>store.applyRemote('history',snapshot.docs.map(d=>d.data()).sort((a,b)=>a._order-b._order)));
  listen('settings',sdk.doc(db,`${LEAGUE_PATH}/settings/current`),snapshot=>select(snapshot.data()?.activeGameId ?? null));
  return {
    initialized,
    setAdmin(value) {
      if(admin===value)return;admin=value;remove('contacts');contacts={};playersChanged();
      if(admin)listen('contacts',sdk.collection(db,`${LEAGUE_PATH}/playerContacts`),snapshot=>{
        contacts=Object.fromEntries(snapshot.docs.map(d=>[decodeURIComponent(d.id.slice(2)),d.data()]));playersChanged();
      });
    },
    stop(){stopped=true;for(const key of [...stops.keys()])remove(key);},
  };
}
