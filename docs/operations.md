# Operations: deployment, configuration, backup and recovery

## Environments

| | Development | Test / CI | Production |
|---|---|---|---|
| Database | `DATABASE_URL` (compose, port 5434) | `TEST_DATABASE_URL`, name must end in `_test` | managed PostgreSQL 16, TLS, PITR |
| Storage | `local` encrypted | `local` (`storage-test/`) | `s3` private bucket |
| Payments | `mock` | `mock` | `stripe` (mock refused) |
| E-mail | `log` | `log` | `smtp` |
| Cookies | `COOKIE_SECURE=false` | — | `true` (required) |

Configuration is validated at startup (`apps/api/src/config.ts`). The process exits with a list of invalid variables.

## Deploying

1. Build images from the repository root:

```bash
docker build -f infra/docker/api.Dockerfile -t collex-api .
```

```bash
docker build -f infra/docker/web.Dockerfile -t collex-web .
```

2. Run migrations as a **release step**, using a migration DB user (never `migrate reset` or `migrate dev` in production):

```bash
docker run --rm --env-file .env.production collex-api npx prisma migrate deploy
```

3. Start `collex-api` (`node dist/src/main.js`), one or more workers from the same image (`node dist/src/worker/main.js`), and `collex-web` with `API_INTERNAL_URL` pointing to the API.
4. Put both behind HTTPS (TLS terminated at a load balancer or reverse proxy). Serve only the web origin publicly, and expose the API only to the web server plus the provider webhook path `/v1/payments/webhooks/*`.
5. Health checks: `GET /health` (liveness), `GET /health/ready` (DB connectivity).

Local all-in-one (verified 2026-10-27): `docker compose --profile app up -d --build`. A one-shot `migrate` service applies migrations, then `api` (with a `/health/ready` healthcheck), `worker` and `web` start. The local stack runs with `NODE_ENV=development` (mock payments, local encrypted storage volume `apistorage`) and is not a production configuration. Stop dev servers first, because the stack uses ports 3000 and 4000.

Do not run `pnpm db:seed` in production; it refuses when `NODE_ENV=production`. Create the first platform administrator with a one-off script or SQL. Grant roles from Settings → Staff afterwards.

## Observability

- JSON access logs per request: correlation ID, method, path with IDs masked, status, duration. Bodies and query strings are never logged.
- `x-correlation-id` is accepted and returned. Error responses include it for support.
- The notification outbox state is visible in Settings → Notifications. Failed jobs can be retried.
- Error-monitoring hook point: `AllExceptionsFilter` (add Sentry or similar there, with PII scrubbing).

## Backup and recovery

- **Database:** enable point-in-time recovery on managed PostgreSQL, plus daily logical dumps (`pg_dump -Fc`) stored encrypted in a separate account and region. Test restores monthly into an isolated environment.
- **Private files:** S3 versioning plus cross-region replication. Lifecycle rules must delete noncurrent versions within the identity-document retention window, so purged documents do not survive indefinitely in backups.
- **Keys:** `DATA_ENCRYPTION_KEY` decrypts local files and document numbers. Store it in a secret manager with its own backup. Losing it makes those values unrecoverable. Rotation means re-encrypting with a new key (a migration script is not yet provided).
- **Restore order:** database → files → start API/worker. Then run `GET /health/ready` and a smoke test (login, dashboard, open a document preview).

## Performance notes

Indexes cover property/date/status lookups. The availability calculation loads the stay's window once per category. Booking and allocation serialise per property via an advisory lock, which suits single-property and moderate multi-property installations. Revisit (finer-grained locks, cached availability) for high-volume chains.
