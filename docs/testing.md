# Testing

| Suite | Location | Runs against | What it covers |
|---|---|---|---|
| Unit | `packages/shared/test` (vitest) | pure functions | stay-night maths, time zones, leap years, pricing with priorities/weekdays/extra occupancy/decimal precision, cancellation fees, state machines, room eligibility & ranking, validation, role permissions, masking |
| Integration | `apps/api/test/*.spec.ts` (jest + supertest) | real PostgreSQL `*_test` database, full Nest app | security & isolation, identity documents, full stay lifecycle, walk-in/move/extend, cancellation/modification, reports, concurrency (assignment races, overbooking, exclusion constraint), payment webhooks & refunds, maintenance blocks, hold expiry, notifications, retention jobs |
| i18n | `apps/web/test/i18n.test.ts` (vitest) | message files and source | Arabic default, RTL/LTR mapping, key parity, placeholders, untranslated strings, missing keys |

Run everything:

```bash
pnpm test
```

Integration test database (once):

```bash
docker exec collex-hotel-postgres-1 psql -U collex -c "CREATE DATABASE collex_test"
```

The global setup applies migrations with `prisma migrate deploy`. Each suite truncates the `_test` database and loads the seed fixtures, and the harness refuses any URL whose database name does not end in `_test`.

## Not yet automated

- Browser E2E (Playwright) for RTL/LTR layouts and mobile. These flows were checked manually in the built-in browser (see progress.md).
- Stripe/SMTP/ClamAV/S3 adapters against real services.
- Load tests.
