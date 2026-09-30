# Operational CRM implementation

Requested: unified customers, follow-ups/tasks, appointments, immutable payments,
assigned-role access, salon, college, events, inventory, reports and Arabic RTL.

Implementation rules:
- Customer is the canonical identity; students and event registrations link to it.
- Payments and stock changes are append-only transactions. Voids retain history.
- Permissions and assignment filters apply on the server, including direct URLs.
- Preserve existing records and financial opening balances in additive migrations.
- Test against a disposable PostgreSQL database before migrating the active database.
- Keep currencies separate in reports. Never silently combine ILS/AED/USD.
- Default local phone numbers use Israel (+972); international numbers retain their code.
- Automated WhatsApp delivery and its scheduler have been removed. Follow-ups remain in-app tasks; WhatsApp links are manual. Public phone-code booking is unavailable; staff can manage appointments.

Validation includes production build, database migration/backfill, role/ownership
matrix, concurrent payments/stock/booking, archive and audit history, HTTP security,
browser desktop/mobile flows, and dependency audit. Findings and coverage limits go
in CRM_REGRESSION_REPORT.md. Passing tests does not establish absence of all defects.
