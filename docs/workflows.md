# Operational workflows

## Reservation lifecycle

`INQUIRY → PENDING → AWAITING_PAYMENT → CONFIRMED → CHECKED_IN → CHECKED_OUT`, with exits `CANCELLED`, `NO_SHOW`, `EXPIRED`. The transition table is in `packages/shared/src/state-machines.ts` and is validated on the server.

- **Staff booking** (`POST /v1/reservations`): confirmed immediately, or held (`confirm=false`, `holdMinutes`) until confirmed or expired by the worker.
- **Public booking**: confirmed if no deposit is due. Otherwise `AWAITING_PAYMENT` with a 30-minute hold and a provider payment intent. Confirmation happens only when the verified provider webhook arrives.
- **Modification**: new dates are re-checked for availability and restrictions, then re-priced. Planned room assignments are released for re-assignment. Old and new totals go to history.
- **Cancellation**: the fee comes from the policy snapshot (free window, penalty nights, non-refundable) and is posted to the folio. An authorised user can waive it.
- **No-show**: after the arrival date, the first-night (or full non-refundable) fee is posted.

## Guest registration and identity documents

1. The primary guest is created with the booking. Accompanying occupants are added (adult/child, optionally per room line).
2. Requirements are computed from the property's **check-in policy**: who must present documents, accepted types, and whether staff verification is required.
3. Documents are uploaded by staff (full metadata) or by the guest in the portal (metadata optional): front/back/additional pages, drag-and-drop, camera capture, progress and retry.
4. A reviewer opens the scan through the secure streaming endpoint, compares it with the registration details, confirms legibility and either **verifies**, **rejects** with a reason, or **requests re-upload**. Metadata corrections are reasoned and audited. Changing a verified document sends it back to review.
5. Expired documents are marked `EXPIRED` daily. Files are purged after the retention period unless the guest is under legal hold or has an active stay.

## Room assignment

- `GET /v1/front-desk/recommendations/:reservationRoomId` ranks every room. Ineligible rooms carry reasons (category mismatch, downgrade, capacity, overlap, maintenance block, out of order, not clean/inspected). Eligible rooms carry explanations (exact category, upgrade, ready, accessible, bed type, same floor as group, efficient allocation).
- `POST /v1/front-desk/assign` locks the room row, re-validates and creates a PLANNED assignment. A stale selection returns `ROOM_NOT_ELIGIBLE`/`ROOM_ALREADY_ALLOCATED`, and the UI asks the user to refresh. A different room is never chosen silently.
- `POST /v1/front-desk/auto-assign` assigns every unassigned line of a reservation, keeping group rooms on the same floor where possible.
- The booked **category** (reservation room line) and the physical **room** (assignment) are separate records.

## Check-in (one transaction)

1. Reservation `CONFIRMED` (or already `CHECKED_IN` for another room of the same booking), arrival date reached, departure in the future.
2. Identity requirements satisfied, or a **documented exception** (policy allows it + `frontdesk.checkin_exception` permission + reason), audited separately.
3. Deposit paid when the policy requires it.
4. Room: the existing planned assignment or a newly selected room, re-validated for readiness (clean or inspected per policy, not blocked).
5. Assignment → ACTIVE, `Stay` created, reservation → CHECKED_IN, check-in notification queued.

## Stay operations

- **Room move**: the current assignment becomes `MOVED` (end = today), a new ACTIVE assignment is created with `previousAssignmentId`, and the old room becomes DIRTY with a cleaning task.
- **Extension**: availability for the extra nights is checked and priced with current rates. The same room is kept if the exclusion constraint allows it, otherwise `ROOM_NOT_AVAILABLE_FOR_EXTENSION` (move the guest first).
- **Night audit**: posts tonight's room, service-charge and tax entries for every in-house stay (idempotent).

## Check-out

All used nights are posted (early departure stops at today and releases unused nights). An outstanding balance blocks check-out unless an authorised user allows it. Then: assignment → COMPLETED, stay → CHECKED_OUT, room → DIRTY with a departure-clean task, reservation → CHECKED_OUT when no room remains in house, the folio closes when the balance is zero, and a summary notification is queued. Receipts and invoices are issued from the folio and printed from the browser.

## Housekeeping and maintenance

- Task flow: `PENDING → IN_PROGRESS (room CLEANING) → DONE (room CLEAN or AWAITING_INSPECTION) → INSPECTED (supervisor only, room INSPECTED)`. Do-not-disturb blocks starting a task.
- Work orders with an `OUT_OF_ORDER`/`OUT_OF_SERVICE` block remove the room from availability for the block dates and set its maintenance status. Overlapping allocations are reported as conflicts. Only users with `maintenance.approve` can close a work order. Closing a block sets the room to DIRTY and creates a deep-clean task.
- Housekeeping status changes cannot alter maintenance status, occupancy or reservations.
