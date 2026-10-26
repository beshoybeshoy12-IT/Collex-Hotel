# Progress

_Last updated: 2026-10-27_

## Verified in this environment (Windows 11, Node 24, PostgreSQL 16 in Docker)

| Check | Result |
|---|---|
| `pnpm turbo run typecheck` | ✅ all packages |
| `pnpm turbo run lint` | ✅ (ESLint: no warnings or errors in web; tsc for api/shared) |
| `pnpm turbo run test` | ✅ **50 tests**: shared 19 (unit), api 25 (integration on real PostgreSQL `collex_test`), web 6 (i18n) |
| `pnpm turbo run build` | ✅ API (tsc) and web (Next.js, 45 routes) |
| Prisma migration from empty DB | ✅ includes the exclusion constraint and check constraints |
| API boots, `/health`, `/health/ready`, `/docs` | ✅ |
| OpenAPI export | ✅ `docs/api/openapi.json` (100 paths) |
| Docker stack (`docker compose --profile app up -d --build`) | ✅ images build; migrate → api (healthy) → worker → web; web page, logo assets, login, dashboard, document upload to the storage volume, worker draining the outbox — checked 2026-10-27 |
| Walk-in registration (2026-10-27) | ✅ end to end in the browser on the Docker stack: room chosen by reception, passport data per ICAO 9303 + ISO 3166-1 nationality picker, scan upload, verification, immediate check-in; audit log shows translated actions and readable details |
| Manual browser check (built-in browser) | ✅ Arabic default + RTL; public search → book (deposit) → portal → simulated signed webhook → confirmed; staff login; dashboard; room recommendations; check-in blocked by missing documents; documented exception check-in; English LTR switch on same page; floor plan; mobile layout (375 px) |

### Integration tests cover

- Auth: identical errors for unknown/known accounts, httpOnly SameSite cookie, CSRF header enforcement, logout revocation.
- Walk-in: chosen room honoured; every booked adult must be registered (unregistered adults block check-in); invalid ISO country codes and passport numbers rejected.
- Property isolation: foreign property header → 403; foreign record IDs → 404 (reservations, guests, documents).
- Granular permissions (housekeeping cannot book or take payments; cashier cannot close work orders; agent cannot view documents).
- Identity documents: content sniffing rejects spoofed HTML and PDF-with-JS; encrypted at rest; masked numbers; file view audited; unauthenticated/cross-property access blocked; reject → re-upload → verify; retention purge keeps audit record.
- Full stay: availability → reservation with accompanying adult → recommendations → assignment → check-in blocked until verified → receptionist cannot grant exception, manager can (audited) → service charge posted once → idempotent payment → check-out blocked by balance → settle → check-out → room DIRTY + HK task → clean → supervisor inspect → INSPECTED → receipt.
- Walk-in with auto-assignment, extension, room move (history kept as MOVED → ACTIVE).
- Cancellation per policy snapshot (free / non-refundable); date modification re-prices.
- Concurrency: two receptionists assigning the same room in parallel → exactly one wins; DB exclusion constraint blocks direct overlapping inserts; parallel bookings never exceed availability.
- Payments: forged webhook rejected; duplicate concurrent webhooks processed once; booking confirmed only via verified webhook; concurrent refunds cannot exceed captured amount.
- Maintenance block removes room from availability and assignment; only approver can close; release makes room DIRTY.
- Hold expiry; notification outbox (bilingual templates, dedupe, delivery without a real provider); document expiry job.

## Milestones

| # | Milestone | State |
|---|---|---|
| 1 | Foundation, tooling, env validation | ✅ |
| 2 | Schema, migrations, API conventions | ✅ |
| 3 | Auth, sessions, RBAC, property isolation, MFA (TOTP), password reset | ✅ |
| 4 | Arabic/English foundation, RTL, typed keys | ✅ |
| 5 | Properties, buildings, floors, categories, rooms, floor plans, rates, restrictions, availability | ✅ |
| 6 | Guests, identity documents, verification, retention | ✅ (OCR intentionally not enabled) |
| 7 | Booking engine: create/modify/cancel/holds/no-show, snapshots | ✅ |
| 8 | Assignment (manual/auto/group/walk-in/move/extend), identity-aware check-in/out | ✅ |
| 9 | Housekeeping, inspections, lost & found, maintenance, guest services | ✅ |
| 10 | Folios, charges, reversals, payments, deposits, refunds, invoices/receipts | ✅ |
| 11 | Public site + guest portal (AR/EN) | ✅ |
| 12 | Reports (performance/bookings/operations/financial + CSV), notifications | ✅ |
| 13 | Security & integration testing | ✅ (see above) |
| 14 | Deployment readiness (Dockerfiles, compose, CI, docs) | ✅ Docker stack verified locally; CI not yet run |
| 15 | Final audit & handover | ✅ this document |

## Known gaps and unverified items (honest list)

- **Not production-certified.** No external penetration test or compliance audit. Legal requirements for guest registration and retention must be configured per jurisdiction.
- **Stripe adapter not exercised** (no credentials). The mock provider is development-only and refused in production.
- **SMTP delivery not exercised.** With `EMAIL_PROVIDER=log`, messages are marked `LOGGED` and not sent. SMS has only the log provider.
- **ClamAV adapter not exercised** (`MALWARE_SCANNER=none` marks files `SKIPPED`, which is visible in review).
- **S3 storage adapter not exercised.** Local encrypted storage was tested. The MinIO image could not be pulled in this environment, so compose has no object store.
- **The CI workflow was written but has not run yet** (Docker stack verified locally).
- Rate-limit storage is in-memory (single instance). Use Redis-backed storage for horizontal scaling.
- PDFs come from browser print-to-PDF (correct Arabic shaping). Server-side PDF generation for e-mail attachments is not implemented.
- No Playwright E2E suite yet. The browser flows above were checked manually; API integration tests cover the workflows end to end.
- Digital key / access-control, channel manager/OTA, accounting and BI integrations are not implemented. Only the adapter pattern is documented.
- Calendar view of room availability (tape chart) and group block allocation UI (beyond multi-room + auto-assign) are not built.
- The Windows `next build` with `output: standalone` needs symlink rights, so standalone is opt-in (`NEXT_OUTPUT=standalone`, set in the Dockerfile).

## Next actions (priority order)

1. Add a Playwright E2E suite for the demonstration path in both languages (RTL/LTR assertions, mobile viewport).
2. Configure ClamAV + S3 in a staging environment and add integration tests for both adapters.
3. Verify Stripe in test mode (payment intents, webhooks, refunds) using Stripe CLI.
4. Redis-backed throttler storage. Server-side PDF rendering for e-mailed receipts.
5. Tape-chart availability calendar; group block allotments; OTA/channel manager adapter.

## Resume prompt

> Inspect the repository at its current state. Read `progress.md`, `DECISIONS.md` and `README.md`. Start PostgreSQL (`pnpm db:up`), run `pnpm install`, `pnpm --filter @collex/shared build`, `pnpm db:migrate`, then `pnpm typecheck && pnpm lint && pnpm test && pnpm build` to confirm the recorded state. Do not trust this file blindly: compare it with the code. Then continue with the first unfinished item under "Next actions", keeping tests green and updating `progress.md`.
