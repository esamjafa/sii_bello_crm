import {spawnSync} from 'node:child_process';
const url=new URL(process.env.AUDIT_DATABASE_URL??'http://missing');
if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/audit_'))throw new Error('Set AUDIT_DATABASE_URL to a disposable local audit_* PostgreSQL database. For the Windows migration rehearsal use npm run test:crm -- --snapshot <snapshot.json>.');
const env={...process.env,DATABASE_URL:url.toString(),DIRECT_URL:url.toString()};
for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['scripts/crm-regression.mjs']]){
 const result=spawnSync(process.execPath,args,{env,stdio:'inherit',windowsHide:true});
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
