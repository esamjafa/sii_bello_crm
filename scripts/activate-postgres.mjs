// Run only after the final hosted transfer receipt exists and app writes stop.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, renameSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { postgresEnvironment, safeError } from './postgres-env.mjs';

const root = process.cwd();
function workspacePath(...parts) {
  const path = resolve(root, ...parts);
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Expected a path inside the workspace.');
  return path;
}
const hash = data => createHash('sha256').update(data).digest('hex');
let env;
try {
  const index = process.argv.indexOf('--backup');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--backup is required.');
  const backup = workspacePath(process.argv[index + 1]);
  const receipt = JSON.parse(readFileSync(backup.replace(/\.db$/, '.postgres-receipt.json'), 'utf8'));
  const source = workspacePath('prisma/dev.db');
  // Compare snapshots made by the same backup API: SQLite backup headers can
  // differ from the live file even when every stored record is unchanged.
  const fresh = spawnSync('python', ['scripts/backup-sqlite.py', '--source', source], { encoding: 'utf8', windowsHide: true });
  if (fresh.status !== 0) throw new Error('Could not create the final SQLite comparison snapshot.');
  const snapshot = JSON.parse(fresh.stdout);
  if (hash(readFileSync(backup)) !== receipt.backupSha256 || snapshot.sha256 !== receipt.backupSha256 ||
      (existsSync(source + '-wal') && statSync(source + '-wal').size > 0)) {
    throw new Error('SQLite changed or has a WAL since the verified snapshot. Take and verify a fresh backup before cutover.');
  }
  env = postgresEnvironment();
  const direct = new URL(env.DIRECT_URL);
  if (receipt.target.host !== direct.hostname || receipt.target.database !== direct.pathname) throw new Error('Receipt does not match the configured hosted database.');
  const schemaPath = workspacePath('prisma/schema.prisma');
  if (!readFileSync(schemaPath, 'utf8').includes('provider = "sqlite"')) throw new Error('Active schema is not SQLite; refusing repeat activation.');
  const saved = workspacePath('backups', `cutover-${Date.now()}`);
  mkdirSync(saved);
  copyFileSync(schemaPath, resolve(saved, 'schema.prisma'));
  for (const name of ['.env', '.env.local']) if (existsSync(workspacePath(name))) copyFileSync(workspacePath(name), resolve(saved, name));
  const oldMigrations = workspacePath('prisma/migrations');
  const archive = workspacePath(relative(root, saved), 'sqlite-migrations');
  // Both resolved rename targets have been checked to stay within the workspace.
  renameSync(oldMigrations, archive);
  cpSync(workspacePath('prisma/postgresql/migrations'), oldMigrations, { recursive: true });
  const schema = readFileSync(workspacePath('prisma/postgresql/schema.prisma'), 'utf8').replace(/^\s*output\s*=.*\r?\n/m, '');
  writeFileSync(schemaPath, schema);
  for (const name of ['.env', '.env.local']) {
    const file = workspacePath(name);
    let contents = existsSync(file) ? readFileSync(file, 'utf8') : '';
    for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
      const line = `${key}=${JSON.stringify(env[key]).replace(/\$/g, '\\$')}`;
      const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'gm');
      contents = pattern.test(contents) ? contents.replace(pattern, () => line) : `${contents.trimEnd()}\n${line}\n`;
    }
    writeFileSync(file, contents);
  }
  writeFileSync(resolve(saved, 'activation.json'), JSON.stringify({ activatedAt: new Date().toISOString(), receipt: backup.replace(/\.db$/, '.postgres-receipt.json'), rollbackDirectory: saved }, null, 2));
  console.log(`PostgreSQL schema and environment activated. Rollback files: ${saved}`);
} catch (error) { console.error(safeError(error, env)); process.exitCode = 1; }
