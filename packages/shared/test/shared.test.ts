import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDateInZone,
  cancellationFee,
  canTransitionReservation,
  evaluateRoom,
  maskIdentifier,
  nightCount,
  quoteStay,
  rangesOverlap,
  rankRooms,
  stayNights,
  type RoomCandidate,
  type AssignmentRequest,
  createReservationSchema,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
} from '../src';

describe('business dates', () => {
  it('counts nights with arrival inclusive and departure exclusive', () => {
    expect(nightCount('2026-05-01', '2026-05-03')).toBe(2);
    expect(stayNights('2026-05-01', '2026-05-03')).toEqual(['2026-05-01', '2026-05-02']);
  });
  it('handles month and leap year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(stayNights('2026-12-31', '2027-01-02')).toEqual(['2026-12-31', '2027-01-01']);
  });
  it('treats back-to-back stays as non-overlapping', () => {
    expect(rangesOverlap('2026-05-01', '2026-05-03', '2026-05-03', '2026-05-05')).toBe(false);
    expect(rangesOverlap('2026-05-01', '2026-05-04', '2026-05-03', '2026-05-05')).toBe(true);
  });
  it('computes business date in property time zone', () => {
    const at = new Date('2026-05-01T22:30:00Z');
    expect(businessDateInZone('UTC', at)).toBe('2026-05-01');
    expect(businessDateInZone('Asia/Riyadh', at)).toBe('2026-05-02');
  });
});

describe('pricing', () => {
  const rules = [
    { startDate: '2026-01-01', endDate: '2027-01-01', weekdays: [], amount: '100.00', priority: 0, extraAdultAmount: '20' },
    { startDate: '2026-05-01', endDate: '2026-05-10', weekdays: [5, 6], amount: '150.00', priority: 10 },
  ];
  it('applies weekday and seasonal priority with decimal arithmetic', () => {
    // 2026-05-07 Thu, 05-08 Fri, 05-09 Sat
    const q = quoteStay({
      arrival: '2026-05-07', departure: '2026-05-10', adults: 2, children: 0, baseOccupancy: 2,
      rules, taxPercent: '15', serviceChargePercent: '10',
    });
    expect(q.nights.map((n) => n.amount)).toEqual(['100.00', '150.00', '150.00']);
    expect(q.roomTotal).toBe('400.00');
    expect(q.serviceCharge).toBe('40.00');
    expect(q.tax).toBe('66.00');
    expect(q.grandTotal).toBe('506.00');
  });
  it('charges extra adults beyond base occupancy', () => {
    const q = quoteStay({ arrival: '2026-03-02', departure: '2026-03-03', adults: 3, children: 0, baseOccupancy: 2, rules, taxPercent: '0', serviceChargePercent: '0' });
    expect(q.grandTotal).toBe('120.00');
  });
  it('avoids floating point drift', () => {
    const q = quoteStay({
      arrival: '2026-03-02', departure: '2026-03-05', adults: 1, children: 0, baseOccupancy: 2,
      rules: [{ startDate: '2026-01-01', endDate: '2027-01-01', weekdays: [], amount: '0.10', priority: 0 }],
      taxPercent: '0', serviceChargePercent: '0',
    });
    expect(q.roomTotal).toBe('0.30');
  });
  it('fails when a night has no rate', () => {
    expect(() => quoteStay({ arrival: '2027-01-01', departure: '2027-01-02', adults: 1, children: 0, baseOccupancy: 2, rules, taxPercent: '0', serviceChargePercent: '0' })).toThrow('NO_RATE_FOR_DATE');
  });
  it('computes cancellation fees', () => {
    const nightly = [{ date: '2026-05-01', amount: '100.00' }, { date: '2026-05-02', amount: '120.00' }];
    expect(cancellationFee({ freeCancellationHours: 24, penaltyNights: 1, refundable: true }, nightly, 48, '220').toFixed(2)).toBe('0.00');
    expect(cancellationFee({ freeCancellationHours: 24, penaltyNights: 1, refundable: true }, nightly, 10, '220').toFixed(2)).toBe('100.00');
    expect(cancellationFee({ freeCancellationHours: 24, penaltyNights: 1, refundable: false }, nightly, 100, '220').toFixed(2)).toBe('220.00');
  });
});

describe('reservation state machine', () => {
  it('allows only valid transitions', () => {
    expect(canTransitionReservation('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionReservation('CHECKED_OUT', 'CHECKED_IN')).toBe(false);
    expect(canTransitionReservation('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransitionReservation('PENDING', 'CHECKED_IN')).toBe(false);
  });
});

describe('room eligibility', () => {
  const base: RoomCandidate = {
    id: 'r1', number: '101', categoryId: 'std', categoryRank: 1, floorLevel: 1, maxOccupancy: 2,
    housekeepingStatus: 'INSPECTED', maintenanceStatus: 'OPERATIONAL', active: true, accessible: false,
    bedType: 'KING', features: [], allocations: [], blocks: [],
  };
  const req: AssignmentRequest = {
    reservationRoomId: 'rr1', categoryId: 'std', categoryRank: 1, start: '2026-05-01', end: '2026-05-03',
    occupants: 2, immediateCheckIn: true, requireInspection: false, allowUpgrade: false, preferences: {},
  };
  it('accepts a ready matching room', () => {
    expect(evaluateRoom(base, req).eligible).toBe(true);
  });
  it('rejects overlap, maintenance, dirty and capacity problems with reasons', () => {
    const r = evaluateRoom(
      { ...base, maxOccupancy: 1, housekeepingStatus: 'DIRTY', maintenanceStatus: 'OUT_OF_ORDER', allocations: [{ start: '2026-05-02', end: '2026-05-04', reservationRoomId: 'other' }] },
      req,
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(['CAPACITY_EXCEEDED', 'OVERLAPPING_ALLOCATION', 'OUT_OF_ORDER', 'NOT_CLEAN']));
  });
  it('does not treat an empty clean room as available when a block exists', () => {
    expect(evaluateRoom({ ...base, blocks: [{ start: '2026-05-02', end: null }] }, req).reasons).toContain('MAINTENANCE_BLOCK');
  });
  it('ignores the reservation own allocation (re-validation)', () => {
    expect(evaluateRoom({ ...base, allocations: [{ start: '2026-05-01', end: '2026-05-03', reservationRoomId: 'rr1' }] }, req).eligible).toBe(true);
  });
  it('blocks category mismatch unless upgrade allowed, never downgrade', () => {
    const suite = { ...base, id: 'r2', categoryId: 'suite', categoryRank: 3 };
    expect(evaluateRoom(suite, req).reasons).toContain('CATEGORY_MISMATCH');
    expect(evaluateRoom(suite, { ...req, allowUpgrade: true }).eligible).toBe(true);
    expect(evaluateRoom({ ...base, categoryId: 'eco', categoryRank: 0 }, { ...req, allowUpgrade: true }).reasons).toContain('DOWNGRADE_NOT_ALLOWED');
  });
  it('ranks accessible rooms first for guests needing accessibility', () => {
    const ranked = rankRooms([base, { ...base, id: 'r3', number: '102', accessible: true }], { ...req, preferences: { accessible: true } });
    expect(ranked[0].roomId).toBe('r3');
    expect(ranked[0].explanations).toContain('ACCESSIBLE_MATCH');
  });
});

describe('validation and permissions', () => {
  it('rejects departure before arrival', () => {
    const r = createReservationSchema.safeParse({ arrival: '2026-05-03', departure: '2026-05-01', ratePlanId: 'x', rooms: [{ categoryId: 'c', adults: 1 }], primaryGuestId: 'g' });
    expect(r.success).toBe(false);
  });
  it('housekeeping staff cannot touch reservations or payments', () => {
    const hk = DEFAULT_ROLES.find((r) => r.code === 'HK_STAFF')!;
    expect(hk.permissions).not.toContain('reservations.write');
    expect(hk.permissions).not.toContain('payments.take');
    expect(ALL_PERMISSIONS.length).toBeGreaterThan(30);
  });
  it('masks identifiers', () => {
    expect(maskIdentifier('A12345678')).toBe('•••••5678');
  });
});
