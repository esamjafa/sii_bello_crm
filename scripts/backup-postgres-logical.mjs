// Lossless data snapshot: PostgreSQL produces row JSON as TEXT, avoiding JS
// floating-point conversion of decimals. Includes bytea hex and migration history.
import {PrismaClient} from '@prisma/client';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {postgresEnvironment,safeError} from './postgres-env.mjs';
let env,client;
try{
 env=postgresEnvironment();client=new PrismaClient({datasources:{db:{url:env.DIRECT_URL}}});
 const snapshot=await client.$transaction(async tx=>{
  const names=await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const tables={};for(const {tablename} of names){const quoted='"'+tablename.replaceAll('"','""')+'"';tables[tablename]=(await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${quoted} t ORDER BY id`)).map(x=>x.row);}
  return {format:'postgres-json-text-v1',createdAt:new Date().toISOString(),tables};
 },{isolationLevel:'RepeatableRead',timeout:120000,maxWait:15000});
 const directory=resolve('backups',`postgres-before-crm-${Date.now()}`);mkdirSync(directory,{recursive:true});const path=resolve(directory,'snapshot.json');const text=JSON.stringify(snapshot);writeFileSync(path,text);
 const manifest={createdAt:snapshot.createdAt,path,format:snapshot.format,sha256:createHash('sha256').update(text).digest('hex'),tables:Object.fromEntries(Object.entries(snapshot.tables).map(([name,rows])=>[name,rows.length]))};writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
}catch(e){console.error(safeError(e,env));process.exitCode=1;}finally{await client?.$disconnect();}
