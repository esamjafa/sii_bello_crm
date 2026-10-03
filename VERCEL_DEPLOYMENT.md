# Vercel deployment

## Production — 30 September 2026

Published commit `608bae2` to [sii-bello.vercel.app](https://sii-bello.vercel.app).
Deployment `dpl_6EQDB8u6P2BxxcdzVqJpxmGy2wUp` is **READY** and aliased to the production domain.
Deployment URL: https://sii-bello-p87wzs1ui-esamjafas-projects.vercel.app

This release includes the reference-based salon, college, and event screens, the shared plum/fuchsia palette, and the preceding CRM workflow and permissions changes. The latest WhatsApp gateway additions remain removed.

Created a production backup before migration at `backups/postgres-before-crm-1790759050923/snapshot.json`, then successfully applied `20260929100000_document_departments`, `20260929110000_workflow_details`, and `20260929120000_invoice_documents`. All seven migrations are now applied. No seed or reset was run.

Vercel's production build passed; its dependency audit reported zero vulnerabilities. The preceding local regression suite passed 714/714 checks. After deployment, **17/17 live smoke checks passed**: migration status, public pages, login redirect, protected API authentication, existing-account password login, Secure/HttpOnly cookies, workspace rendering, all three department endpoints, and logout. No business records were created or changed by smoke checks; login/logout generate the normal account and audit activity.

[Live verification results](audit-results/production-release-sep30.json). Full business workflow regression was performed locally; the live checks are a smoke test, not a penetration test. Environment files and database backups were excluded from the upload.

## Production — 26 September 2026

Published the current CRM workspace with Meta-only WhatsApp integration to
https://sii-bello.vercel.app using Vercel CLI 60.0.0.
Deployment: `dpl_7ZWdJvqV1SbtyJ3Gmgfsc9vR3BgJ` (READY).
Deployment URL: https://sii-bello-i61j4asx9-esamjafas-projects.vercel.app

The production database reported all four migrations applied; no database changes
were needed. Production secure cookies are enabled, development OTP display is
disabled, and the session secret meets the length requirement. Vercel's production
build passed. The preceding local regression run passed 643/643 checks
(`audit-results/crm-1790409459482/results.json`).

Live public checks verified `/` redirects to `/login`, `/login` and `/book` return
200, and anonymous requests to `/api/crm/dashboard`, `/api/crm/customers`, and
`/api/booking/data` return 401. All checked responses include frame protection.
Authenticated business workflows were not retested on this deployment.
Meta credentials are not configured in Production, so WhatsApp delivery remains
inactive. Local secret files and backups were excluded from the deployment.

## Production — 24 September 2026

Live website: https://sii-bello.vercel.app

On 25 September 2026, `sii-bello.vercel.app` was attached as a production
project domain and assigned to the deployment below. Public checks verified
that `/` redirects to `/login`, and `/login` and `/book` return HTTP 200
without Vercel SSO. The previous `sii-bello-crm.vercel.app` address remains available.

Deployment `dpl_ZorXM9DKNnGdnNo69VAVaty3CK4P` completed successfully with
Vercel CLI 59.26.0. The approved production database connections and session
secret are configured, secure cookies are enabled, and development OTP display
is disabled. Prisma reports the production database schema is up to date.

Public HTTP checks verified `/` redirects to `/login`, and `/login` and `/book`
return HTTP 200 without Vercel SSO. Existing-account login and logout both
returned HTTP 200; the session cookie has Secure and HttpOnly flags.
Customer-record retrieval was not tested because automatic approval review
rejected that check; verification used public pages and login/logout instead.
WhatsApp and email provider credentials remain unconfigured, so phone-code
delivery and outbound notifications are not operational.

## Verification — 24 September 2026

Vercel reports the existing preview deployment as **Ready**:
https://sii-bello-jb26up23d-esamjafas-projects.vercel.app

The linked project is `sii-bello-crm`. Its Preview environment contains the five
required application variables listed below. Local `npm run check` and
`npm run build` passed again on 24 September 2026.

Unauthenticated HTTP checks of `/`, `/login`, `/book`, and
`/api/data/customers` all returned HTTP 302 to Vercel's SSO sign-in gate.
These checks verify deployment protection, but do not verify application routes,
database access, login, or booking. Sign in to Vercel with project access before
performing hosted application checks. No new deployment or production release
was performed during this verification.

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
