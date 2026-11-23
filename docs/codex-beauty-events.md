# Sii Bello Beauty Events

Extend the existing Events module. Inspect the Next.js routes, Prisma schema, customer profiles, event records, immutable payments, and staff permissions first. Reuse those models where they fit. Preserve existing data and Arabic RTL staff screens. Use sample data and provider test modes for verification.

## Staff workspace

- Create draft events and publish a public page at /events/<slug>. Store event name, description, venue, time zone, start/end dates, agenda sessions with times and presenters, capacity, registration deadline, ILS ticket price, and publication status. Preview before publishing. Public pages show only published information.
- Give each event an audience view with Interested, Registered awaiting payment, Paid, Cancelled, and Refunded states. Reuse CRM customer profiles where possible. Show amount due, paid amount, discounts, and email/WhatsApp delivery status. Deduplicate contacts and let staff filter and export according to their permissions.
- Let authorized staff select interested contacts and send an approved event invitation by email or WhatsApp. Include the public landing-page link. Show a preview, recipient count, and consent eligibility before sending. Record channel consent and opt-outs, exclude opted-out contacts from marketing, and log delivery, retries, and failures. Keep promotional invites separate from transactional registration confirmations.

## Public registration and payment

- Show the event details, schedule, availability, price, and Register action on the public landing page. Collect name, email, mobile number, and channel permissions where required. Show original price, discount, and final amount before checkout.
- Create a registration with an amount due and a unique checkout link. Use an existing configured payment provider if available. Otherwise define an adapter for hosted checkout with a test implementation and document live setup. Calculate prices on the server using integer agorot. Keep provider secrets server-side and use hosted checkout for card entry.
- Confirm payment using a verified provider webhook or authoritative provider lookup. Validate amount, currency, and registration reference. Use an idempotent state transition and the existing payment ledger. A browser redirect alone must not mark a registration paid. Handle abandoned, failed, duplicate, late, and refunded payments. Reserve seats for a defined time and release expired reservations. Define a staff resolution path if a late payment arrives after its seat was released. Confirm zero-cost registrations after validating eligibility and capacity.
- Support event-specific promo codes with fixed ILS or percentage discounts, validity dates, and optional redemption limits. Apply one code per registration. Validate use and reserve limited redemptions atomically with seat holds. Save the original price, discount, code, and final amount on the registration.

## Confirmation and attendee links

- Once paid or confirmed at zero cost, send an email and WhatsApp confirmation to the attendee's registered contact details, respecting channel eligibility. Include event name, schedule, venue, public event-page URL, and a unique private registration link. Show message status per channel. Missing provider setup or failed delivery should remain visible and retryable without duplicating confirmation records.
- Use an opaque, unguessable private token scoped to one registration. Store a token hash, support revocation or rotation, and avoid exposing attendee data in URLs or showing full contact or payment details on the public link. The private page displays the attendee's registration status, event details, and link back to the public landing page.
- Check for existing email and WhatsApp integrations, including GoHighLevel if configured. Use test adapters when credentials are unavailable. Document setup, template approval, webhook configuration, and how to test without sending real messages.

## Verification

- Use reversible database migrations and follow the existing server-side role checks and audit history. Test with sample contacts only.
- Verify draft-to-publish, invitation filtering, registration, invalid and valid promo codes, checkout, signed payment confirmation, both notification channels, unique attendee links, and duplicate webhook delivery.
- Verify simultaneous registrations and promo redemptions, expired reservations and late payments, failure retries, refunds, and unauthorized staff access. Run the checks in README and document provider configuration required for launch.
