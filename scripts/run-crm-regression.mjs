import { spawnSync } from 'node:child_process';
import { mkdirSync,writeFileSync,readFileSync,copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as LegacyClient } from '../generated/postgresql/index.js';
const directory=resolve('audit-results',`crm-${Date.now()}`);mkdirSync(directory,{recursive:true});
const binary=n=>resolve('audit-results/postgres-validation/node_modules/@embedded-postgres/windows-x64/native/bin',`${n}.exe`);
const password=randomBytes(24).toString('hex');const passwordFile=resolve(directory,'password.txt');writeFileSync(passwordFile,password);
const data=resolve(directory,'pgdata');const url=`postgresql://crm_test:${password}@127.0.0.1:55440/postgres?schema=public`;
const env={...process.env,POSTGRES_ENV_FILE:'',POSTGRES_REHEARSAL:'true',DATABASE_URL:url,DIRECT_URL:url,CRM_TEST_DIRECTORY:directory};
const report={startedAt:new Date().toISOString(),checks:[]};let started=false,client,old;
function run(command,args,timeout=240000){const pg=command.endsWith('pg_ctl.exe');const p=spawnSync(command,args,{env,encoding:'utf8',windowsHide:true,timeout,...(pg?{stdio:'ignore'}:{})});if(p.status!==0)throw new Error(`${args.join(' ')} failed: ${(p.stderr??'')+(p.stdout??'')}`.replaceAll(password,'[redacted]'));return p.stdout;}
const node=(...args)=>run(process.execPath,args);
try{
 run(binary('initdb'),['-D',data,'-U','crm_test','--pwfile',passwordFile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);started=true;
 run(binary('pg_ctl'),['-D',data,'-l',resolve(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55440','-w','start']);
 node('scripts/postgres.mjs','deploy');
 if(process.argv.includes('--snapshot')){
  const path=resolve(process.argv[process.argv.indexOf('--snapshot')+1]);const content=readFileSync(path,'utf8');const snapshot=JSON.parse(content);const manifest=JSON.parse(readFileSync(resolve(path,'..','manifest.json'),'utf8'));
  if(snapshot.format!=='postgres-json-text-v1'||createHash('sha256').update(content).digest('hex')!==manifest.sha256)throw new Error('Snapshot integrity check failed');
  const restore=new LegacyClient({datasources:{db:{url}}});
  const order=['Customer','Service','Staff','WorkingHour','BookingVerification','CollegeCourse','Student','Event','User','Appointment','Invoice','Expense','StudentEnrollment','StudentPayment','StudentContact','EventPackage','EventLead','EventContact','LaserPlan','LaserSession','LaserDocument','ServiceRequest','AuditLog','NotificationLog'];
  await restore.$transaction(async tx=>{for(const table of order)for(const row of snapshot.tables[table]??[])await tx.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`,row);},{timeout:120000});
  for(const table of order){const rows=await restore.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY id`);if(JSON.stringify(rows.map(x=>x.row))!==JSON.stringify(snapshot.tables[table]))throw new Error(`Restored snapshot differs: ${table}`);}
  await restore.$disconnect();report.checks.push({name:'Fresh hosted backup restored locally with exact scalar, decimal and document comparison',passed:true});
 }else{
  const backup=process.argv[process.argv.indexOf('--backup')+1];
  if(!process.argv.includes('--backup')||!backup)throw new Error('--backup or --snapshot required for migration preservation test');
  const source=resolve(directory,'source.db');copyFileSync(backup,source);copyFileSync(backup.replace(/\.db$/,'.manifest.json'),source.replace(/\.db$/,'.manifest.json'));
  node('scripts/transfer-postgres.mjs','--backup',source);
 }
 old=new LegacyClient({datasources:{db:{url}}});
 const models=['customer','service','staff','workingHour','bookingVerification','collegeCourse','student','event','user','appointment','invoice','expense','studentEnrollment','studentPayment','studentContact','eventPackage','eventLead','eventContact','laserPlan','laserSession','laserDocument','serviceRequest','auditLog','notificationLog'];
 const before={};for(const m of models)before[m]=await old[m].findMany({orderBy:{id:'asc'}});
 const originalPaid=before.invoice.reduce((s,x)=>s+Number(x.paidAmount),0)+before.studentPayment.reduce((s,x)=>s+Number(x.amount),0)+before.eventLead.reduce((s,x)=>s+Number(x.paidAmount),0);
 node('node_modules/prisma/build/index.js','migrate','deploy');
 const normalize=value=>{let phone=value.replace(/[^0-9]/g,'').replace(/^00/,'');return /^0[2-9]\d{7,8}$/.test(phone)?'972'+phone.slice(1):phone;};
 for(const m of models){const after=await old[m].findMany({where:{id:{in:before[m].map(x=>x.id)}},orderBy:{id:'asc'}});const expected=before[m].map(row=>{if(m!=='customer')return row;const phone=normalize(row.phone);const dates=[row.followUpAt,...before.student.filter(x=>normalize(x.phone)===phone).map(x=>x.followUpAt),...before.eventLead.filter(x=>normalize(x.phone)===phone).map(x=>x.followUpAt)].filter(Boolean);return {...row,phone,followUpAt:dates.length?new Date(Math.min(...dates.map(x=>+x))):null};});if(JSON.stringify(expected)!==JSON.stringify(after))throw new Error(`Migration changed unexpected legacy fields: ${m}`);}
 client=new PrismaClient({datasources:{db:{url}}});const payments=await client.payment.aggregate({_sum:{amount:true}});if(Number(payments._sum.amount)!==originalPaid)throw new Error('Opening ledger mismatch');
 if(await client.student.count({where:{customerId:null}})||await client.eventLead.count({where:{customerId:null}}))throw new Error('Unlinked legacy identities');
 report.checks.push({name:'Legacy scalar data retained across 24 tables except canonical phone formatting and earliest unified follow-up',passed:true},{name:'Canonical students and event customers linked',passed:true},{name:'Opening payment ledger balances preserved',passed:true});
 await client.$executeRawUnsafe('CREATE DATABASE audit_crm');const testUrl=new URL(url);testUrl.pathname='/audit_crm';env.DATABASE_URL=testUrl.toString();env.DIRECT_URL=testUrl.toString();env.AUDIT_DATABASE_URL=testUrl.toString();
 node('node_modules/prisma/build/index.js','migrate','deploy');
 const output=node('scripts/test-crm.mjs');writeFileSync(resolve(directory,'test-output.txt'),output);console.log(output);
 report.checks.push({name:'HTTP, authorization, concurrency, browser regression',passed:true});
 console.log(`CRM regression passed. Report: ${directory}`);
}catch(e){report.error=e.message.replaceAll(password,'[redacted]');console.error(report.error);process.exitCode=1;}
finally{await old?.$disconnect();await client?.$disconnect();if(started)run(binary('pg_ctl'),['-D',data,'-m','fast','-w','stop']);writeFileSync(resolve(directory,'migration-report.json'),JSON.stringify(report,null,2));console.log(`Report directory: ${directory}`);}
