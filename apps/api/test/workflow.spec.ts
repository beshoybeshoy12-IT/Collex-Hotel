import { addDays } from '@collex/shared';
import { reservationBody, setupTestEnv, staff, TestEnv, uploadDocument, guest } from './helpers';

/**
 * End-to-end front-desk workflow:
 * reservation → registration of occupants → identity documents → review → room assignment →
 * identity-aware check-in → charges/payments → check-out → housekeeping → audit trail.
 */
describe('Guest stay lifecycle', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestEnv();
  });
  afterAll(() => env.close());

  it('runs a full stay with identity enforcement, payments and housekeeping', async () => {
    const reception = await staff(env, 'reception');
    const manager = await staff(env, 'manager');
    const cashier = await staff(env, 'cashier');

    // Availability
    const avail = await reception.get(`/v1/rates/availability?arrival=${env.today}&departure=${addDays(env.today, 2)}&adults=2`);
    expect(avail.status).toBe(200);
    const dlx = avail.body.find((c: any) => c.category.code === 'DLX');
    expect(dlx.available).toBeGreaterThan(0);
    expect(dlx.offers.length).toBeGreaterThan(0);

    // Reservation with an accompanying adult
    const created = await reception.post('/v1/reservations', reservationBody(env, { category: 'DLX', adults: 2, additional: [guest({ firstName: 'Jane', email: null, isAdult: true })] }));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CONFIRMED');
    const resId = created.body.id;
    let detail = (await reception.get(`/v1/reservations/${resId}`)).body;
    expect(detail.occupants).toHaveLength(2);
    expect(detail.rooms[0].nightlyRates).toHaveLength(2);
    expect(detail.documentRequirements.satisfied).toBe(false);
    const rrId = detail.rooms[0].id;
    const [primary, companion] = [detail.occupants.find((o: any) => o.isPrimary), detail.occupants.find((o: any) => !o.isPrimary)];

    // Assign a room using recommendations
    const rec = await reception.get(`/v1/front-desk/recommendations/${rrId}`);
    expect(rec.status).toBe(200);
    const best = rec.body.rooms.find((r: any) => r.eligible);
    expect(best.explanations).toContain('EXACT_CATEGORY');
    const assigned = await reception.post('/v1/front-desk/assign', { reservationRoomId: rrId, roomId: best.roomId });
    expect(assigned.status).toBe(201);

    // Check-in is blocked until documents are uploaded AND verified
    const ack = { policiesAccepted: true, registrationSigned: true };
    let ci = await reception.post('/v1/front-desk/check-in', { reservationRoomId: rrId, acknowledgements: ack });
    expect(ci.status).toBe(409);
    expect(ci.body.error.code).toBe('DOCUMENTS_INCOMPLETE');
    expect(ci.body.error.details.guests).toHaveLength(2);

    const up = await uploadDocument(reception, primary.guestId);
    expect(up.status).toBe(201);
    expect(up.body.status).toBe('AWAITING_REVIEW');
    ci = await reception.post('/v1/front-desk/check-in', { reservationRoomId: rrId, acknowledgements: ack });
    expect(ci.body.error.code).toBe('DOCUMENTS_INCOMPLETE');
    expect(ci.body.error.details.guests.find((g: any) => g.guestId === primary.guestId).state).toBe('AWAITING_REVIEW');

    // Reject then re-upload then verify
    const rejected = await reception.post(`/v1/documents/${up.body.id}/review`, { decision: 'REQUEST_REUPLOAD', reason: 'Image is blurry' });
    expect(rejected.body.status).toBe('REUPLOAD_REQUESTED');
    const replaced = await reception.agent
      .post(`/v1/documents/${up.body.id}/files`)
      .set('x-collex-csrf', '1')
      .set('x-property-id', reception.propertyId!)
      .field('sides', JSON.stringify(['FRONT']))
      .attach('files', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(3000, 7)]), 'rescan.jpg');
    expect(replaced.status).toBe(201);
    expect(replaced.body.files.filter((f: any) => f.superseded)).toHaveLength(1);
    const verified = await reception.post(`/v1/documents/${up.body.id}/review`, { decision: 'VERIFY', legible: true });
    expect(verified.status).toBe(201);
    expect(verified.body.status).toBe('VERIFIED');
    expect(verified.body.documentNumber).toBe('X1234567');

    // Companion still missing: receptionist may not grant an exception, manager may.
    ci = await reception.post('/v1/front-desk/check-in', { reservationRoomId: rrId, acknowledgements: ack, documentException: { reason: 'Child of primary guest, document arriving' } });
    expect(ci.status).toBe(403);
    ci = await manager.post('/v1/front-desk/check-in', { reservationRoomId: rrId, acknowledgements: ack, documentException: { reason: 'Approved by duty manager pending document' } });
    expect(ci.status).toBe(201);
    const stayId = ci.body.id;
    expect(ci.body.docExceptionReason).toContain('Approved');
    const exceptionAudit = await env.prisma.auditEvent.findFirst({ where: { action: 'CHECKIN_DOCUMENT_EXCEPTION', entityId: stayId } });
    expect(exceptionAudit).not.toBeNull();

    // Room is now occupied (separate from housekeeping status)
    const room = (await reception.get(`/v1/property/rooms/${best.roomId}`)).body;
    expect(room.occupancy).toBe('OCCUPIED');
    expect(room.currentGuest.confirmationNo).toBe(created.body.confirmationNo);

    // Duplicate check-in is rejected
    expect((await manager.post('/v1/front-desk/check-in', { reservationRoomId: rrId, acknowledgements: ack, documentException: { reason: 'again again' } })).status).toBe(409);

    // Service request with charge posted once
    const sr = await reception.post('/v1/services/requests', { stayId, category: 'LAUNDRY', description: 'Two shirts', chargeAmount: '45.00' });
    expect(sr.status).toBe(201);
    expect((await reception.patch(`/v1/services/requests/${sr.body.id}`, { status: 'COMPLETED', resolution: 'Delivered' })).status).toBe(200);

    // Folio & payment (idempotent)
    const folios = (await cashier.get(`/v1/finance/reservations/${resId}/folios`)).body;
    const folioId = folios[0].id;
    expect(folios[0].entries.some((e: any) => e.type === 'LAUNDRY' && e.amount === '45')).toBe(true);
    const pay1 = await cashier.post('/v1/finance/payments', { folioId, amount: '100.00', method: 'CASH', idempotencyKey: 'pay-test-0001' });
    const pay2 = await cashier.post('/v1/finance/payments', { folioId, amount: '100.00', method: 'CASH', idempotencyKey: 'pay-test-0001' });
    expect(pay1.status).toBe(201);
    expect(pay2.body.replayed).toBe(true);
    expect(await env.prisma.payment.count({ where: { folioId } })).toBe(1);

    // Check-out blocked by outstanding balance, then settled
    let co = await reception.post('/v1/front-desk/check-out', { stayId });
    expect(co.status).toBe(409);
    expect(co.body.error.code).toBe('BALANCE_OUTSTANDING');
    const balance = co.body.error.details.balance;
    expect(Number(balance)).toBeGreaterThan(0);
    await cashier.post('/v1/finance/payments', { folioId, amount: balance, method: 'CARD', idempotencyKey: 'pay-test-0002' });
    co = await reception.post('/v1/front-desk/check-out', { stayId });
    expect(co.status).toBe(201);
    expect(co.body.balances.balance).toBe('0.00');

    detail = (await reception.get(`/v1/reservations/${resId}`)).body;
    expect(detail.status).toBe('CHECKED_OUT');
    const roomAfter = (await reception.get(`/v1/property/rooms/${best.roomId}`)).body;
    expect(roomAfter.housekeepingStatus).toBe('DIRTY');
    expect(roomAfter.occupancy).toBe('VACANT');

    // Receipt
    const receipt = await cashier.post(`/v1/finance/folios/${folioId}/invoices`, { kind: 'RECEIPT' });
    expect(receipt.status).toBe(201);
    expect(receipt.body.totals.balance).toBe('0.00');

    // Housekeeping: staff cleans, supervisor inspects
    const hk = await staff(env, 'hk');
    const hksup = await staff(env, 'hksup');
    const tasks = (await hk.get('/v1/housekeeping/tasks')).body;
    const task = tasks.find((t: any) => t.roomId === best.roomId && t.type === 'DEPARTURE_CLEAN');
    expect(task).toBeDefined();
    expect((await hk.patch(`/v1/housekeeping/tasks/${task.id}`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await reception.get(`/v1/property/rooms/${best.roomId}`)).body.housekeepingStatus).toBe('CLEANING');
    expect((await hk.patch(`/v1/housekeeping/tasks/${task.id}`, { status: 'DONE' })).status).toBe(200);
    expect((await hk.patch(`/v1/housekeeping/tasks/${task.id}`, { status: 'INSPECTED' })).status).toBe(403);
    expect((await hksup.patch(`/v1/housekeeping/tasks/${task.id}`, { status: 'INSPECTED' })).status).toBe(200);
    expect((await reception.get(`/v1/property/rooms/${best.roomId}`)).body.housekeepingStatus).toBe('INSPECTED');

    // Audit trail
    const actions = (await env.prisma.auditEvent.findMany({ where: { propertyId: env.data.properties.RUH.id } })).map((a) => a.action);
    for (const a of ['RESERVATION_CREATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REVIEWED', 'ROOM_ASSIGNED', 'CHECK_IN', 'PAYMENT_RECORDED', 'CHECK_OUT', 'INVOICE_ISSUED']) {
      expect(actions).toContain(a);
    }
    // Room-move history and stays are preserved; nothing was deleted.
    expect(await env.prisma.stay.count({ where: { id: stayId } })).toBe(1);
  });

  it('handles walk-ins, room moves and stay extensions', async () => {
    const reception = await staff(env, 'reception');
    const manager = await staff(env, 'manager');
    const walkIn = await reception.post('/v1/front-desk/walk-in', {
      departure: addDays(env.today, 1),
      ratePlanId: env.data.properties.RUH.ratePlans.BAR,
      categoryId: env.data.properties.RUH.categories.STD,
      adults: 1,
      guest: guest({ firstName: 'Ali', lastName: 'Hassan', nationality: 'SA', email: 'ali@example.test' }),
    });
    expect(walkIn.status).toBe(201);
    expect(walkIn.body.assignedRoom).toBeTruthy();
    // Saudi national under FOREIGN_ADULTS would be exempt; default policy is ALL_ADULTS so verify a national ID.
    const det = (await reception.get(`/v1/reservations/${walkIn.body.reservationId}`)).body;
    const up = await uploadDocument(reception, det.primaryGuestId, { typeCode: 'NATIONAL_ID', issuingCountry: 'SA', documentNumber: '1012345678' });
    await reception.post(`/v1/documents/${up.body.id}/review`, { decision: 'VERIFY', legible: true });
    const ci = await reception.post('/v1/front-desk/check-in', { reservationRoomId: walkIn.body.reservationRoomId, acknowledgements: { policiesAccepted: true } });
    expect(ci.status).toBe(201);

    // Extend by one night
    const ext = await reception.post('/v1/front-desk/extend', { reservationId: walkIn.body.reservationId, newDeparture: addDays(env.today, 2) });
    expect(ext.status).toBe(201);
    const afterExt = (await reception.get(`/v1/reservations/${walkIn.body.reservationId}`)).body;
    expect(afterExt.departureDate).toBe(addDays(env.today, 2));
    expect(afterExt.rooms[0].nightlyRates).toHaveLength(2);

    // Room move to another ready standard room; old room needs cleaning, history kept
    const rec = (await reception.get(`/v1/front-desk/recommendations/${walkIn.body.reservationRoomId}`)).body;
    const target = rec.rooms.find((r: any) => r.eligible && r.room.number !== walkIn.body.assignedRoom);
    const move = await reception.post('/v1/front-desk/room-move', { stayId: ci.body.id, toRoomId: target.roomId, reason: 'Air conditioning noise' });
    expect(move.status).toBe(201);
    const assignments = await env.prisma.roomAssignment.findMany({ where: { reservationRoomId: walkIn.body.reservationRoomId }, orderBy: { createdAt: 'asc' } });
    expect(assignments.map((a) => a.status)).toEqual(['MOVED', 'ACTIVE']);
    expect(assignments[1].previousAssignmentId).toBe(assignments[0].id);
    const oldRoom = await env.prisma.room.findUniqueOrThrow({ where: { id: assignments[0].roomId } });
    expect(oldRoom.housekeepingStatus).toBe('DIRTY');
    expect(manager).toBeDefined();
  });

  it('walk-in uses the room chosen by reception and registers every adult', async () => {
    const reception = await staff(env, 'reception');
    const p = env.data.properties.RUH;
    const rooms = await reception.get(`/v1/front-desk/walk-in/rooms?categoryId=${p.categories.FAM}&departure=${addDays(env.today, 1)}&adults=2`);
    expect(rooms.status).toBe(200);
    const eligible = rooms.body.filter((r: any) => r.eligible);
    expect(eligible.length).toBeGreaterThan(1);
    const chosen = eligible[eligible.length - 1]; // deliberately not the top recommendation
    const res = await reception.post('/v1/front-desk/walk-in', {
      departure: addDays(env.today, 1),
      ratePlanId: p.ratePlans.BAR,
      categoryId: p.categories.FAM,
      adults: 2,
      roomId: chosen.roomId,
      guest: guest({ firstName: 'Karim', lastName: 'Nabil', nationality: 'EG', dateOfBirth: '1990-04-12' }),
      additionalGuests: [guest({ firstName: 'Salma', lastName: 'Nabil', nationality: 'EG', email: null, isAdult: true })],
    });
    expect(res.status).toBe(201);
    expect(res.body.assignedRoom).toBe(chosen.number);
    expect(res.body.guestIds).toHaveLength(2);

    // Invalid nationality / passport number formats are rejected (ISO 3166-1, ICAO 9303).
    const bad = await uploadDocument(reception, res.body.guestIds[0], { issuingCountry: 'XX' });
    expect(bad.status).toBe(400);
    const badNo = await uploadDocument(reception, res.body.guestIds[0], { documentNumber: 'TOO-LONG-123' });
    expect(badNo.status).toBe(400);

    // A booking for 2 adults with only 1 registered guest cannot be checked in.
    const solo = await reception.post('/v1/reservations', reservationBody(env, { adults: 2, category: 'FAM' }));
    const detail = (await reception.get(`/v1/reservations/${solo.body.id}`)).body;
    expect(detail.documentRequirements.guests.filter((g: any) => g.unregistered)).toHaveLength(1);
    expect(detail.documentRequirements.satisfied).toBe(false);
  });

  it('cancels per policy snapshot and modifies dates with re-pricing', async () => {
    const reception = await staff(env, 'reception');
    const arrival = addDays(env.today, 10);
    const r = await reception.post('/v1/reservations', reservationBody(env, { arrival, nights: 2 }));
    const mod = await reception.patch(`/v1/reservations/${r.body.id}`, { departure: addDays(arrival, 3) });
    expect(mod.status).toBe(200);
    expect(Number(mod.body.grandTotal)).toBeGreaterThan(Number(r.body.grandTotal));
    const cancel = await reception.post(`/v1/reservations/${r.body.id}/cancel`, { reason: 'Change of plans' });
    expect(cancel.status).toBe(201);
    expect(cancel.body.fee).toBe('0.00'); // outside the 24h free-cancellation window
    const again = await reception.post(`/v1/reservations/${r.body.id}/cancel`, { reason: 'Change of plans' });
    expect(again.status).toBe(409);

    // Non-refundable: full fee
    const nrf = await reception.post('/v1/reservations', reservationBody(env, { arrival, plan: 'NRF' }));
    const c2 = await reception.post(`/v1/reservations/${nrf.body.id}/cancel`, { reason: 'Change of plans' });
    expect(c2.body.fee).toBe(Number(nrf.body.grandTotal).toFixed(2));
  });

  it('serves bilingual-ready reports from real data', async () => {
    const manager = await staff(env, 'manager');
    const perf = await manager.get(`/v1/reports/performance?from=${env.today}&to=${addDays(env.today, 6)}`);
    expect(perf.status).toBe(200);
    expect(perf.body.totals.occupiedRoomNights).toBeGreaterThan(0);
    expect(Number(perf.body.totals.adr)).toBeGreaterThan(0);
    const csv = await manager.get(`/v1/reports/performance?from=${env.today}&to=${addDays(env.today, 6)}&format=csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('occupancyPercent');
    const hk = await staff(env, 'hk');
    expect((await hk.get(`/v1/reports/financial?from=${env.today}&to=${env.today}`)).status).toBe(403);
  });
});
