# Reference screens — September 29

Reference: `WhatsApp Unknown 2026-09-29 at 16.02.14.zip` (seven images).

The salon, college, and event landing screens now follow the supplied composition: four colored metric cards, a compact main table, and customer/registration details, notes, files, and daily work panels beneath it. College includes upcoming courses; salon includes the signed-in employee's split shifts. Selecting a person updates the detail and notes panels.

The shared shell uses a dark plum sidebar, white workspace and panels, navy text, fuchsia primary buttons, purple outline icons, and soft pink, purple, and amber metric cards. Search, add actions, date, and the account badge follow the reference header. The previous palette toggle remains available.

Cards open the existing lists. Full resource management remains under “كل السجلات والخدمات”. Phone links, note/file saving, task completion, profile opening, record editing, and permitted payment actions use the existing server workflows. All displayed names and numbers come from scoped application data; the example records and counts in the images are not seeded into the business database.

Server-side department and ownership checks still apply to the new screen endpoint. Financial controls remain permission-gated even where the mockups show them to department employees. GOD visibility rules remain unchanged.

Responsive behavior keeps the reference layout on desktop, rearranges panels on tablets, and stacks them on mobile with scrollable tables.

Validation completed September 30, 2026: **714/714 regression checks passed, zero failures**. TypeScript checking and the production build also passed. The regression suite ran against an isolated local database restored from the backup; it did not modify the production database.

The suite covers authentication, role/department/assignment isolation, hidden GOD accounts, financial restrictions, appointments, split shifts, invoices/payments, documents, and the new department screens. Browser checks cover desktop, tablet, and mobile widths (1440, 820, and 390 pixels), plus employee reference screens at 1585 pixels. New checks verify four metric cards, the plum/fuchsia palette, correctly scoped note saving, and no runtime errors for salon, college, and event employee screens. These automated checks are not a comprehensive penetration test.

- [Complete test results](audit-results/crm-1790749540924/results.json)
- [Migration validation](audit-results/crm-1790749540924/migration-report.json)
- [Salon employee screenshot](audit-results/crm-1790749540924/reference-salon-STAFF.png)
- [College employee screenshot](audit-results/crm-1790749540924/reference-college-COLLEGE.png)
- [Event employee screenshot](audit-results/crm-1790749540924/reference-events-EVENT_MANAGER.png)
- [Mobile salon screenshot](audit-results/crm-1790749540924/salon-390.png)

Screenshots contain isolated test fixtures. The temporary test services were stopped after the run. Deployed to [Vercel production](https://sii-bello.vercel.app) on September 30, 2026, after backing up the database and applying the three preceding CRM migrations. The visual redesign adds no database migration. All 17 live smoke checks passed; see [deployment details](VERCEL_DEPLOYMENT.md).
