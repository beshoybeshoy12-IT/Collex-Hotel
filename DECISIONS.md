# Architectural and business decisions

Each entry: decision — reason — consequence.

## Architecture

1. **Modular monolith (NestJS) + Next.js web + shared TypeScript package.** One authoritative API and database for every application (public site, guest portal, reception, housekeeping, administration). Business rules that both sides need (pricing, date maths, eligibility, state machines, validation) live in `packages/shared` and are unit-tested once.
2. **Background worker lives in `apps/api/src/worker`** instead of a separate `apps/worker` package. It boots the same Nest module graph (`createApplicationContext`) so it reuses domain services without duplicating code. It is deployed from the API image with a different command.
3. **PostgreSQL transactional outbox + `FOR UPDATE SKIP LOCKED` instead of BullMQ/Redis queues.** Notifications are written in the same transaction as the business change, so a confirmation is never lost or sent for a rolled-back booking. Delivery retries use exponential backoff, and several workers can run safely. Redis is in docker-compose for future caching and distributed rate-limit storage, but nothing requires it today. Consequence: the throttler uses in-memory storage per API instance. Use a Redis-backed throttler storage for multi-instance production.
4. **Zod schemas as the single validation contract** (shared with the web forms). The API converts them to OpenAPI with `zod-to-json-schema` (`ZBody`/`ZQuery` decorators).
5. **Locale routing `/ar/...` and `/en/...`, with Arabic as the default.** Middleware redirects unknown paths to the remembered locale (cookie) or Arabic. Authenticated staff also have the preference stored on their user record.

## Data integrity

6. **Business dates are `date` columns and `YYYY-MM-DD` strings in the property time zone.** They are never converted through timestamps. The stay interval is half-open: arrival included, departure excluded.
7. **Room double-allocation is prevented at three levels:** an application eligibility check, a row lock on the room (`SELECT … FOR UPDATE`), and a PostgreSQL **exclusion constraint** (`btree_gist`, `daterange && `) on PLANNED/ACTIVE assignments. Tests prove that concurrent requests and direct DB inserts cannot create overlaps.
8. **Inventory decisions run under a per-property advisory transaction lock** (`pg_advisory_xact_lock`). This serialises booking, modification and extension for that property, which prevents overbooking under concurrency (tested with parallel requests). Throughput is ample for a single property. Revisit for very large multi-property installations (lock per category/date).
9. **Overbooking is off by default.** It can be enabled per property with an explicit `overbookingLimit`.
10. **Price and policy snapshots.** Each reservation stores nightly prices, discount, service charge, tax percentages and the cancellation policy at booking time. Later rate changes never alter existing reservations. Date modifications and extensions re-price explicitly and record the old and new totals in history.
11. **Money uses `Decimal(14,3)` in the DB and `decimal.js` in code.** Floats are never used. Rounding is half-up to the currency's minor unit.
12. **Nothing financial or historical is hard-deleted.** Corrections are reversal entries; cancellations, moves and no-shows are state changes; room moves keep the old assignment as `MOVED`. Guest erasure anonymises personal fields and purges document files but keeps financial records.
13. **Room charges are posted per night** with idempotency keys (`room:{line}:{date}`), by the night audit and at check-out. Repeated runs never double-post.
14. **Separate room dimensions:** housekeeping status, maintenance status (derived from open work orders), occupancy (derived from ACTIVE assignments) and assignment state. A room can be clean and occupied, or clean but out of order.

## Identity documents

15. **Private storage only; files are streamed through an authorised API endpoint**, never through public or signed bucket URLs. Development uses AES-256-GCM encrypted files on disk. Production uses a private S3 bucket with server-side encryption. Every view is audited.
16. **File type is detected from content (magic bytes).** Only JPEG/PNG/WebP/HEIC/PDF are allowed, and PDFs with JavaScript, launch actions or embedded files are rejected. Storage keys are random.
17. **Document numbers are encrypted at rest** and only the last 4 characters are kept in clear for masked display.
18. **Malware scanning:** a ClamAV (clamd INSTREAM) adapter is included. With `MALWARE_SCANNER=none`, files are marked `SKIPPED`, visibly flagged in the review UI, and the risk is documented. Production should enable ClamAV.
19. **OCR is not enabled.** No document is sent to a third party. The data model has an `ocrData` field and the review UI states that extracted data is never proof of authenticity. Verification is always a human decision.
20. **Check-in policy is configurable per property** (scope: none / primary guest / all adults / foreign adults; accepted types; verification required; documented exceptions allowed; deposit and inspected-room requirements; retention days). No universal legal rule is hard-coded.
21. **Guest-uploaded documents** may omit metadata. Staff complete the required fields during review, and verification enforces the document type's required fields.

## Security

22. **Opaque server-side sessions** (random token, SHA-256 hash stored, httpOnly + SameSite=Lax cookie, expiry, revocation, revoke-all on password reset). Not JWT, so revocation is immediate.
23. **CSRF:** every state-changing request must carry `x-collex-csrf: 1`. Browsers cannot send this custom header cross-site without CORS approval, and CORS only allows `WEB_ORIGIN`. Provider webhooks are exempt and verified by signature instead.
24. **Authorisation is enforced in the API per property** (`x-property-id` + role scope: platform, group or property). Every query also filters by `propertyId`, so a foreign ID returns 404. The frontend hides actions only as a convenience.
25. **Argon2id** password hashing, constant-time handling of unknown accounts (no enumeration), 5-attempt lockout, per-IP login throttling, optional TOTP MFA.
26. **Guest portal access** uses an HMAC-signed, expiring cookie bound to a single reservation, obtained with confirmation number + last name. It never grants staff access.

## Payments

27. **Provider adapter interface** with a development-only `mock` provider (refused at startup in production) and a Stripe adapter (official SDK, not verified here for lack of credentials). Online payments are only marked successful from a **verified webhook**. Webhook events are de-duplicated by `(provider, eventId)`, and payments/refunds use idempotency keys. Cash, card-terminal and bank-transfer payments are recorded directly by authorised cashiers.

## Documents / PDFs

28. **Printable documents (registration card, folio, receipt, tax invoice) are HTML pages rendered by the browser**, and "Save as PDF" produces the PDF. This guarantees correct Arabic shaping, ligatures and bidi, which server-side PDF libraries often get wrong. Server-generated PDFs (headless Chromium) are listed as future work for e-mail attachments.

## Calendar and numerals

29. Arabic UI uses the **Gregorian calendar** for hotel business dates (`ar-u-ca-gregory`). Digits default to Western; Arabic-Indic digits are a per-property setting.
