import { spawnSync } from 'node:child_process';
import { postgresEnvironment, safeError } from './postgres-env.mjs';

const action = process.argv[2];
const commands = {
  generate: ['generate'], validate: ['validate'], deploy: ['migrate', 'deploy'], status: ['migrate', 'status']
};
let env;
try {
  if (!Object.hasOwn(commands, action)) throw new Error('Usage: node scripts/postgres.mjs generate|validate|deploy|status');
  env = postgresEnvironment(!['generate', 'validate'].includes(action));
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...commands[action], '--schema', 'prisma/postgresql/schema.prisma'], { env, encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(safeError(result.stdout, env));
  if (result.stderr) process.stderr.write(safeError(result.stderr, env));
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (action === 'generate' && result.status === 0) {
    const legacy = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/legacy-sqlite/schema.prisma'], {
      env: { ...env, SQLITE_SOURCE_URL: 'file:./unused.db' }, encoding: 'utf8', windowsHide: true
    });
    if (legacy.stdout) process.stdout.write(safeError(legacy.stdout, env));
    if (legacy.stderr) process.stderr.write(safeError(legacy.stderr, env));
    if (legacy.error) throw legacy.error;
    process.exitCode = legacy.status ?? 1;
  }
} catch (error) { console.error(safeError(error, env)); process.exitCode = 1; }
