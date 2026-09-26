import {adminDatabase} from './admin-db.js';
import {getAuth} from 'firebase-admin/auth';
const {app,db}=await adminDatabase('all-in-atlanta-pok',true);
const docs=await db.collection('aia').get();
console.log('Legacy documents:',docs.size);
const active=docs.docs.find(d=>d.id==='activeGameId');
const games=docs.docs.find(d=>d.id==='gameList');
if(active && games) {
  const game=JSON.parse(games.data().v).find(g=>g.id===JSON.parse(active.data().v));
  console.log('Active game status:',game?.state,'check-ins:',game?.tonight?.length || 0);
}
try {
 const users=await getAuth(app).listUsers(1000);
 console.log('Auth users:',users.users.length,'admin users:',users.users.filter(u=>u.customClaims?.admin===true).length);
} catch(error) {console.log('Auth preflight:',error.code);}
await db.terminate();
