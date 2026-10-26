import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { addDays } from '@collex/shared';
import { MockPaymentProvider } from '../src/modules/finance/providers';
import { reservationBody, setupTestEnv, staff, TestEnv } from './helpers';

describe('Concurrency, inventory and payment integrity', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestEnv();
  });
  afterAll(() => env.close());

  it('never assigns the same physical room to overlapping stays under concurrent requests', async () => {
    const a = await staff(env, 'reception');
    const b = await staff(env, 'manager');
    const arrival = addDays(env.today, 20);
    const r1 = (await a.post('/v1/reservations', reservationBody(env, { arrival }))).body;
    const r2 = (await b.post('/v1/reservations', reservationBody(env, { arrival }))).body;
    const rr1 = (await a.get(`/v1/reservations/${r1.id}`)).body.rooms[0].id;
    const rr2 = (await a.get(`/v1/reservations/${r2.id}`)).body.rooms[0].id;
    const room = (await a.get(`/v1/front-desk/recommendations/${rr1}`)).body.rooms.find((r: any) => r.eligible).roomId;
    const results = await Promise.all([
      a.post('/v1/front-desk/assign', { reservationRoomId: rr1, roomId: room }),
      b.post('/v1/front-desk/assign', { reservationRoomId: rr2, roomId: room }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(['ROOM_NOT_ELIGIBLE', 'ROOM_ALREADY_ALLOCATED']).toContain(loser.body.error.code);
    const active = await env.prisma.roomAssignment.count({ where: { roomId: room, status: { in: ['PLANNED', 'ACTIVE'] } } });
    expect(active).toBe(1);
  });

  it('database exclusion constraint rejects overlapping allocations even if application checks are bypassed', async () => {
    const assignment = await env.prisma.roomAssignment.findFirstOrThrow({ where: { status: 'PLANNED' } });
    await expect(
      env.prisma.roomAssignment.create({
        data: { propertyId: assignment.propertyId, reservationRoomId: assignment.reservationRoomId, roomId: assignment.roomId, startDate: assignment.startDate, endDate: assignment.endDate, status: 'PLANNED', source: 'MANUAL' },
      }),
    ).rejects.toThrow(/RoomAssignment_no_overlap|exclusion/);
  });

  it('prevents overbooking under parallel booking requests', async () => {
    const reception = await staff(env, 'reception');
    const arrival = addDays(env.today, 40);
    const q = await reception.get(`/v1/rates/availability?arrival=${arrival}&departure=${addDays(arrival, 1)}&adults=1`);
    const ste = q.body.find((c: any) => c.category.code === 'STE');
    const available = ste.available as number;
    const attempts = available + 3;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) => reception.post('/v1/reservations', reservationBody(env, { arrival, nights: 1, category: 'STE', guest: { lastName: `Load${i}` } }))),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409 && r.body.error.code === 'NO_AVAILABILITY').length;
    expect(ok).toBe(available);
    expect(rejected).toBe(3);
  });

  it('confirms an awaiting-payment booking only via a verified webhook, exactly once', async () => {
    const http = request.agent(env.app.getHttpServer());
    const code = (await env.prisma.property.findUniqueOrThrow({ where: { id: env.data.properties.RUH.id } })).code;
    const arrival = addDays(env.today, 30);
    const book = await http
      .post(`/v1/public/properties/${code}/bookings`)
      .set('x-collex-csrf', '1')
      .send({
        arrival,
        departure: addDays(arrival, 2),
        ratePlanId: env.data.properties.RUH.ratePlans.NRF,
        rooms: [{ categoryId: env.data.properties.RUH.categories.STD, adults: 2, children: 0 }],
        guest: { firstName: 'Mona', lastName: 'Saleh', email: 'mona@example.test', preferredLocale: 'ar' },
        acceptPolicies: true,
      });
    expect(book.status).toBe(201);
    expect(book.body.status).toBe('AWAITING_PAYMENT');
    const payment = await env.prisma.payment.findUniqueOrThrow({ where: { id: book.body.payment.paymentId } });
    expect(payment.status).toBe('PENDING');

    const webhook = (body: string, sig = MockPaymentProvider.sign(body)) =>
      request(env.app.getHttpServer()).post('/v1/payments/webhooks/mock').set('content-type', 'application/json').set('x-mock-signature', sig).send(body);

    const forged = JSON.stringify({ id: `evt_${randomUUID()}`, type: 'payment.succeeded', data: { providerRef: payment.providerRef } });
    expect((await webhook(forged, 'deadbeef'.repeat(8))).status).toBe(400);
    expect((await env.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PENDING');

    const event = JSON.stringify({ id: `evt_${randomUUID()}`, type: 'payment.succeeded', data: { providerRef: payment.providerRef } });
    const [w1, w2] = await Promise.all([webhook(event), webhook(event)]);
    expect([w1.status, w2.status]).toEqual([200, 200]);
    expect([w1.body.duplicate, w2.body.duplicate].sort()).toEqual([false, true]);
    expect((await env.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('SUCCEEDED');
    expect(await env.prisma.folioEntry.count({ where: { paymentId: payment.id } })).toBe(1);
    const res = await env.prisma.reservation.findUniqueOrThrow({ where: { confirmationNo: book.body.confirmationNo } });
    expect(res.status).toBe('CONFIRMED');

    // The guest portal shows the confirmed booking
    const portal = await http.get('/v1/public/guest/reservation');
    expect(portal.status).toBe(200);
    expect(portal.body.status).toBe('CONFIRMED');
    expect(portal.body.balances.credits).toBe(Number(res.grandTotal).toFixed(2));
  });

  it('refunds never exceed the captured amount', async () => {
    const reception = await staff(env, 'reception');
    const cashier = await staff(env, 'cashier');
    const r = (await reception.post('/v1/reservations', reservationBody(env, { arrival: addDays(env.today, 50) }))).body;
    const folioId = (await cashier.get(`/v1/finance/reservations/${r.id}/folios`)).body[0].id;
    const pay = (await cashier.post('/v1/finance/payments', { folioId, amount: '200.00', method: 'CASH', idempotencyKey: 'refund-test-pay' })).body.payment;
    const results = await Promise.all([
      cashier.post('/v1/finance/refunds', { paymentId: pay.id, amount: '150.00', reason: 'Overcharge', idempotencyKey: 'refund-a-0001' }),
      cashier.post('/v1/finance/refunds', { paymentId: pay.id, amount: '150.00', reason: 'Overcharge', idempotencyKey: 'refund-b-0001' }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 400]);
    const p = await env.prisma.payment.findUniqueOrThrow({ where: { id: pay.id } });
    expect(p.refundedAmount.toString()).toBe('150');
    expect(p.status).toBe('PARTIALLY_REFUNDED');
    const reception2 = await staff(env, 'reception');
    expect((await reception2.post('/v1/finance/refunds', { paymentId: pay.id, amount: '10.00', reason: 'x test', idempotencyKey: 'refund-c-0001' })).status).toBe(403);
  });

  it('maintenance blocks remove rooms from availability and assignment until approved release', async () => {
    const manager = await staff(env, 'manager');
    const maint = await staff(env, 'maint');
    const arrival = addDays(env.today, 60);
    const before = (await manager.get(`/v1/rates/availability?arrival=${arrival}&departure=${addDays(arrival, 1)}&adults=1`)).body.find((c: any) => c.category.code === 'DLX').available;
    const rooms = (await manager.get('/v1/property/rooms')).body.filter((r: any) => r.category.code === 'DLX');
    const target = rooms[0];
    const wo = await manager.post('/v1/maintenance/work-orders', { roomId: target.id, title: 'Water leak', category: 'PLUMBING', severity: 'MAJOR', blockType: 'OUT_OF_ORDER' });
    expect(wo.status).toBe(201);
    expect((await manager.get(`/v1/property/rooms/${target.id}`)).body.maintenanceStatus).toBe('OUT_OF_ORDER');
    const after = (await manager.get(`/v1/rates/availability?arrival=${arrival}&departure=${addDays(arrival, 1)}&adults=1`)).body.find((c: any) => c.category.code === 'DLX').available;
    expect(after).toBe(before - 1);

    const r = (await manager.post('/v1/reservations', reservationBody(env, { arrival, category: 'DLX' }))).body;
    const rr = (await manager.get(`/v1/reservations/${r.id}`)).body.rooms[0].id;
    const attempt = await manager.post('/v1/front-desk/assign', { reservationRoomId: rr, roomId: target.id });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.details.reasons).toEqual(expect.arrayContaining(['MAINTENANCE_BLOCK', 'OUT_OF_ORDER']));

    // Housekeeping cannot clear maintenance; technician resolves; only an approver can close/release.
    const hk = await staff(env, 'hk');
    expect((await hk.patch(`/v1/maintenance/work-orders/${wo.body.id}`, { status: 'IN_PROGRESS' })).status).toBe(403);
    expect((await maint.patch(`/v1/maintenance/work-orders/${wo.body.id}`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await maint.patch(`/v1/maintenance/work-orders/${wo.body.id}`, { status: 'RESOLVED', note: 'Pipe replaced' })).status).toBe(200);
    expect((await maint.patch(`/v1/maintenance/work-orders/${wo.body.id}`, { status: 'CLOSED' })).status).toBe(403);
    expect((await manager.patch(`/v1/maintenance/work-orders/${wo.body.id}`, { status: 'CLOSED' })).status).toBe(200);
    const released = (await manager.get(`/v1/property/rooms/${target.id}`)).body;
    expect(released.maintenanceStatus).toBe('OPERATIONAL');
    expect(released.housekeepingStatus).toBe('DIRTY');
  });

  it('expires unpaid temporary holds and releases inventory', async () => {
    const reception = await staff(env, 'reception');
    const body = { ...reservationBody(env, { arrival: addDays(env.today, 70) }), confirm: false, holdMinutes: 5 };
    const r = (await reception.post('/v1/reservations', body)).body;
    expect(r.status).toBe('PENDING');
    await env.prisma.reservation.update({ where: { id: r.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const { ReservationsService } = await import('../src/modules/reservations/reservations.service');
    const svc = env.app.get(ReservationsService);
    expect(await svc.expireHolds()).toBeGreaterThanOrEqual(1);
    expect((await env.prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('EXPIRED');
  });
});
