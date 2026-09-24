# Vercel deployment

`vercel.json` selects the Next.js preset, `npm ci`, and `npm run build`.
The build generates Prisma Client and builds Next.js; it does not migrate or seed a database.

## Preview

1. Link the directory to the intended Vercel project using `vercel link`.
2. Configure Preview environment variables in Vercel: `DATABASE_URL`, `DIRECT_URL`,
   a separate random `SESSION_SECRET` (at least 32 characters),
   `FORCE_SECURE_COOKIES=true`, and `BOOKING_DEV_OTP=false`.
   Use a separate PostgreSQL database with synthetic test data for previews.
   Set notification credentials only when intentionally testing delivery.
3. Apply committed migrations to that preview database explicitly with
   `npm run db:deploy` in an environment containing its connection URLs.
   Do not import production salon records or run the production migration workflow for previews.
4. Run `vercel deploy` (without `--prod`) to create a preview deployment.
5. Verify login, authorization, booking, documents, and HTTPS cookies before release.

`.vercelignore` excludes private local environment files, certificates, database files,
and backups from CLI uploads. Configure credentials in Vercel rather than uploading local files.

## Controlled production migrations

Configure a GitHub environment named `production` in this repository. Restrict it to
`main`, add required reviewers where your GitHub plan supports them, and add its
`DIRECT_URL` secret containing the production migration connection. Never put this
credential in repository files or workflow inputs.

Before releasing a reviewed `main` commit:

1. Confirm CI passes for that commit and verify the database backup/restore plan.
2. In GitHub Actions, select **Production migrations**, choose `main`, and enter
   `migrate-production`. Review the run's commit SHA and approve the environment
   gate if configured.
3. The job installs locked dependencies, runs `npm run db:deploy` using the direct
   connection, and checks migration status. Concurrent migration runs are serialized;
   a failed migration stops the job. It never seeds, resets, or imports business data.
4. Only after success, release the same commit to Vercel production. This workflow
   does not itself publish a production deployment. Disable automatic production
   releases in Vercel if they could bypass this sequence.

Use backward-compatible migrations while an older app version is serving traffic.
For incompatible changes, schedule a maintenance window and a specific recovery plan.
Rolling back an application deployment does not roll back database migrations.
