# Sii Bello Saloon CRM

Next.js operational CRM with PostgreSQL, a unified customer profile, salon, college, events, inventory, immutable payments, follow-ups, and server-enforced role access. The operational workspace is Arabic RTL with the charcoal, plum and rose design supplied in September 2026. See [operations guide](CRM_OPERATIONS.md) and [regression report](CRM_REGRESSION_REPORT.md).

## Local setup

1. Install Node.js 20 or newer.
2. Configure PostgreSQL `DATABASE_URL` and `DIRECT_URL` in `.env` using `.env.postgres.example`, and set a random `SESSION_SECRET` of at least 32 characters. Existing installations already have private environment files; preserve them.
3. Run `npm install`.
4. Run `npm run db:deploy` to create the local database.
5. For a new installation only, set `DEMAT_PASSWORD`, `RANEENJ_PASSWORD`, and `ESAMJ_PASSWORD` in `.env`, then run `npm run db:seed`. Migrated accounts already exist; do not seed them again.
6. Run `npm run dev` and open `http://localhost:3000`.

## Version control and checks

The local Git repository uses `main`. Commit source, `package-lock.json`, Prisma schemas and migrations, and the reviewed `.env.example` and `.env.postgres.example` templates. Private environment files, certificates, database contents and dumps, backups, generated clients, and audit output are ignored. Review `git status` before committing; never force-add private files.

Run `npm ci` and `npm run check` for Prisma validation and TypeScript checks, then `npm run build`. `npm run test:audit` requires a fresh disposable localhost PostgreSQL database named `audit_*` via `AUDIT_DATABASE_URL`; it applies migrations and exercises the production app.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs these checks on pushes and pull requests using Node.js 22 and an isolated PostgreSQL 16 service. Its credentials are disposable test values; no production secrets are required. Push to a GitHub remote to activate the workflow, and configure branch protection there if checks must be required before merging.

## Deployment checks

Before release, run `npm run build`, install the test browser with `npx playwright install chromium`, and run `npm run test:audit` with `AUDIT_DATABASE_URL` set to a fresh disposable localhost PostgreSQL database named `audit_*`. The audit starts two production-mode servers on ports 3297 and 3298 and disables external notifications. Production database targets are refused. The Windows migration rehearsal is available separately through `npm run test:crm -- --snapshot <pre-CRM-snapshot.json>`.

Appointment writes use a PostgreSQL transaction-scoped advisory lock. Hosted data transfer and local application activation are complete; see `POSTGRES_MIGRATION.md` for verification and rollback details.

Set `DATABASE_URL`, `DIRECT_URL`, and `SESSION_SECRET` in the hosting environment. Follow [Vercel deployment](VERCEL_DEPLOYMENT.md) for preview setup and the manually triggered production migration workflow. Preserve the session secret when migrating existing accounts. The app uses HTTPS secure cookies in production. Vercel deployment, provider backups, and real notification delivery still need verification.

## Roles

| Role | Access |
| --- | --- |
| God Mode | All records and management of God Mode accounts |
| Admin | All records and user management |
| Manager | All salon records, no user management |
| Staff | Assigned customers, own appointments and service records; no finance |
| Accountant | Invoices, payment entries and financial reports; no payment voids |
| Receptionist | Customers, follow-ups and appointments; no profit reports |
| Sales | Assigned customers and their follow-ups |
| College coordinator | Students, courses, attendance and follow-ups |
| Trainer | Own groups, attendance and student assessments |
| Event manager | Assigned events and their registrations |
| Inventory | Products, stock movements and supplier orders |
| Viewer | View salon records only |

Admins and God Mode users create additional accounts from settings. Admins cannot create or edit God Mode accounts. For an existing user, leave the password field blank to keep the current password. Financial reports separate currencies. Date and time values are stored as UTC and displayed in the visitor's browser time zone; business-day and monthly summaries use Jerusalem time.

This is a single salon deployment. Back up the PostgreSQL database regularly and restrict access to the deployment environment variables.
