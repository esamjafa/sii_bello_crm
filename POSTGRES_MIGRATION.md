# PostgreSQL migration status

**24 September 2026: hosted transfer verified and local application switched to PostgreSQL.** All 104 records across 24 tables match the SQLite snapshot. The active schema, migrations, `.env`, and `.env.local` now use PostgreSQL. Production build passed; hosted migration deployment reports no pending migrations. Rollback files are in `backups/cutover-1790240352550`. Vercel deployment and real-provider notification checks remain outstanding.

The sequence below records the migration procedure; local activation is already complete. Do not repeat the import or activation. The audit now supports a disposable localhost PostgreSQL database named `audit_*` via `AUDIT_DATABASE_URL`; production targets are refused.

The full application PostgreSQL regression suite and migration rehearsal passed on 24 September; report: `audit-results/postgres-validation/run-1790240401352/results.json`. The activation guard compares consistent online snapshots because the live SQLite file header can differ from a backup without any record changes.

## Verified backup and rehearsal

- Backup: `backups/salon-20260923T150544601744Z.db`.
- SHA-256: `99b4506dc204ec6c0ef0dee60f9f07c5660eeb26930e71a0bbba96ca43db087a`.
- Manifest: the adjacent `.manifest.json`, containing table counts and integrity results.
- SQLite online backup API was used; this includes committed WAL contents. Integrity and foreign-key checks passed. The live source was opened read-only.
- Rehearsal target: temporary local PostgreSQL 18.4, bound to 127.0.0.1, stopped after testing. This was not a hosted database.
- **104 application records across all 24 application tables** imported successfully. The 5 SQLite `_prisma_migrations` records were intentionally excluded; PostgreSQL has its own migration history.
- Every scalar field was compared using canonical record hashes, including IDs, password hashes, enum values, booleans, timestamps, decimals, and document bytes. Counts and exact decimal financial totals were recorded in the receipt.
- Verify-only passed independently. A repeated import refused to overwrite populated tables, and verification confirmed that records remained unchanged.
- The actual PostgreSQL scheduling-lock helper was tested using two independent clients: exactly one overlapping appointment was admitted.
- Detailed rehearsal results: `audit-results/postgres-validation/run-1790177726480/results.json`. This and the copied data are ignored by Git and remain local.

The backup is a point-in-time snapshot. Writes after it was taken are not included. Take a fresh backup during the final write freeze before hosted import.

## Prepared files

| File | Purpose |
| --- | --- |
| `prisma/postgresql/schema.prisma` | PostgreSQL version of all application models; separate generated client, runtime URL and migration URL |
| `prisma/postgresql/migrations/20260923151000_init_postgresql/migration.sql` | Generated and rehearsed PostgreSQL baseline, including enums, tables, indexes, and foreign keys |
| `prisma/postgresql/migrations/migration_lock.toml` | PostgreSQL provider lock |
| `prisma/legacy-sqlite/` | Preserved SQLite schema and all five original migrations; source-only generated client |
| `scripts/backup-sqlite.py` | Repeatable online backup with integrity checks and checksum manifest |
| `scripts/transfer-postgres.mjs` | Separate transactional data import and independent verification |
| `scripts/postgres.mjs` | Explicit commands for the staged PostgreSQL schema |
| `lib/scheduling.ts` | PostgreSQL transaction advisory lock plus existing SQLite fallback |
| `.env.postgres.example` | Sanitized hosted configuration template |

No seed command is part of this migration: existing users and password hashes are transferred, not recreated or reset. Keep the existing SESSION_SECRET during cutover if existing sessions should remain valid.

## Hosted migration and cutover sequence

1. Provision an empty hosted PostgreSQL database. Copy `.env.postgres.example` to `.env.postgres.local` and replace its placeholders with the provider's DATABASE_URL and DIRECT_URL. DATABASE_URL is the runtime/pool connection; DIRECT_URL must support schema migrations and the importer’s long transaction. Use the provider's TLS settings. Do not paste credentials into chat or commit the local file. The preparatory scripts load this file without changing the app’s active `.env` or `.env.local`.

2. Stop application writes for the final migration window. Stop the local/deployed app or otherwise enforce maintenance mode before the final snapshot, and keep it stopped through verification and cutover. There is no automatic replication of subsequent SQLite edits.

3. Create the final backup:

   ```powershell
   npm run db:backup
   ```

   Use the printed path as `BACKUP_PATH` in the commands below. Keep the `.db` and adjacent `.manifest.json` together. Store another protected copy off the application machine before retiring SQLite.

4. Generate the migration clients, validate the schema, and deploy the PostgreSQL baseline:

   ```powershell
   npm run db:pg:generate
   npm run db:pg:validate
   npm run db:pg:deploy
   npm run db:pg:status
   ```

   These scripts target `prisma/postgresql/schema.prisma`. They do not run the SQLite SQL against PostgreSQL and do not copy business records.

5. Transfer the final snapshot separately:

   ```powershell
   npm run db:transfer -- --backup BACKUP_PATH
   npm run db:transfer -- --backup BACKUP_PATH --verify-only
   ```

   The importer verifies the backup manifest/checksum, requires every application table in the target to be empty, inserts in dependency order, and compares every record inside one transaction before commit. If an insert or pre-commit verification fails, that transaction rolls back. After commit it also verifies through DATABASE_URL, so a bad runtime/pool URL prevents a success receipt. If this final runtime check fails, the direct database may already contain the committed copy: correct the URL and use `--verify-only`, not another import.

   Only a successful verification writes a `.postgres-receipt.json` alongside the backup. Failure must not trigger cutover. The importer does not clear, merge, or overwrite an existing target. The script's source dataset is the backup, never the live SQLite file. It loads that snapshot in memory; review memory sizing before using it for much larger datasets.

6. After hosted verification succeeds, activate PostgreSQL for the app while writes remain stopped. Preserve the current active `prisma/schema.prisma`, `prisma/migrations`, and private environment files for rollback. Replace the active schema with the staged PostgreSQL schema, removing its custom generator `output` so the application again imports its normal `@prisma/client`. Replace the active migrations directory with the staged PostgreSQL migrations. The legacy copy must remain separate from the active migration directory. Set DATABASE_URL and DIRECT_URL in the actual app environment and Vercel environment settings; `.env.postgres.local` is only read by the migration scripts. Update both `.env` and `.env.local` if running locally, so their precedence cannot leave SQLite active.

7. Run `npm run build` and `npm run db:deploy`, then start the app with the hosted environment. The already applied baseline should have no pending changes. `db:deploy` will use PostgreSQL only after the active schema/migration switch in step 6. Do not run `db:migrate` or database-reset commands on production. The existing `scripts/deployment-audit.mjs` still targets disposable SQLite and must be adapted to a separate disposable PostgreSQL database before using it after cutover; never run its fixtures against the hosted production database.

8. Verify admin login using a migrated account, customer/financial totals, document download, request approval, and competing bookings against the hosted deployment. Recheck notifications with real provider credentials, HTTPS cookies, and connection pool limits. Enable provider backups and perform a restore test. Then reopen writes.

If verification fails before reopening writes, restore the previous schema, migration directory, and environment, regenerate the SQLite client, and resume the original SQLite database. After PostgreSQL accepts new business writes, reverting to the old SQLite snapshot would lose those changes; stop writes and reconcile first.

The prepared PostgreSQL lock uses an exclusive transaction-scoped advisory lock and Read Committed isolation. All application appointment creation/update/approval paths use it. It requires no PostgreSQL extensions and is not tied to a particular hosting provider. See [PostgreSQL advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html) and [Prisma 6 data sources](https://docs.prisma.io/docs/orm/v6/prisma-schema/overview/data-sources).
