// Read-only probes: anonymous admin calls must fail; the public probe uses a
// deliberately nonexistent game so it cannot modify league data.
const base='https://us-central1-all-in-atlanta-pok.cloudfunctions.net/';
for (const name of ['finalizeResults','saveLeagueChanges','manageLeague','playerCheckIn']) {
 const response=await fetch(base+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:name==='playerCheckIn' ? {action:'checkIn',key:'deployment-probe',gameId:'__nonexistent_deployment_probe__'} : {}})});
 const body=await response.json();
 const expected=name==='playerCheckIn' ? 'FAILED_PRECONDITION' : 'PERMISSION_DENIED';
 if(body.error?.status!==expected)throw new Error(`${name}: expected ${expected}, got ${body.error?.status || response.status}`);
 console.log(`${name}: ${expected} confirmed.`);
}
