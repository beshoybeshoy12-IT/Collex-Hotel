# Architecture

```
Browser ──► Next.js (apps/web) ──/api/* rewrite──► NestJS API (apps/api) ──► PostgreSQL
                │  public site, guest portal,                │                 ▲
                │  staff app, print pages                    ├─► private storage (encrypted disk / S3)
                                                             └─► outbox ◄── worker (apps/api/src/worker)
                                                                             ├─ e-mail/SMS providers
                                                                             ├─ hold expiry, document expiry
                                                                             └─ retention purge, pre-arrival
```

The browser only talks to the web origin. `/api/*` is proxied to the API, so the session cookie is first-party, httpOnly and SameSite=Lax.

## API modules (`apps/api/src/modules`)

| Module | Responsibility |
|---|---|
| auth | login, sessions, logout/revoke, password reset, TOTP MFA, locale preference |
| properties | property settings, check-in policy, document types, buildings, floors, categories, rooms, floor plans, housekeeping status |
| rates | rate plans, price rules, restrictions, **availability** and **quoting** |
| guests | guest profiles, legal hold, anonymisation, export |
| documents | identity document upload/replace/review/correct/purge, secure streaming, **requirements evaluation** |
| reservations | create/modify/cancel/confirm/no-show, occupants, hold expiry |
| frontdesk | assignments (recommend/assign/auto/unassign), check-in, check-out, walk-in, extend, room move, night audit, registration card |
| operations | housekeeping tasks, lost & found, maintenance work orders, guest service requests |
| finance | folios, postings, reversals, payments, refunds, provider webhooks, invoices/receipts |
| reports | performance (occupancy/ADR/RevPAR), bookings, operations, financial; CSV export |
| notifications | outbox enqueue, bilingual templates |
| admin | staff & roles, audit log, notification log |
| public | public booking engine and guest portal |

Cross-cutting (`src/common`): `SecurityGuard` (CSRF, sessions, guest sessions, property permissions), `AllExceptionsFilter` (stable error codes), `AuditService` (redacted audit trail), `CryptoService` (AES-256-GCM, HMAC), zod validation decorators, request correlation IDs and structured access logs.

## Data model highlights (`apps/api/prisma/schema.prisma`)

- Tenancy: `HotelGroup` → `Property`. All operational tables carry `propertyId`.
- Access: `User`, `Role` (permission list), `UserRole` (platform / group / property scope), `Session`.
- Structure: `Building` → `Floor` → `Room` (+ `RoomCategory`). Geometry is in `FloorPlanLayout`/`RoomGeometry`, keyed by room ID and separate from business data.
- Booking: `Reservation` (status, totals, **policySnapshot**) → `ReservationRoom` (category, dates, **nightlyRates snapshot**) → `ReservationOccupant`; `ReservationHistory`.
- Allocation: `RoomAssignment` (PLANNED/ACTIVE/COMPLETED/CANCELLED/MOVED, previousAssignmentId, source, reason) with an **exclusion constraint**. `Stay` holds one per reservation room line.
- Identity: `IdentityDocument` (encrypted number, status, reviewer, retention) → `DocumentFile` (random storage key, sha256, scan status, superseded) and `DocumentEvent`. `CheckInPolicy` and `DocumentTypeConfig` hold the per-property configuration.
- Operations: `HousekeepingTask`, `LostFoundItem`, `MaintenanceWorkOrder` (+ notes, date-ranged blocks), `ServiceRequest`, `RoomStatusHistory`.
- Finance: `Folio` → `FolioEntry` (signed amounts, idempotency key, reversal link), `Payment`, `Refund`, `PaymentProviderEvent` (dedupe), `Invoice`, `PropertySequence` (gap-safe counters).
- Platform: `Notification` (outbox), `AuditEvent`, `IntegrationConfig`.

## Key invariants

1. A physical room is never in two PLANNED/ACTIVE assignments for overlapping nights (enforced by a DB constraint).
2. Sellable inventory per category and night = active rooms − maintenance-blocked rooms − inventory-holding room lines (+ explicit overbooking allowance).
3. Reservation status changes follow `RESERVATION_TRANSITIONS` and use optimistic checks (`updateMany where status = from`).
4. A stay can only be created when document requirements are satisfied (or an authorised, audited exception exists), the room passes readiness re-validation, and any required deposit is paid, all inside one transaction.
5. Money is never computed with floats. Folio balance = Σ signed entries.
6. Every sensitive action writes an `AuditEvent` with redacted details.
