# Integrations

Integrations follow an adapter pattern. Development adapters never contact external systems. Nothing below is claimed as live unless it was verified (see progress.md).

## Payments (`apps/api/src/modules/finance/providers.ts`)

| `PAYMENT_PROVIDER` | Behaviour | Verified |
|---|---|---|
| `mock` | Development only, refused when `NODE_ENV=production`. Creates local intents; success only via a webhook signed with `MOCK_WEBHOOK_SECRET`. The guest portal's "Simulate payment" button calls the same signed-webhook path. | ✅ tests |
| `stripe` | Official SDK: PaymentIntents (idempotency key), refunds, webhook signature verification (`STRIPE_WEBHOOK_SECRET`). Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`. | ❌ needs credentials |

Webhook endpoint: `POST /v1/payments/webhooks/:provider` (raw body, no session, no CSRF header). Events are stored once per `(provider, eventId)`. Payments are locked with `FOR UPDATE` while processing. A payment is marked `SUCCEEDED` only from the trusted provider event, never from the browser. Card data never touches this system.

Stripe setup: create a webhook endpoint for the events above, set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and test with the Stripe CLI (`stripe listen --forward-to localhost:4000/v1/payments/webhooks/stripe`). Client-side card collection (Stripe Elements using `clientSecret`) must be added to the portal before going live.

## Notifications (`apps/api/src/worker`)

| Variable | Values |
|---|---|
| `EMAIL_PROVIDER` | `log` (default: nothing sent, status `LOGGED`, recipient masked) / `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) |
| `SMS_PROVIDER` | `log` only. Add an adapter in `delivery.ts` for a real SMS gateway |

Templates (ar/en): booking confirmed / pending payment / modified / cancelled, pre-arrival, document reminder, check-in, payment receipt, payment due, service update, check-out summary, password reset. Outbox rows are de-duplicated with `dedupeKey`, retried with exponential backoff (max 6 attempts), and failures are visible under Settings → Notifications with a retry action.

## Private storage

`STORAGE_DRIVER=local` (AES-256-GCM files under `STORAGE_LOCAL_DIR`) or `s3` (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, credentials, `S3_FORCE_PATH_STYLE`). The bucket must block public access, enforce TLS, enable default encryption (SSE-S3 or SSE-KMS) and versioning with lifecycle rules that match the retention policy.

## Malware scanning

`MALWARE_SCANNER=clamav` streams files to clamd (`CLAMAV_HOST`, `CLAMAV_PORT`) with `INSTREAM`. Infected files are rejected (422). If the scanner is unreachable, the file is stored as `PENDING` and flagged in review. `none` marks files `SKIPPED`.

## OCR

`OCR_PROVIDER=none` (only option). Do not add a third-party OCR/AI provider for identity documents without explicit approval and a data-processing agreement. Extracted values must stay advisory and editable.

## Not implemented (adapter points documented)

Digital keys / door locks (stay check-in hook: `keyCardsIssued` is recorded only), channel managers / OTAs (reservation `source=OTA` exists), accounting export, BI. Implement each as an adapter module and keep secrets in environment variables or a secret manager, never in `IntegrationConfig.settings`.
