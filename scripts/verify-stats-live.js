import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`https://allinatlanta.com/?stats-check=${Date.now()}`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{globalThis.statsModules={state:await import('/js/state.js'),store:await import('/js/store.js')};});
  await page.waitForFunction(()=>Object.keys(globalThis.statsModules.state.getPlayers()).length===231 && globalThis.statsModules.state.getHistory().length===29);
  const summary=await page.evaluate(()=>{
    const stats=globalThis.statsModules.state.getLeagueStats();
    const raw=globalThis.statsModules.store.LS.get('players');
    return {games:stats.totals.games,attendances:stats.totals.attendances,points:stats.totals.points,
      profilePoints:Object.values(stats.players).reduce((sum,p)=>sum+p.total,0),
      renderedGames:document.querySelector('#s-games').textContent,
      privateFields:Object.values(raw).some(p=>['email','phone','recoveryNote'].some(k=>k in p)),
      storedCounters:Object.values(raw).some(p=>'total' in p || 'gameDates' in p)};
  });
  assert.equal(summary.games,29);assert.equal(summary.attendances,537);assert.equal(summary.points,592);
  assert.equal(summary.profilePoints,541);assert.equal(summary.renderedGames,'29');assert.equal(summary.privateFields,false);
  if(process.argv.includes('--counters-removed')) assert.equal(summary.storedCounters,false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(summary));
} finally {await browser.close();}
