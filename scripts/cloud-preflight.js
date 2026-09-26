import {adminDatabase} from './admin-db.js';
const {app,db}=await adminDatabase('all-in-atlanta-pok',true);
const {access_token}=await app.options.credential.getAccessToken();
for (const [name,url] of Object.entries({billing:'https://cloudbilling.googleapis.com/v1/projects/all-in-atlanta-pok/billingInfo',auth:'https://identitytoolkit.googleapis.com/admin/v2/projects/all-in-atlanta-pok/config'})) {
 const response=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`}});const data=await response.json();
 console.log(name,response.status,name==='billing' ? {billingEnabled:data.billingEnabled,error:data.error?.message} : {configured:response.ok,error:data.error?.message});
}
await db.terminate();
