import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function postgresEnvironment(required = true) {
  const env = { ...process.env };
  const envFile = process.env.POSTGRES_ENV_FILE ?? '.env.postgres.local';
  if (envFile && existsSync(envFile)) {
    const values = parseEnv(readFileSync(envFile, 'utf8'));
    for (const name of ['DATABASE_URL', 'DIRECT_URL']) if (values[name]) env[name] = values[name];
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!required && !/^postgres(?:ql)?:\/\//.test(env[name] || '')) env[name] = 'postgresql://unused:unused@localhost:5432/schema_generation';
    if (!/^postgres(?:ql)?:\/\//.test(env[name] || '')) throw new Error(`Set ${name} to a PostgreSQL connection in .env.postgres.local or the process environment.`);
    new URL(env[name]);
  }
  return env;
}

export function safeError(error, env) {
  let message = error instanceof Error ? error.message : String(error);
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    if (env?.[name]) {
      message = message.replaceAll(env[name], '[database connection]');
      try {
        const url = new URL(env[name]);
        for (const part of [url.username, url.password]) {
          if (part) message = message.replaceAll(part, '[redacted]').replaceAll(decodeURIComponent(part), '[redacted]');
        }
      } catch { /* Invalid URLs are redacted by the expression below. */ }
    }
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[database connection]');
}
