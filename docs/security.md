# Security

This is a description of implemented controls, **not a compliance certification**.

## Authentication

- Argon2id password hashes. Minimum 10 characters, letters and digits.
- Opaque random session token in an httpOnly, SameSite=Lax cookie (`Secure` when `COOKIE_SECURE=true`). Only the SHA-256 hash is stored. Sessions expire (`SESSION_TTL_HOURS`) and are revoked on logout, "log out everywhere", password reset, role revocation and deactivation.
- Brute-force protection: per-IP throttling (`LOGIN_RATE_LIMIT_PER_MINUTE`) and a 15-minute lockout after 5 failures. Unknown and known accounts get the same error, with equalised timing (no account enumeration). Password-reset requests always return 202.
- Optional TOTP MFA per user (secret encrypted at rest). Enable it for privileged users.
- Password reset tokens are single-use, expire after 30 minutes, and are delivered in the URL fragment so they never reach server logs.

## Authorisation

- Granular permissions (`packages/shared/src/permissions.ts`), grouped into configurable roles. Roles are granted at platform, hotel-group or property scope.
- Property-scoped endpoints need `x-property-id`. The guard checks that the user holds a role there, and every query filters by `propertyId` (foreign IDs → 404). This is covered by tests.
- Sensitive operations need extra permissions: document view/verify/delete, check-in exceptions, folio adjustments, refunds, maintenance approval, guest erasure, user management.
- Guest-portal sessions are HMAC-signed, expiring, bound to one reservation, and cannot reach staff endpoints.

## Request security

- CSRF: every non-GET request needs the `x-collex-csrf: 1` header, and CORS allows only `WEB_ORIGIN`. Webhooks use signatures instead.
- Strict zod validation on every body and query. Prisma parameterises all SQL; raw SQL uses tagged templates only.
- Helmet security headers on the API. The web sets frame, nosniff, referrer and permissions headers.
- Rate limiting is global (600/min/IP) with stricter limits on login, password reset, booking lookup and public booking.
- Error responses carry a stable code and a correlation ID, never stack traces. 5xx errors log only the error name, message and stack, never request bodies.
- CSV exports neutralise spreadsheet formula injection.

## Data protection

- Identity documents: see [identity-documents.md](identity-documents.md) (private, encrypted, content-validated, audited, retention-purged).
- Audit events record actor, property, action, entity, IP and correlation ID, with sensitive keys redacted (`password|token|secret|documentNumber|card|cvc|mfa`).
- No card data is stored. Payments use provider tokens and intents only.
- Guest anonymisation and data export are available to `guests.erase`. Legal hold blocks deletion.

## Secrets

All secrets come from the environment and are validated at startup. Production refuses the mock payment provider, insecure cookies and local file storage. `.env` is git-ignored, and `.env.example` contains placeholders only.

## Recommended before go-live

External penetration test; dependency audit in CI (`pnpm audit`, present as a non-blocking step); Redis-backed rate limiting; WAF/TLS termination; database encryption at rest and least-privilege DB roles (separate migration and runtime users); ClamAV enabled; MFA enforced for admin roles; log shipping with PII scrubbing; documented incident-response process.
