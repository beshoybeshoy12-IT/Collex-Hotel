# Identity documents: configuration and handling

Identity documents are highly sensitive personal data. This page describes how they are handled and what each hotel must configure.

## Per-property configuration (Settings → Check-in policy)

| Setting | Meaning |
|---|---|
| Document scope | `NONE`, `PRIMARY_GUEST`, `ALL_ADULTS`, `FOREIGN_ADULTS` (adults whose nationality differs from *home country*, or is unknown) |
| Accepted types | passport, national ID, residence permit, driving licence, other (per property) |
| Require verification | staff must mark documents verified before check-in. If off, an uploaded, unexpired document is enough |
| Allow exceptions | authorised users (`frontdesk.checkin_exception`) may check in with missing documents, giving a reason. Recorded on the stay and in the audit log |
| Retention days | files and document numbers are purged this many days after upload, except under legal hold or during an active stay |

`DocumentTypeConfig` (seeded per property) defines which metadata fields each type requires (e.g. passport: issuing country, expiry date) and whether a back side is required. **Configure these according to applicable law and professional advice.** The platform does not impose universal legal rules.

## Upload

- Staff: guest page or reservation → occupants. Guests: the guest portal (only for occupants of their own reservation).
- Formats: JPEG, PNG, WebP, HEIC, PDF; max `UPLOAD_MAX_MB` (default 10) per file, 10 files per document.
- Type is detected from file content; extension and browser Content-Type are ignored. PDFs with JavaScript/launch/embedded files are rejected.
- Optional malware scan (ClamAV). Infected files are rejected. With the scanner disabled, files are marked `SKIPPED` and flagged in review.
- Storage keys are random. Files are AES-256-GCM encrypted (local driver) or stored in a private bucket with SSE (S3 driver). If the database write fails, uploaded objects are deleted.

## Review

Statuses: `AWAITING_REVIEW → VERIFIED | REJECTED | REUPLOAD_REQUESTED`, plus `EXPIRED` (daily job), and `PURGED` (files removed). The reviewer:

1. Opens each scan with **Secure preview**: streamed through `GET /v1/documents/:id/files/:fileId` (permission `documents.view`), `Cache-Control: no-store`, sandboxed CSP, audited as `DOCUMENT_FILE_VIEWED`.
2. Compares with registration details, confirms legibility, then verifies or rejects with a reason (shown to the guest).
3. Corrects metadata with a reason when needed. Corrections to a verified document send it back to review.

Uploading a document never verifies it automatically, and OCR is not enabled. If OCR is added later, its output must stay advisory and editable (see `ocrData`).

## Visibility

- Lists show only a masked number (`••••1234`). The full number is decrypted only on the document detail endpoint (permission `documents.view`), and that call is audited.
- Reservation agents can upload but not view. Housekeeping, maintenance and cashier roles have no document access.
- Logs, error responses and audit details redact document numbers and secrets.

## Deletion

- Manual purge (`documents.delete`) or automatic retention purge removes files and the document number. The `IdentityDocument` row and its audit trail remain.
- Guest anonymisation (`guests.erase`) purges all of a guest's documents and personal fields. It is blocked by legal hold or active reservations.
- Backups contain encrypted files and ciphertext numbers. Apply the same retention to backup lifecycles (see operations.md).
