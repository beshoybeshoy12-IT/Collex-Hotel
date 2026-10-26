# Collex Hotel — فندق كوليكس

A bilingual (Arabic-first, full RTL / English LTR) hotel platform: public booking engine and guest portal, plus the internal property-management system for reception, reservations, guest registration and identity documents, room allocation, housekeeping, maintenance, guest services, folios and payments, reports, and audit.

> **Status:** working software with automated tests. **Not yet production-certified.** It has had no external security review, live payment-provider verification, or legal/compliance sign-off. See [progress.md](progress.md) for what is verified and what remains.

## Monorepo layout

```
apps/
  api/        NestJS REST API (v1) + Prisma/PostgreSQL + background worker (src/worker)
  web/        Next.js 15 app: public site, guest portal, staff app, printable documents
packages/
  shared/     Business rules shared by API and web: pricing, stay dates, state machines,
              room eligibility/ranking, permissions & roles, zod validation schemas
docs/         Architecture, API (OpenAPI), security, operations, localisation, workflows
infra/docker/ Dockerfiles for API/worker and web
```

## Prerequisites

- Node.js ≥ 20 (tested with 24), pnpm 9 (`npm i -g pnpm@9` or `corepack enable`)
- Docker (for PostgreSQL 16 and Redis), or your own PostgreSQL 16 instance

## Quick start (development)

```bash
pnpm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` (see the generation commands in the file) and `SEED_DEFAULT_PASSWORD`. Then copy it for the Prisma CLI:

```bash
cp .env apps/api/.env
```

```bash
pnpm db:up
```

```bash
pnpm --filter @collex/shared build
```

```bash
pnpm --filter @collex/api prisma:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

- Web: http://localhost:3000 (redirects to `/ar`, Arabic is the default)
- API: http://localhost:4000, Swagger UI at http://localhost:4000/docs (non-production only)
- Worker (notifications, hold expiry, document expiry/retention, pre-arrival reminders): run `pnpm worker` in a second terminal

### Demo accounts (development seed data only)

All use the password you set in `SEED_DEFAULT_PASSWORD`. Two fictional properties are seeded: **RUH** (Collex Riyadh) and **JED** (Collex Jeddah Corniche).

| Email | Role | Scope |
|---|---|---|
| admin@collex.test | Platform administrator | all properties |
| manager.ruh@collex.test | Property manager | RUH |
| reception.ruh@collex.test | Front-desk receptionist | RUH |
| agent.ruh@collex.test | Reservation agent | RUH |
| cashier.ruh@collex.test | Cashier / finance | RUH |
| hk.supervisor.ruh@collex.test | Housekeeping supervisor | RUH |
| hk.ruh@collex.test | Housekeeping staff | RUH |
| maintenance.ruh@collex.test | Maintenance | RUH |
| auditor@collex.test | Auditor (read-only) | RUH |
| reception.jed@collex.test | Receptionist | JED |

Seeded promo code: `WELCOME20` (min. 2 nights). The non-refundable rate requires a 100% deposit, which exercises the payment hold and webhook flow.

### Demonstration path

1. Visit http://localhost:3000, search, choose the non-refundable rate, and book. You land in the guest portal with the booking **awaiting payment**.
2. Click **Simulate payment (development provider)**. This sends a signed webhook through the same path a real provider uses, and the booking becomes **confirmed**. No real payment is made.
3. Upload a passport scan for the guest in the portal, or as staff.
4. Sign in as `reception.*`, go to **Identity documents**, open the document, confirm it is legible, and verify it.
5. **Front desk → Arrivals**: assign a room from the ranked recommendations, then **Check in**. Check-in is blocked until the required documents are verified, unless an authorised user records a documented exception.
6. Post a charge, take a payment, check out, then print the receipt (browser print → Save as PDF).
7. Sign in as `hk.ruh@collex.test`: clean the room. `hk.supervisor.ruh` inspects it, and it becomes ready again.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API (watch) + web (dev) |
| `pnpm build` | Build shared, API, web |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm test` | Unit tests (shared, web i18n) + API integration tests on `TEST_DATABASE_URL` |
| `pnpm db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | Seed development data (refuses in production) |
| `pnpm --filter @collex/api openapi` | Regenerate `docs/api/openapi.json` |

Integration tests use a separate database whose name must end in `_test` (default `collex_test`; create it once with `CREATE DATABASE collex_test`). The test harness clears that database before each suite.

## Documentation

- [docs/architecture.md](docs/architecture.md): modules, data model, key invariants
- [docs/workflows.md](docs/workflows.md): registration, documents, room allocation, check-in/out
- [docs/identity-documents.md](docs/identity-documents.md): upload, storage, review, retention configuration
- [docs/localization.md](docs/localization.md): Arabic/English, RTL, dates, numbers, PDFs
- [docs/integrations.md](docs/integrations.md): payments, notifications, storage, OCR, malware scanning
- [docs/security.md](docs/security.md): authentication, authorisation, data protection
- [docs/operations.md](docs/operations.md): deployment, environment, backups, recovery
- [docs/testing.md](docs/testing.md): test strategy and coverage
- [docs/api/openapi.json](docs/api/openapi.json): generated OpenAPI 3 specification
- [DECISIONS.md](DECISIONS.md) · [progress.md](progress.md)
