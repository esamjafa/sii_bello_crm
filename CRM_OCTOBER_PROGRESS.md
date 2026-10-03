# Sii Bello — October requirements

October 2 latest pack: pearl/mauve identity, category-first cards with duration, read-only service detail drawer/maximize, calm background preference, extra service classifications, gender-specific laser regions and server-side overlap rejection have been added locally. Latest validation is recorded in `CRM_OCT02_REPORT.md`. The earlier 743-check result below is historical, not a result for the latest code. Full delivery scope and required business data: `SII_BELLO_DELIVERY_SCOPE.md`.

Status: first implementation phase validated October 2 with 743/743 checks passing. Existing production stays on the September 30 release. See [phase report](CRM_OCTOBER_REPORT.md) for implemented work, screenshots and explicit remaining requirements.

## Implementation sequence

1. Service catalogue, configurable laser areas/offers, conditional session details, server-calculated price snapshots.
2. Staff qualifications, equipment/room conflicts and service buffers across booking paths.
3. Customer storefront, checkout holds, orders and stock settlement (live payment requires a selected merchant gateway).
4. Consent history, session photos, college/event contact settings, administration-only cost reporting.
5. Integration status, idempotent lead ingestion, campaign attribution and reviewed invoice extraction (external accounts/providers required).
6. Regression, acceptance-case report and graphical site map.

## External configuration requested

- Merchant payment gateway and deposit policy.
- Authorized Meta/Google advertising accounts, WhatsApp Business Platform number and OCR provider.
- Actual laser prices, offers, equipment, qualifications, business contact numbers and delivery policy must come from the business; do not insert invented production values.

## Existing foundation

Unified customers with normalized unique phone numbers; scoped department/assignment permissions; invoices and immutable payment movements; inventory movements; staff shifts and leave; documents; events and college; RTL reference-based layouts. September release passed 714 regression checks and 17 production smoke checks.

The new specification requests WhatsApp Platform integration again. Configure it explicitly; do not reactivate the previously removed gateway or invent credentials.
