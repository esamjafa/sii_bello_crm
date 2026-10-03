# Sii Bello — October 1 references and operational changes

Updated October 2, 2026. **This is a completed, tested implementation phase, not completion of the entire expanded specification. Changes are local and have not been deployed.**

## Reference and design

Reviewed the 18 images in `WhatsApp Unknown 2026-10-01 at 18.35.32.zip`, including duplicate variants. The implementation uses the plum navigation, white panels, lilac surfaces and pink actions, an appointments navigation entry, a shorter operational dashboard, course and event summaries, categorized service cards, conditional treatment panels, and a separate responsive customer catalogue.

Body/face selectors are interactive native SVG illustrations, not the photographic artwork in the references. Reference names, prices, stock, staff photos and statistics were not inserted into production. Service/product images come from their records. The existing palette toggle remains available.

## Implemented in this phase

- Editable laser areas and optional offers, synchronized body/list selection, integer-cent totals, server-side offer validation and saved appointment price/area/offer snapshots.
- Hair coloring fields, color swatches, current/desired/result levels, texture, density, products, formula and results; skin face regions and treatment steps; service-specific optional details.
- Unified customer form starts with identity and service selection; switching service clears prior details only after confirmation when details were entered.
- Explicit employee service qualifications, shared room/device identifiers, booking buffers and conflict checking under the existing database scheduling lock.
- Appointment date/day/week, employee and service filters.
- Public service/product browsing, qualified availability, selection of available employee, cart and separate currency totals. Records are hidden publicly until explicitly enabled by management. **The cart does not create a paid order or reserve stock.**
- Session-linked before/after images. Internal session images no longer require publication consent. Marketing and image-publication consent are separate, have no preselected approval, and retain withdrawal history and audit records. Staff cannot read another employee's session-linked images through a shared customer.
- Product SKU and explicit storefront visibility.
- [Site map explanation](SII_BELLO_SITE_MAP.md) and [editable Mermaid diagram](SII_BELLO_SITE_MAP.mmd).

## Validation

Production build and TypeScript checks passed. **743/743 regression checks passed, zero failures**, using an isolated local database. Production was neither migrated nor seeded.

The suite includes role and department isolation, GOD visibility, financial restrictions, transaction concurrency, schema migration rehearsal, browser workflows, desktop/tablet/mobile layouts, body/list synchronization, optional offer calculation, conditional hair fields, internal photo access, consent withdrawal, customer service preferences and appointment filters.

- [Complete results](audit-results/crm-1790938537893/results.json)
- [Migration rehearsal](audit-results/crm-1790938537893/migration-report.json)
- [Dashboard](audit-results/crm-1790938537893/dashboard-1440.png)
- [Laser selection desktop](audit-results/crm-1790938537893/october-laser-desktop.png)
- [Mobile booking catalogue](audit-results/crm-1790938537893/october-booking-mobile.png)
- [College](audit-results/crm-1790938537893/college-1440.png)

These checks are not a comprehensive penetration test or verification of an external payment provider.

## Remaining work — explicitly not active

| Requirement | Current limit / next work |
|---|---|
| Online paid booking | Gateway selection, deposit policy, temporary holds, verified payment callbacks and confirmation still need implementation and end-to-end sandbox testing. Availability is advisory until an appointment is saved. |
| Product checkout | Order records, delivery/pickup, discounts, verified settlement, stock deduction after payment and refunds remain. |
| Advertising / WhatsApp | Official authorized account connections, idempotent webhook ingestion, campaign attribution/spend, conversations and integration monitoring remain. The removed WhatsApp gateway has not been restored. |
| Invoice extraction | OCR provider, extraction review, original-file retention and duplicate detection workflow remain; no extracted amount is automatically saved. |
| Administration | Multiple scoped roles, editable college/event contact settings, event-specific timezone handling, single-upcoming-event policy and optional-cost service profit report remain. |
| Data operations | Scheduled backups, user-facing export, documented recovery automation and business data cleanup/review remain. Existing backup and migration rehearsal scripts are available. |
| Catalogue setup | Management must enter real area prices/offers and service image paths, assign staff skills and room/device identifiers, then explicitly publish services/products. |

The site map uses dashed amber nodes for unfinished work. It should not be treated as a claim that those workflows are operational.

## Deployment requirements

New migration: `20261001090000_service_selection`. It adds fields and the consent-history table without deleting existing business records. Back up production before applying it. Existing staff service lists must be reviewed and populated with service IDs before relying on the stricter qualification check; empty skills do not mean qualified for every service. No new pricing or marketing consent is inferred from legacy records.
