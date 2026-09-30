// Read-only business-data verification and authenticated HTTP smoke checks.
// Login/profile reads append normal audit entries; no business fixtures/messages.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import nextEnv from '@next/env';
import {safeError} from './postgres-env.mjs';
nextEnv.loadEnvConfig(process.cwd(),false);
const client=new PrismaClient();const results=[];let server;let logs='';
const check=(name,passed)=>{results.push({name,passed:!!passed});console.log(`${passed?'PASS':'FAIL'} ${name}`);if(!passed)throw new Error(name);};
try{
 const snapshot=JSON.parse(readFileSync(process.argv[2],'utf8'));
 for(const [table,rows] of Object.entries(snapshot.tables)){
  if(!rows.length)continue;
  const quote=x=>'"'+x.replaceAll('"','""')+'"';const fields=Object.keys(JSON.parse(rows[0])).map(quote).join(',');
  const exclude=table==='Customer'?" - 'phone' - 'followUpAt'":'';
  const query=`SELECT count(*)::int AS count, bool_and((to_jsonb(actual)${exclude})=(expected${exclude})) AS same FROM jsonb_array_elements($1::jsonb) AS expected JOIN (SELECT ${fields} FROM ${quote(table)}) actual ON actual.id=expected->>'id'`;
  const compared=await client.$queryRawUnsafe(query,'['+rows.join(',')+']');check(`Hosted original records preserved: ${table}`,compared[0].count===rows.length&&compared[0].same);
 }
 check('Unified student and event identities',await client.student.count({where:{customerId:null}})===0&&await client.eventLead.count({where:{customerId:null}})===0);
 const ledger=await client.$queryRaw`SELECT count(*)::int AS invalid FROM "Invoice" i WHERE i."paidAmount"<>(SELECT COALESCE(sum(CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END),0) FROM "Payment" p WHERE p."invoiceId"=i.id AND p."voidedAt" IS NULL)`;
 check('Every hosted invoice reconciles to payment ledger',ledger[0].invalid===0);
 const primary=await client.user.findFirst({where:{role:'GOD',active:true},select:{username:true}});if(!primary||!process.env.ESAMJ_PASSWORD)throw new Error('Configured migrated login credentials unavailable');
 const base='http://localhost:3309';server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3309'],{env:{...process.env,NODE_ENV:'production'},windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}check('Hosted-connected app starts',ready);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:primary.username,password:process.env.ESAMJ_PASSWORD})});check('Migrated God Mode account login',login.ok);
 const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Session cookie missing');
 for(const path of ['/','/api/crm/dashboard','/api/crm/customers','/api/crm/tasks','/api/crm/students','/api/crm/eventLeads','/api/crm/invoices','/api/crm/payments','/api/crm/products','/api/crm/users'])check(`Hosted smoke ${path}`,(await fetch(base+path,{headers:{Cookie:cookie}})).ok);
 for(const section of ['salon','college','events','inventory','staff'])check(`Hosted reference screen ${section}`,(await fetch(`${base}/api/crm/section-summary?section=${section}`,{headers:{Cookie:cookie}})).ok);
 console.log(`Hosted smoke passed: ${results.length} checks.`);
}catch(e){console.error(safeError(e,process.env));process.exitCode=1;}
finally{server?.kill();await client.$disconnect();writeFileSync('audit-results/crm-hosted-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));}
