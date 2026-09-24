# Deployment audit — 23 September 2026

## Update — 24 September 2026

Hosted PostgreSQL transfer verified: all 104 application records across 24 tables match the SQLite backup. The local application's schema, migrations, and private environment files now use PostgreSQL. Production build and the full regression suite against disposable local PostgreSQL passed; hosted migrations have no pending changes. The rehearsal report is `audit-results/postgres-validation/run-1790240401352/results.json`. Rollback files are in `backups/cutover-1790240352550`. Vercel deployment, hosted browser smoke tests, real notification delivery, and provider backup/restore checks remain outstanding. Earlier SQLite status statements below are historical.

**Current status: reproduced application bugs repaired; Vercel migration still outstanding.** The production build passes and the expanded regression audit passes all 50 checks. Local SQLite persistence remains incompatible with the intended host.

Migration preparation update: a verified SQLite backup and PostgreSQL baseline are now available. A local PostgreSQL rehearsal transferred and verified all 104 application records across 24 tables, and the scheduling helper now supports PostgreSQL advisory locks. Hosted transfer/cutover awaits connection credentials. See `POSTGRES_MIGRATION.md` for current migration status and commands; the original remediation guidance below is historical where superseded by that guide.

The initial assessment was followed by the requested application repairs. The existing salon database was not changed, and no deployment was performed. Test databases contain synthetic records only.

## Repair verification

- Staff-only document authorization now rejects CUSTOMER accounts before reading document content. Existing GOD, ADMIN, MANAGER, STAFF, and VIEWER read access is preserved.
- Appointment create/update and request approval now validate overlaps inside a shared SQLite write transaction. The lock is acquired before availability reads. Simultaneous requests against two separate production-mode app processes produced exactly one appointment and HTTP 409 for competing bookings. Cancellation, reactivation, unchanged edits, and adjacent appointments are covered.
- This deliberately preserves the current single-salon capacity rule. The write-lock implementation in `lib/scheduling.ts` is SQLite-specific and must be replaced by appropriate PostgreSQL concurrency control as part of migration. It relies on SQLite's single-writer semantics: [SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html).
- Date inputs use local components. Unchanged edits preserve the original instant, including seconds and the repeated DST hour. Tests exercise the actual date helper in Jerusalem, UTC, and New York, with winter, summer, and DST-end examples.
- Availability includes appointments beginning before opening. Impossible dates safely return an empty slot list. Nullable expense payment dates persist correctly. Unknown resource names and malformed JSON are handled without the reproduced server errors.
- Unicode filenames use an ASCII fallback plus UTF-8 `filename*`. Missing/failed WhatsApp delivery produces a structured failure; undelivered OTPs are expired and the public request returns HTTP 503. Explicit local-development OTP display remains supported. Real provider delivery is still unverified.
- `npm run build`: passed. `node scripts/deployment-audit.mjs`: **50 passed, 0 failed**, exit code 0. Results are in `audit-results/results.json`.
- The harness now starts two app processes on ports 3197 and 3198 and disables external notifications. No schema migration is needed for these repairs.

The findings and counts below describe the initial audit for reference. Remaining source-review risks and deployment tasks are still outstanding unless explicitly marked repaired above.

## Initial evidence and limits

- `npm run build`: passed compilation, type validation, page generation, and build tracing. Installed Next.js version: 15.5.25; Prisma: 6.19.3; local Node: 24.21.0.
- `npm audit --omit=dev --json`: zero known production dependency vulnerabilities at audit time. This does not prove application security.
- All five existing migrations applied successfully to fresh disposable SQLite databases.
- 32 targeted checks: **19 passed, 13 failed**. Several failed checks represent related defects, not 13 independent bug categories.
- Passing checks include public-page HTTP rendering, anonymous-access rejection, user-list restrictions, viewer-write rejection, cross-origin mutation rejection, password login with a secure cookie, invoice overpayment rejection, OTP verification and replay rejection, and the normal booking → approval → appointment/invoice flow.
- See `audit-results/results.json` for exact results and `scripts/deployment-audit.mjs` for reproducible checks. After building, run `node scripts/deployment-audit.mjs`; exit code 1 means one or more assertions failed. It uses port 3197, fresh synthetic data, a random session secret, and disabled external notification credentials. It deliberately retains test databases for inspection. Do not upload them.
- Most tests use production-mode HTTP requests. The date-edit check reproduces the exact client conversion in a Node process using Asia/Jerusalem; it is not a browser interaction test. Some test sessions are signed fixture sessions, and password login and OTP verification are tested separately.
- No interactive browser automation was available. Mobile layouts, Arabic/Hebrew rendering, accessibility, browser networking failures, real WhatsApp/email delivery, hosted PostgreSQL, load behavior, backup restoration, and an actual Vercel deployment remain unverified. This is not an exhaustive test of every CRM operation.

## Original defects and required fixes

| Priority | Defect and evidence | Required change |
| --- | --- | --- |
| Blocker | `prisma/schema.prisma:5` uses SQLite and the default database is a local file. | Move to a hosted persistent database before deploying on Vercel. |
| Critical | `app/api/laser-documents/[id]/route.ts:6`: a CUSTOMER-role session downloaded another customer's private document with HTTP 200. Authentication is checked, but role/ownership is not. A caller needs the document ID; this is not anonymous access. | Deny CUSTOMER access if documents are staff-only, or check the document's plan/customer ownership before returning bytes. Test cross-customer access and every allowed staff role. Phone-booking sessions are a separate authentication mechanism. |
| High | `app/api/service-requests/route.ts:51`: two concurrent approvals for different requests at the same time both returned 200 and created two appointments. The overlap query runs before the transaction. | Make conflict validation and creation atomic across all instances. On PostgreSQL, use an appropriate database constraint or locking/serializable transaction with retries. A transaction alone without adequate concurrency control is insufficient. |
| High | `app/api/data/[resource]/route.ts`: creating the exact same appointment twice returned 200 twice. | Apply the same scheduling validation to direct creation and edits, including hours and service/staff availability. Define whether capacity is salon-wide or per staff member. |
| High | `components/Workspace.tsx:21`: opening a stored `09:00Z` value and saving the unchanged datetime-local value produces `06:00Z` in Jerusalem during summer time. | Format date inputs using local date/time components, then convert back once on save. Test unchanged edits in winter, summer, and DST transitions. If salon time is the intended rule, consistently use Asia/Jerusalem and label it. |
| High | `lib/availability.ts`: an appointment beginning 30 minutes before opening and ending after opening does not block the first slot. | Query all appointments whose intervals overlap the requested window, including those starting before opening. Prefer stored appointment end times/durations over mutable service duration when designing the fix. |
| Medium | `app/api/data/[resource]/route.ts:143`: clearing an expense's payment date returned status DUE while preserving the old non-null paidAt. | Preserve explicit null for nullable fields; omit null only for fields that cannot be null. Verify the persisted value and UI after reload. |
| High for public booking | `app/api/booking/request-code/route.ts` reports `{ok:true}` and HTTP 200 when WhatsApp configuration is absent; NotificationLog says SKIPPED. `sendWhatsApp` also swallows provider failures. | Return a structured delivery result; report temporary failure to the user when a code could not be submitted. Configure the provider, validate templates, and add retry/monitoring for notifications. Do not report SENT as proof of final delivery. |
| Medium | `app/api/laser-documents/[id]/route.ts:11`: a Hebrew filename caused HTTP 500 because it was inserted directly into a response header. | Use an ASCII fallback filename and correctly percent-encoded UTF-8 `filename*`; keep header-injection sanitization. Test Arabic and Hebrew names. |
| Medium | Malformed JSON returned 500 from login, request-code, and verify-code. An impossible booking date, `2026-99-99`, also returned 500. | Catch JSON parsing failures and return 400. Validate actual calendar dates and supported booking ranges before database queries. Apply the parsing pattern consistently across mutations. |
| Low | `app/api/data/[resource]/route.ts:35`: `/api/data/toString` returned 500 for an authenticated admin. `value in schemas` accepts inherited object properties. | Use an own-property check and return 404 for unknown resource names. |

## Additional risks found by source review

These are separate from the 32 executed checks:

- Lists stop at 500 records with no pagination, while balances and dashboard counts are computed from those lists. Larger datasets can silently hide records and understate balances. Add server-side aggregates, pagination, and server-side search.
- `PhoneBooking` and `CustomerPortal` fetch handlers lack consistent catch/finally handling. Network or non-JSON responses can leave busy/saving states stuck. Add user-visible recovery and test offline behavior in a browser.
- Rate limiting uses separate count/create queries; login failures use read-then-write counts, and student-payment balance checks happen before writes. Concurrent requests can race. Add atomic enforcement and concurrency regression tests against the final PostgreSQL implementation.
- Existing session tokens are not versioned against password changes. Decide whether password changes, account locking, and forced sign-out must revoke existing sessions, then implement and test that policy.
- The seed script resets passwords and roles for its three named accounts. Run it deliberately for provisioning, not on every build.
- There are no pre-existing test/lint scripts or CI configuration in this folder, and it is not currently a Git repository. The successful Next build includes type validation; it does not establish a configured standalone lint suite.

## Steps to close the Vercel gap

1. **Fix the critical/high defects first.** Start with document authorization, scheduling concurrency, date conversions, and OTP error handling. Fix the other reproduced failures before release. Add browser tests for login/logout, each role, booking, date edits, expenses, uploads, and Arabic/Hebrew usage.

2. **Back up and migrate the database.** Keep a consistent backup of the current SQLite database. Provision separate development/preview and production PostgreSQL databases through your selected provider; a Vercel Marketplace PostgreSQL integration is one option. Use provider-supported pooling and choose an application region near the database. Vercel explicitly states local SQLite persistence is unsupported: [SQLite on Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

3. **Convert Prisma and create PostgreSQL migration history.** For the installed Prisma 6 setup, the datasource can become:

   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

   Set DATABASE_URL to the provider's runtime/pool connection and DIRECT_URL to its supported migration connection. Preserve the SQLite migrations in an archive outside the active migrations directory, then create a new PostgreSQL baseline against an empty development database with `npx prisma migrate dev --name init_postgres`. Review the generated SQL. Do not run development migration/reset commands against production. Changing only DATABASE_URL will not convert the provider or migrate data: [Prisma migration-provider limitations](https://docs.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues).

   Transfer existing records separately, preserving IDs, foreign keys, decimal amounts, timestamps, password hashes, and document bytes. Compare row counts and financial totals, sample documents, and test login. The seed script does not transfer salon data. Update the audit harness to use a disposable PostgreSQL database once the schema changes; the current harness intentionally targets SQLite.

4. **Prepare version control and repeatable checks.** Initialize a private Git repository and commit the application, lockfile, schema, reviewed migrations, and tests. Exclude real `.env` files, certificates, databases, and test logs. The existing `.env*` ignore pattern also excludes `.env.example`; explicitly allow that sanitized template if you want it committed. Pin a supported Node major in package.json and use the same version locally, in CI, and on Vercel. The audit used Node 24: [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

5. **Configure a Vercel preview project.** Import the repository, choose the Next.js preset, keep the repository root as the root directory, use `npm ci` for installation, and `npm run build` for the build. Keep the default Next.js output settings; no custom vercel.json is required for this basic app. The existing build already runs prisma generate. Run `npm run db:deploy` in a controlled deployment/CI step against the correct environment before releasing code that needs the new schema. Never point preview migrations at production. See [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Prisma production migrations](https://docs.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate).

6. **Set server-side environment variables separately for Preview and Production.** Use the actual values in Vercel project settings; redeploy after changes. None of these credentials should use a NEXT_PUBLIC_ prefix. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

   | Variables | Purpose |
   | --- | --- |
   | DATABASE_URL, DIRECT_URL | Runtime and migration PostgreSQL connections after the datasource change |
   | SESSION_SECRET | Independent cryptographically random secret per environment, at least 32 characters; do not use the template value |
   | FORCE_SECURE_COOKIES=true | HTTPS cookies; production already forces secure cookies |
   | BOOKING_DEV_OTP=false | Disable local OTP display; the code also gates it out in production |
   | WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, SALON_WHATSAPP_NUMBER | Real WhatsApp delivery and salon destination |
   | WHATSAPP_TEMPLATE_LANGUAGE, WHATSAPP_BOOKING_CODE_TEMPLATE, WHATSAPP_NEW_REQUEST_TEMPLATE, WHATSAPP_REQUEST_RESULT_TEMPLATE | Template names/language matching the configured provider templates; test their required parameter structure |
   | RESEND_API_KEY, EMAIL_FROM | Transactional email using a verified sender |
   | DEMAT_PASSWORD, RANEENJ_PASSWORD, ESAMJ_PASSWORD | Temporary provisioning values only when running the seed intentionally; remove afterward |

   Generate the session secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store it securely. Confirm the seed's environment points to the intended database because it loads local Next.js environment files.

7. **Validate preview end to end.** Test real WhatsApp code delivery, wrong/expired/reused codes, staff and customer authorization, simultaneous competing bookings, appointment and invoice creation, payment edits, document access and Unicode downloads, and login/logout over HTTPS. Test file uploads near the app's 4 MiB limit. Vercel Functions have a 4.5 MB request/response limit; the existing upload cap is below it, but pagination and document response size still matter. Larger files require a different upload design, such as authorized direct uploads to private object storage: [Vercel payload limits](https://vercel.com/docs/functions/limitations).

8. **Verify operations, then release.** Enable database backups and perform a restore rehearsal. Monitor failed notifications and server errors, set a retention policy for OTP/security logs, and document account recovery and rollback. Provision accounts once or validate migrated accounts. Connect the production domain, verify HTTPS cookies, deploy with production-only credentials, and repeat the essential smoke tests. Treat a successful build as one gate, not proof of production readiness.

Release gate: all reproduced defects fixed with passing regression checks on the final database, real notification delivery verified, browser flows verified, preview/production isolated, and backup restore demonstrated.
