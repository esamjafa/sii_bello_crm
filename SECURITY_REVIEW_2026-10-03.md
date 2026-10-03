# Sii Bello security review — 3 October 2026

## Scope and outcome

Source review and controlled attack-style tests against disposable local PostgreSQL and local application servers. No attacks against the public deployment, no production customer changes, no production credentials printed, and no external messages sent. The local application includes changes not yet deployed to Vercel.

The baseline suite completed **770 checks: 769 passed, one failed**. The failing check reproduced reuse of a copied staff session after logout. Additional observation probes confirmed username enumeration and inventory cost exposure. After the fixes, **777/777 checks passed**, including the new staff/customer logout and cost-access checks. No claim is made that the application is unhackable or that this replaces an independent penetration test.

Final evidence: [results](audit-results/crm-1791004298993/results.json), [post-fix observations](audit-results/crm-1791004298993/security-observations.json), [backup restoration and migration verification](audit-results/crm-1791004298993/migration-report.json). Temporary test servers were stopped by the runner. No production deployment was made.

Baseline evidence: [results](audit-results/crm-1790961104212/results.json), [security observations](audit-results/crm-1790961104212/security-observations.json). These artifacts use synthetic accounts and do not contain production credentials.

## Findings and fixes

| ID | Severity / status | Evidence and impact | Change |
|---|---|---|---|
| AUTH-01 | Medium; fixed locally, pending deployment | A valid staff cookie returned HTTP 200 after logout when replayed. Someone already possessing a copied token could keep using it until expiry/revocation. This does not itself steal cookies or bypass password login. | Logout persists a session-version increment and audit record before returning success. This signs the account out on **all devices**. A failed revocation does not report successful logout. |
| AUTH-02 | Low; fixed locally, pending deployment | Wrong password for an existing username returned an extra `remaining` field. Locked identities also had distinct unauthenticated responses. This made account discovery easier. | Wrong-password responses use identical status/body, including locked identities. Unknown/inactive identities perform dummy bcrypt work. Lockout details remain available only after the correct password is supplied. This is not a proof of perfect timing indistinguishability. |
| DATA-01 | Medium; fixed locally, pending deployment | The inventory API exposed `purchasePrice` and calculated `margin`; section summaries exposed purchase-cost valuation. This violated the latest administrator-only cost requirement. | Server sanitization removes cost/margin from non-owner responses, inventory summaries omit valuation, and direct purchase-cost writes are denied. ADMIN/GOD retain access. Sale prices and stock operations remain available according to existing permissions. |
| AUTH-03 | Medium; fixed locally, pending deployment | Code review found customer booking logout also only deleted the browser cookie. Its JWT had no revocation check. Baseline replay was demonstrated for staff; customer replay prevention is covered by new post-fix tests. | Customer logout stores a SHA-256 token identifier in an audit revocation record and checks it on subsequent requests. Raw tokens are never stored. A database index supports the lookup. |
| DEPLOY-01 | Conditional medium; open deployment verification | On the direct local server, changing client-supplied `X-Forwarded-For` resets the IP-based login bucket. This demonstrates the trust assumption, **not a confirmed bypass on Vercel**. Per-account lockout still applies. | Before deploying behind Cloudflare or another proxy, verify the edge overwrites client IP metadata and prevents direct origin access, or configure a trusted-proxy strategy. Check the deployed setup with a controlled test account. |

The review approach follows [OWASP object-level authorization guidance](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/) and [authentication guidance on generic failure responses](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Severity labels above are contextual assessments, not formal CVSS scores.

## Tested controls

- Anonymous access to protected APIs; role and assignment restrictions, including legacy endpoints.
- Forged JWT signature, expired token, malformed token, and edited claims attempting administrator access.
- Staff self-promotion and foreign-customer edits; verification that rejected edits leave data unchanged.
- Cross-origin financial writes and a middleware-bypass header against route-level authentication.
- SQL-like search input, unknown request properties and oversized JSON requests.
- Unsafe upload types, private document access, inert stored script text and response protection headers.
- Concurrent payments/idempotency, concurrent bookings and OTP consumption, lockout and password-change revocation from the existing regression suite.
- Logout replay and product-cost restrictions through direct API requests.
- Browser workflows at desktop, tablet and mobile sizes, so security changes do not silently break normal work.

`npm audit --audit-level=high` reported **zero known vulnerabilities**, including development dependencies, at the time of this review. This checks published dependency advisories, not application logic or infrastructure. A tracked-file check found only `.env.example` and `.env.postgres.example` among the inspected environment/key/backup filename patterns; this was **not** a full historical secret scan.

## Remaining hardening and limits

1. `next.config.ts` still permits inline scripts through CSP. No executable stored-XSS payload succeeded in the tests, but nonce-based CSP would provide stronger defense. Uploaded PDFs are downloaded with sandbox/no-sniff headers; there is no antivirus/content-disarm service, and file signatures alone do not prove a document is harmless.
2. The complete latest financial permission policy is not implemented by this narrow cost fix: ACCOUNTANT still has expense access; MANAGER/RECEPTIONIST retain service editing under the pre-existing permission matrix. These policies need reconciliation with the latest administrator-only requirements before release. Passing existing permission tests does not approve those policy differences.
3. Login verification and rate-limit accounting share the application's scheduling transaction lock. No load/denial-of-service test was performed; move these to appropriately scoped locks/counters before high traffic. Header size checks do not constitute a streaming upload-resource exhaustion assessment.
4. Customer revocation records must be retained until their tokens expire. Current booking tokens last 24 hours. Do not purge fresh `BOOKING_LOGOUT` records as part of audit cleanup. A dedicated expiring session store is a future option.
5. This review does not cover DNS/TLS settings on the deployed host, Cloudflare/Vercel account security, production proxy behavior, provider integrations, server compromise, social engineering, exhaustive fuzzing or distributed brute force. No MFA assessment was performed.
6. The production deployment has **not received these fixes**. Deploy the reviewed code and pending migrations with a backup, then perform production login/logout and authorization smoke checks. Do not run local synthetic attack tests against live customer records.

## Build and migration notes

Next.js production compilation and type checking passed. The wrapper `npm run build` encountered a Windows lock when Prisma attempted to replace its already-generated engine DLL. The unchanged generated client was reused and `node node_modules/next/dist/bin/next build` completed successfully. The new migration only adds an audit lookup index; it does not change customer records or the Prisma client API.

Security test additions: [crm-security-probes.mjs](scripts/crm-security-probes.mjs). Regression command: `node scripts/run-crm-regression.mjs --snapshot backups/postgres-before-crm-1790288108957/snapshot.json`. The runner requires a disposable local audit database and restores a backup locally; it does not target production.
