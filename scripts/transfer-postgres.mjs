import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient as SQLiteClient } from '../generated/sqlite/index.js';
import { PrismaClient as PostgresClient, Prisma } from '../generated/postgresql/index.js';
import { postgresEnvironment, safeError } from './postgres-env.mjs';

// Parents precede their children. No source migration history is copied.
const tables = ['Customer', 'Service', 'Staff', 'WorkingHour', 'BookingVerification',
  'CollegeCourse', 'Student', 'Event', 'User', 'Appointment', 'Invoice', 'Expense',
  'StudentEnrollment', 'StudentPayment', 'StudentContact', 'EventPackage', 'EventLead',
  'EventContact', 'LaserPlan', 'LaserSession', 'LaserDocument', 'ServiceRequest', 'AuditLog', 'NotificationLog'];
const delegate = name => name[0].toLowerCase() + name.slice(1);
const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));
const hash = value => createHash('sha256').update(value).digest('hex');

function canonical(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (typeof value === 'object' && typeof value.toFixed === 'function') return value.toString();
  return value;
}
function recordDigest(model, row) {
  const fields = models.get(model).fields.filter(field => field.kind !== 'object').map(field => field.name).sort();
  return hash(JSON.stringify(fields.map(field => [field, canonical(row[field])])));
}
function tableDigest(model, rows) {
  return hash(rows.map(row => `${row.id}:${recordDigest(model, row)}`).sort().join('\n'));
}
function insertData(model, row) {
  return Object.fromEntries(models.get(model).fields.filter(field => field.kind !== 'object').map(field => {
    const value = row[field.name];
    return [field.name, field.type === 'Decimal' && value !== null ? value.toString() : value];
  }));
}
function financialTotals(model, rows) {
  return Object.fromEntries(models.get(model).fields.filter(field => field.type === 'Decimal').map(field => [field.name,
    rows.reduce((sum, row) => sum.plus(row[field.name]?.toString() ?? '0'), new Prisma.Decimal(0)).toString()
  ]));
}

let source, target, runtime, env;
try {
  const backupArg = process.argv.indexOf('--backup');
  if (backupArg < 0 || !process.argv[backupArg + 1]) throw new Error('Usage: node scripts/transfer-postgres.mjs --backup backups/salon-TIMESTAMP.db [--verify-only]');
  const backup = resolve(process.argv[backupArg + 1]);
  const manifestPath = backup.replace(/\.db$/, '.manifest.json');
  if (manifestPath === backup) throw new Error('Expected a .db backup with its .manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.integrityCheck !== 'ok' || manifest.foreignKeyCheck !== 'ok' || hash(readFileSync(backup)) !== manifest.sha256) throw new Error('Backup checksum or integrity manifest does not match.');
  if (models.size !== tables.length || tables.some(name => !models.has(name))) throw new Error('Transfer table list must match every model in the target schema.');
  env = postgresEnvironment();
  source = new SQLiteClient({ datasources: { db: { url: `file:${backup.replaceAll('\\', '/')}` } } });
  target = new PostgresClient({ datasources: { db: { url: env.DIRECT_URL } } });
  const sourceRows = {};
  const summary = {};
  for (const model of tables) {
    sourceRows[model] = await source[delegate(model)].findMany();
    if (sourceRows[model].length !== manifest.rowCounts[model]) throw new Error(`${model}: backup count disagrees with manifest.`);
    summary[model] = { count: sourceRows[model].length, digest: tableDigest(model, sourceRows[model]), totals: financialTotals(model, sourceRows[model]) };
  }
  const verify = async client => {
    for (const model of tables) {
      const rows = await client[delegate(model)].findMany();
      if (rows.length !== summary[model].count || tableDigest(model, rows) !== summary[model].digest) throw new Error(`${model}: target does not exactly match the backup.`);
    }
  };
  await target.$transaction(async tx => {
    // Prevent competing migration jobs and application writes during the copy.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1397311811)`;
    for (const model of tables) await tx.$executeRawUnsafe(`LOCK TABLE "${model}" IN ACCESS EXCLUSIVE MODE`);
    if (!process.argv.includes('--verify-only')) {
      for (const model of tables) if (await tx[delegate(model)].count()) throw new Error(`Target ${model} is not empty. Refusing to overwrite or merge existing records.`);
      for (const model of tables) {
        for (let offset = 0; offset < sourceRows[model].length; offset += 100) {
          await tx[delegate(model)].createMany({ data: sourceRows[model].slice(offset, offset + 100).map(row => insertData(model, row)) });
        }
      }
    }
    await verify(tx);
    if (hash(readFileSync(backup)) !== manifest.sha256) throw new Error('Backup changed during transfer.');
  }, { maxWait: 10000, timeout: 300000 });
  // Ensure the runtime/pool URL points to the same transferred dataset.
  runtime = new PostgresClient({ datasources: { db: { url: env.DATABASE_URL } } });
  await verify(runtime);
  const receipt = { verifiedAt: new Date().toISOString(), backup, backupSha256: manifest.sha256,
    target: { host: new URL(env.DIRECT_URL).hostname, database: new URL(env.DIRECT_URL).pathname },
    mode: process.argv.includes('--verify-only') ? 'verify-only' : 'import', tables: summary };
  const receiptPath = backup.replace(/\.db$/, '.postgres-receipt.json');
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: 'verified', receipt: receiptPath, counts: Object.fromEntries(tables.map(name => [name, summary[name].count])) }, null, 2));
} catch (error) {
  console.error(safeError(error, env));
  console.error('Transfer not verified. Do not switch the application connection. A committed copy can be checked with --verify-only.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([source, target, runtime].filter(Boolean).map(client => client.$disconnect()));
}
