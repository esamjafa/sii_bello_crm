import { readFileSync, appendFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaClient } from '../generated/postgresql/index.js';
import { safeError } from './postgres-env.mjs';

const env = parseEnv(readFileSync('.env.postgres.local', 'utf8'));
let derived = false;
if (!env.DIRECT_URL) {
  const direct = new URL(env.DATABASE_URL);
  if (direct.hostname !== 'pooled.db.prisma.io') throw new Error('Add the provider-supplied DIRECT_URL to .env.postgres.local.');
  // Prisma documents db.prisma.io as the direct endpoint for this pool.
  // Validate both connections before saving this derived URL.
  direct.hostname = 'db.prisma.io';
  env.DIRECT_URL = direct.toString();
  derived = true;
}
const clients = [];
try {
  const results = [];
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const url = new URL(env[name]);
    url.searchParams.set('connect_timeout', '15');
    const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    clients.push(client);
    const identity = await client.$queryRaw`SELECT current_database() AS database, current_user AS role`;
    const tables = await client.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
    results.push({ name, identity: identity[0], tables: tables.map(row => row.table_name) });
    console.log(JSON.stringify({ connection: name, connected: true, tables: tables.map(row => row.table_name) }));
  }
  if (JSON.stringify(results[0].identity) !== JSON.stringify(results[1].identity) || JSON.stringify(results[0].tables) !== JSON.stringify(results[1].tables)) throw new Error('Pooled and direct connection identities do not match.');
  if (derived) appendFileSync('.env.postgres.local', `\nDIRECT_URL=${JSON.stringify(env.DIRECT_URL)}\n`);
  console.log('Both connections verified. Public schema empty: ' + (results[0].tables.length === 0));
} catch (error) { console.error(safeError(error, env)); process.exitCode = 1; }
finally { await Promise.allSettled(clients.map(client => client.$disconnect())); }
