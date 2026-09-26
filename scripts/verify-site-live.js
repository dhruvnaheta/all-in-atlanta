import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('aia_players','{"legacyPrivateContact":"cleanup-test"}'));
 await page.goto(`https://allinatlanta.com/?migration-check=${Date.now()}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!document.querySelector('script[type="module"][src="js/main.js"]'));
 await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('aia_v2_players') || '{}')).length===231);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('aia_v2_history') || '[]').length===29);
 const summary=await page.evaluate(async()=>{
  const players=JSON.parse(localStorage.getItem('aia_v2_players'));
  return {players:Object.keys(players).length,history:JSON.parse(localStorage.getItem('aia_v2_history') || '[]').length,points:Object.values((await import('/js/state.js')).getPlayers()).reduce((sum,p)=>sum+p.total,0),privateFieldsPresent:Object.values(players).some(p=>['email','phone','recoveryNote'].some(k=>k in p)),legacyCachePresent:localStorage.getItem('aia_players')!==null};
 });
 if(summary.points!==541 || summary.history!==29 || summary.privateFieldsPresent || summary.legacyCachePresent)throw new Error('Live data reconciliation or privacy check failed.');
 await page.locator('#adminNavBtn').click();
 if(!await page.locator('#loginEmail').isVisible())throw new Error('Administrator sign-in form is unavailable.');
 if(errors.length)throw new Error(`Browser errors: ${errors.join('; ')}`);
 console.log('Live website verified:',JSON.stringify(summary));
 for(const path of ['/backend/index.js','/scripts/provision-admins.js','/backups/admin-setup-2026-09-26.md']) {
  const response=await fetch('https://allinatlanta.com'+path);
  if(response.status!==404)throw new Error(`Unexpected public artifact: ${path} (${response.status})`);
 }
 console.log('Backend sources, deployment scripts, and private setup links are excluded from Pages.');
} finally {await browser.close();}
