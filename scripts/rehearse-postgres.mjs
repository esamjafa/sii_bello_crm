// Windows-only local rehearsal. Install test binaries without changing app deps:
// npm install --prefix audit-results/postgres-validation @embedded-postgres/windows-x64
// node scripts/rehearse-postgres.mjs --backup backups/salon-TIMESTAMP.db
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../generated/postgresql/index.js';

const backup = process.argv[process.argv.indexOf('--backup') + 1];
if (!backup || !process.argv.includes('--backup')) throw new Error('--backup is required');
const directory = resolve('audit-results/postgres-validation', `run-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const binary = name => resolve('audit-results/postgres-validation/node_modules/@embedded-postgres/windows-x64/native/bin', `${name}.exe`);
const password = randomBytes(24).toString('hex');
const passwordFile = resolve(directory, 'password.txt');
writeFileSync(passwordFile, password);
const databaseUrl = `postgresql://migration_test:${password}@127.0.0.1:55439/postgres?schema=public`;
const env = { ...process.env, POSTGRES_ENV_FILE: '', POSTGRES_REHEARSAL: 'true', DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
function run(command, args, expected = 0) {
  // pg_ctl's detached server must not inherit captured output pipe handles.
  const result = spawnSync(command, args, { env, encoding: 'utf8', windowsHide: true, timeout: 180000,
    ...(command.endsWith('pg_ctl.exe') ? { stdio: 'ignore' } : {}) });
  if (result.error) throw result.error;
  if (result.status !== expected) throw new Error(`Command failed (${result.status}): ${args[0]}\n${result.stdout}\n${result.stderr}`.replaceAll(password, '[redacted]'));
  return result.stdout;
}
const data = resolve(directory, 'data');
const report = { checkedAt: new Date().toISOString(), backup: resolve(backup), checks: [] };
let started = false, client;
try {
  run(binary('initdb'), ['-D', data, '-U', 'migration_test', '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
  started = true;
  run(binary('pg_ctl'), ['-D', data, '-l', resolve(directory, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55439', '-w', 'start']);
  report.checks.push({ name: 'Fresh PostgreSQL schema migration', passed: true, output: run(process.execPath, ['scripts/postgres.mjs', 'deploy']) });
  // Copy backup/manifest locally so rehearsal receipts never masquerade as hosted receipts.
  const copy = resolve(directory, 'source.db');
  copyFileSync(backup, copy);
  copyFileSync(backup.replace(/\.db$/, '.manifest.json'), copy.replace(/\.db$/, '.manifest.json'));
  report.checks.push({ name: 'Import and exact field verification', passed: true, output: run(process.execPath, ['scripts/transfer-postgres.mjs', '--backup', copy]) });
  report.checks.push({ name: 'Independent verify-only pass', passed: true, output: run(process.execPath, ['scripts/transfer-postgres.mjs', '--backup', copy, '--verify-only']) });
  const refused = run(process.execPath, ['scripts/transfer-postgres.mjs', '--backup', copy], 1);
  report.checks.push({ name: 'Second import refuses populated target', passed: true, output: refused });
  report.checks.push({ name: 'Records unchanged after refused import', passed: true, output: run(process.execPath, ['scripts/transfer-postgres.mjs', '--backup', copy, '--verify-only']) });
  client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  report.postgresVersion = (await client.$queryRaw`SELECT version()`)[0].version;
  const receipt = JSON.parse(readFileSync(copy.replace(/\.db$/, '.postgres-receipt.json'), 'utf8'));
  report.tables = receipt.tables;
  const lockTest = run(process.execPath, ['--import', 'tsx', 'scripts/test-postgres-lock.mjs']);
  report.checks.push({ name: 'PostgreSQL scheduling lock concurrency', passed: true, output: lockTest });
  if (process.argv.includes('--audit')) {
    await client.$executeRawUnsafe('CREATE DATABASE audit_regression');
    const auditUrl = new URL(databaseUrl);
    auditUrl.pathname = '/audit_regression';
    env.AUDIT_DATABASE_URL = auditUrl.toString();
    report.checks.push({ name: 'Full app PostgreSQL regression suite', passed: true, output: run(process.execPath, ['scripts/deployment-audit.mjs']) });
  }
  console.log(JSON.stringify({ status: 'passed', checks: report.checks.map(check => check.name), rowCount: Object.values(report.tables).reduce((sum, table) => sum + table.count, 0) }, null, 2));
} catch (error) {
  report.error = error.message.replaceAll(password, '[redacted]');
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await client?.$disconnect();
  if (started) run(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  writeFileSync(resolve(directory, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`Rehearsal report: ${resolve(directory, 'results.json')}`);
}
