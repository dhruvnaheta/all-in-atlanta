import test from 'node:test';
import assert from 'node:assert/strict';
import {convertBackup} from '../scripts/convert-backup.js';
import {documentPatches, playerId} from '../js/schema.js';
const backup = () => ({project:'test',documents:Object.entries({players:{'a/b':{key:'a/b',dn:'Alice',email:'private@example.com',phone:'123',recoveryNote:'private',total:91,games:7,legacyAttendanceBackfillV1:{gamesAdded:3}}},gameList:[{id:'g',state:'idle',tonight:[]}],seriesList:[],history:[{date:'May 22, 2026',results:[{key:'a/b',pts:1}]}],attendance:{old:{gameId:'old',date:'May 22, 2026',players:{'a/b':{checkedInAt:0}}}},activeGameId:'g',adminpw:'must-not-migrate'}).map(([key,value]) => ({name:`projects/test/databases/(default)/documents/aia/${key}`,fields:{v:{stringValue:JSON.stringify(value)}}}))});
test('conversion preserves totals, private fields, unmatched attendance and deterministic history', () => {
  const first=convertBackup(backup()),second=convertBackup(backup());
  assert.deepEqual(first,second);
  const player=first.documents[`players/${playerId('a/b')}`];
  assert.equal(player.total,91);assert.equal(player.games,7);assert.equal(player.email,undefined);assert.equal(player.recoveryNote,undefined);
  assert.equal(first.documents[`playerContacts/${playerId('a/b')}`].email,'private@example.com');
  assert.equal(first.report.history,1);assert.equal(first.report.attendance,1);
  assert.ok(first.documents['games/legacy_history_0000']);assert.ok(first.documents['games/old']);
  assert.ok(!JSON.stringify(first).includes('must-not-migrate'));
});
test('player edits only patch changed fields and do not clear unseen private contacts', () => {
  const before={alice:{key:'alice',dn:'Alice',total:10},bob:{key:'bob',total:5}};
  const after=structuredClone(before);after.alice.dn='New name';
  assert.deepEqual(documentPatches('players',before,after,{}),[{path:'players/p_alice',before:{dn:'Alice'},after:{dn:'New name'}}]);
});
test('removing check-in preserves historical participant data', () => {
  assert.deepEqual(documentPatches('tonight',[{key:'alice',time:'8:00 PM'}],[],{activeGameId:'g'}),[{path:'games/g/participants/p_alice',before:{checkIn:{key:'alice',time:'8:00 PM'}},after:{checkIn:null}}]);
});
