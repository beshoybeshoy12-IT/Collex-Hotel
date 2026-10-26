import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { z } from 'zod';
import {
  cancellationFee,
  canTransitionReservation,
  CreateReservationInput,
  Decimal,
  GuestInput,
  modifyReservationSchema,
  percentOf,
  PriceQuote,
  sumMoney,
  currencyDecimals,
} from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { confirmationCode, d, hoursUntilArrival, iso, paginate, today } from '../../common/util';
import { AvailabilityService } from '../rates/availability.service';
import { FinanceService } from '../finance/finance.service';
import { GuestsService } from '../guests/guests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';
import { loadConfig } from '../../config';

type ReservationCreate = CreateReservationInput & { source: string };

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly availability: AvailabilityService,
    private readonly finance: FinanceService,
    private readonly guests: GuestsService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Creates a reservation atomically under the property inventory lock:
   * validates restrictions and availability, snapshots prices/policies, creates guests,
   * occupants, room lines, folio, history, and queues the confirmation.
   */
  async create(ctx: RequestContext, input: ReservationCreate, opts: { tx?: Tx; depositHoldMinutes?: number } = {}) {
    const run = async (tx: Tx) => {
      const plan = await tx.ratePlan.findFirst({ where: { id: input.ratePlanId, propertyId: ctx.propertyId, active: true } });
      if (!plan) throw notFound('RATE_PLAN');
      if (!ctx.userId) {
        // Public bookings may only use public plans or promo plans with the matching code.
        if (plan.promoCode ? plan.promoCode !== input.promoCode : !plan.public) throw new AppError('RATE_PLAN_NOT_AVAILABLE');
      }
      const needed = new Map<string, number>();
      input.rooms.forEach((r) => needed.set(r.categoryId, (needed.get(r.categoryId) ?? 0) + 1));
      const avail = await this.availability.byCategory(ctx.propertyId, input.arrival, input.departure, { tx });
      for (const [categoryId, count] of needed) {
        const a = avail.get(categoryId);
        if (!a) throw notFound('CATEGORY');
        if (a.available < count) throw conflict('NO_AVAILABILITY', { categoryId, available: a.available });
        await this.availability.checkRestrictions(ctx.propertyId, plan, categoryId, input.arrival, input.departure, tx);
      }
      const quotes: PriceQuote[] = [];
      for (const r of input.rooms) {
        quotes.push(await this.availability.quote(ctx.propertyId, plan, r.categoryId, input.arrival, input.departure, r.adults, r.children, tx));
      }
      const dec = currencyDecimals(ctx.property.currency);
      const sum = (k: 'roomTotal' | 'discount' | 'serviceCharge' | 'tax' | 'grandTotal') => sumMoney(quotes.map((q) => q[k]));
      const grand = sum('grandTotal');
      const deposit = percentOf(grand, plan.depositPercent.toString(), dec);

      const primary = input.primaryGuestId
        ? await this.guests.ensure(ctx, input.primaryGuestId, tx)
        : await this.guests.create(ctx, input.primaryGuest as GuestInput, tx);

      let status: ReservationStatus = input.confirm ? 'CONFIRMED' : 'PENDING';
      let holdExpiresAt: Date | null = input.confirm ? null : new Date(Date.now() + (input.holdMinutes ?? 60) * 60_000);
      if (opts.depositHoldMinutes && deposit.greaterThan(0)) {
        status = 'AWAITING_PAYMENT';
        holdExpiresAt = new Date(Date.now() + opts.depositHoldMinutes * 60_000);
      }

      let confirmationNo = confirmationCode();
      while (await tx.reservation.findUnique({ where: { confirmationNo } })) confirmationNo = confirmationCode();

      const reservation = await tx.reservation.create({
        data: {
          propertyId: ctx.propertyId,
          confirmationNo,
          status,
          source: input.source,
          primaryGuestId: primary.id,
          arrivalDate: d(input.arrival),
          departureDate: d(input.departure),
          adults: input.rooms.reduce((a, r) => a + r.adults, 0),
          children: input.rooms.reduce((a, r) => a + r.children, 0),
          ratePlanId: plan.id,
          currency: ctx.property.currency,
          roomTotal: sum('roomTotal').toFixed(3),
          discountTotal: sum('discount').toFixed(3),
          serviceChargeTotal: sum('serviceCharge').toFixed(3),
          taxTotal: sum('tax').toFixed(3),
          grandTotal: grand.toFixed(3),
          depositRequired: deposit.toFixed(3),
          holdExpiresAt,
          specialRequests: input.specialRequests,
          groupName: input.groupName,
          companyName: input.companyName,
          promoCode: input.promoCode ?? null,
          createdById: ctx.userId,
          policySnapshot: {
            ratePlan: { id: plan.id, code: plan.code, nameEn: plan.nameEn, nameAr: plan.nameAr },
            refundable: plan.refundable,
            freeCancellationHours: plan.freeCancellationHours,
            penaltyNights: plan.penaltyNights,
            depositPercent: plan.depositPercent.toString(),
            discountPercent: plan.discountPercent.toString(),
            taxPercent: ctx.property.taxPercent.toString(),
            serviceChargePercent: ctx.property.serviceChargePercent.toString(),
            checkInTime: ctx.property.checkInTime,
            checkOutTime: ctx.property.checkOutTime,
          },
        },
      });
      const roomLines = [];
      for (let i = 0; i < input.rooms.length; i++) {
        const r = input.rooms[i];
        roomLines.push(
          await tx.reservationRoom.create({
            data: {
              reservationId: reservation.id,
              propertyId: ctx.propertyId,
              categoryId: r.categoryId,
              ratePlanId: plan.id,
              adults: r.adults,
              children: r.children,
              arrivalDate: d(input.arrival),
              departureDate: d(input.departure),
              nightlyRates: quotes[i].nights as unknown as Prisma.InputJsonValue,
              roomTotal: quotes[i].roomTotal,
            },
          }),
        );
      }
      await tx.reservationOccupant.create({ data: { reservationId: reservation.id, reservationRoomId: roomLines[0].id, guestId: primary.id, isPrimary: true, isAdult: true } });
      // Guest IDs in input order (primary first) so callers can attach documents to each person.
      const guestIds = [primary.id];
      for (const g of input.additionalGuests) {
        const { isAdult, ...guestData } = g;
        const guest = await this.guests.create(ctx, guestData as GuestInput, tx);
        await tx.reservationOccupant.create({ data: { reservationId: reservation.id, reservationRoomId: roomLines[0].id, guestId: guest.id, isPrimary: false, isAdult } });
        guestIds.push(guest.id);
      }
      await this.finance.createFolio(tx, ctx.propertyId, reservation.id, `${primary.firstName} ${primary.lastName}`, ctx.property.currency);
      await tx.reservationHistory.create({ data: { reservationId: reservation.id, action: 'CREATED', toStatus: status, actorId: ctx.userId, details: { source: input.source, rooms: input.rooms.length, grandTotal: grand.toFixed(2) } } });
      await this.audit.log(ctx, 'RESERVATION_CREATED', 'Reservation', reservation.id, { confirmationNo, status, source: input.source }, tx, ctx.isGuest ? 'GUEST' : 'USER');
      const payload = {
        name: primary.firstName,
        confirmationNo,
        arrival: input.arrival,
        departure: input.departure,
        total: grand.toFixed(2),
        currency: ctx.property.currency,
        hotel: ctx.property.name,
        deposit: deposit.toFixed(2),
        holdExpiresAt: holdExpiresAt?.toISOString() ?? '',
        portalUrl: `${loadConfig().WEB_ORIGIN}/${primary.preferredLocale}/portal`,
      };
      await this.notifications.enqueue(
        {
          propertyId: ctx.propertyId,
          channel: 'EMAIL',
          template: status === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : 'BOOKING_PENDING_PAYMENT',
          locale: primary.preferredLocale,
          recipient: primary.email,
          payload,
          dedupeKey: status === 'CONFIRMED' ? `confirm:${reservation.id}` : `pending:${reservation.id}`,
        },
        tx,
      );
      return { ...reservation, guestIds };
    };
    const reservation = opts.tx ? await run(opts.tx) : await this.prisma.withInventoryLock(ctx.propertyId, run);
    return reservation;
  }

  async ensure(ctx: Pick<RequestContext, 'propertyId'>, id: string, tx: Tx = this.prisma) {
    const r = await tx.reservation.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!r) throw notFound('RESERVATION');
    return r;
  }

  async transition(tx: Tx, ctx: RequestContext, id: string, from: ReservationStatus, to: ReservationStatus, action: string, details: Record<string, unknown> = {}) {
    if (!canTransitionReservation(from, to)) throw new AppError('INVALID_STATUS_TRANSITION', 409, { from, to });
    const updated = await tx.reservation.updateMany({ where: { id, status: from }, data: { status: to, version: { increment: 1 } } });
    if (updated.count !== 1) throw conflict('RESERVATION_CHANGED_CONCURRENTLY');
    await tx.reservationHistory.create({ data: { reservationId: id, action, fromStatus: from, toStatus: to, actorId: ctx.userId, details: details as Prisma.InputJsonValue } });
  }

  async list(ctx: RequestContext, q: { q?: string; status?: string; arrivalFrom?: string; arrivalTo?: string; page: number; pageSize: number }) {
    const where: Prisma.ReservationWhereInput = {
      propertyId: ctx.propertyId,
      ...(q.status ? { status: q.status as ReservationStatus } : {}),
      ...(q.arrivalFrom || q.arrivalTo
        ? { arrivalDate: { ...(q.arrivalFrom ? { gte: d(q.arrivalFrom) } : {}), ...(q.arrivalTo ? { lte: d(q.arrivalTo) } : {}) } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { confirmationNo: { contains: q.q.toUpperCase() } },
              { primaryGuest: { lastName: { contains: q.q, mode: 'insensitive' } } },
              { primaryGuest: { firstName: { contains: q.q, mode: 'insensitive' } } },
              { groupName: { contains: q.q, mode: 'insensitive' } },
              { companyName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: { primaryGuest: { select: { firstName: true, lastName: true } }, rooms: { select: { id: true, categoryId: true, assignments: { where: { status: { in: ['PLANNED', 'ACTIVE'] } }, select: { room: { select: { number: true } } } } } } },
        orderBy: [{ arrivalDate: 'desc' }, { createdAt: 'desc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id,
        confirmationNo: r.confirmationNo,
        status: r.status,
        source: r.source,
        guestName: `${r.primaryGuest.firstName} ${r.primaryGuest.lastName}`,
        arrival: iso(r.arrivalDate),
        departure: iso(r.departureDate),
        rooms: r.rooms.length,
        roomNumbers: r.rooms.flatMap((x) => x.assignments.map((a) => a.room.number)),
        grandTotal: r.grandTotal.toString(),
        currency: r.currency,
        groupName: r.groupName,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async detail(ctx: RequestContext, id: string) {
    await this.ensure(ctx, id);
    const r = await this.prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: {
        primaryGuest: true,
        rooms: {
          include: {
            assignments: { orderBy: { createdAt: 'asc' }, include: { room: { select: { id: true, number: true, housekeepingStatus: true, maintenanceStatus: true } } } },
            stay: true,
          },
        },
        occupants: { include: { guest: true } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    const categories = await this.prisma.roomCategory.findMany({ where: { propertyId: ctx.propertyId }, select: { id: true, code: true, nameEn: true, nameAr: true } });
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const [requirements, balances] = await Promise.all([this.documents.requirements(ctx.propertyId, id), this.finance.balances(id)]);
    const paid = await this.finance.paidAmount(id);
    return {
      ...r,
      arrivalDate: iso(r.arrivalDate),
      departureDate: iso(r.departureDate),
      primaryGuest: this.guests.present(r.primaryGuest),
      rooms: r.rooms.map((rr) => ({
        ...rr,
        arrivalDate: iso(rr.arrivalDate),
        departureDate: iso(rr.departureDate),
        category: catMap.get(rr.categoryId),
        assignments: rr.assignments.map((a) => ({ ...a, startDate: iso(a.startDate), endDate: iso(a.endDate) })),
      })),
      occupants: r.occupants.map((o) => ({ ...o, guest: this.guests.present(o.guest) })),
      documentRequirements: requirements,
      balances,
      paid: paid.toFixed(2),
    };
  }

  async addOccupant(ctx: RequestContext, id: string, input: { guestId?: string; guest?: GuestInput; isAdult: boolean; reservationRoomId?: string }) {
    const res = await this.ensure(ctx, id);
    if (['CANCELLED', 'CHECKED_OUT', 'NO_SHOW', 'EXPIRED'].includes(res.status)) throw new AppError('RESERVATION_CLOSED', 409);
    return this.prisma.$transaction(async (tx) => {
      const guest = input.guestId ? await this.guests.ensure(ctx, input.guestId, tx) : await this.guests.create(ctx, input.guest!, tx);
      if (input.reservationRoomId) {
        const rr = await tx.reservationRoom.findFirst({ where: { id: input.reservationRoomId, reservationId: id } });
        if (!rr) throw notFound('RESERVATION_ROOM');
      }
      const occ = await tx.reservationOccupant.create({ data: { reservationId: id, guestId: guest.id, isAdult: input.isAdult, reservationRoomId: input.reservationRoomId ?? null } });
      await tx.reservationHistory.create({ data: { reservationId: id, action: 'OCCUPANT_ADDED', actorId: ctx.userId, details: { guestId: guest.id } } });
      await this.audit.log(ctx, 'OCCUPANT_ADDED', 'Reservation', id, { guestId: guest.id }, tx);
      return occ;
    });
  }

  /**
   * Date changes re-check availability and re-price the stay with current rules (an explicit, permitted
   * modification). Old and new totals are recorded in history. Planned room assignments that no longer
   * fit are released and must be re-assigned.
   */
  async modify(ctx: RequestContext, id: string, input: z.infer<typeof modifyReservationSchema>) {
    return this.prisma.withInventoryLock(ctx.propertyId, async (tx) => {
      const res = await this.ensure(ctx, id, tx);
      if (!['CONFIRMED', 'PENDING', 'AWAITING_PAYMENT', 'INQUIRY'].includes(res.status)) throw new AppError('RESERVATION_NOT_MODIFIABLE', 409);
      const data: Prisma.ReservationUpdateInput = { version: { increment: 1 } };
      if (input.specialRequests !== undefined) data.specialRequests = input.specialRequests;
      if (input.groupName !== undefined) data.groupName = input.groupName;
      if (input.companyName !== undefined) data.companyName = input.companyName;
      const arrival = input.arrival ?? iso(res.arrivalDate)!;
      const departure = input.departure ?? iso(res.departureDate)!;
      const datesChanged = arrival !== iso(res.arrivalDate) || departure !== iso(res.departureDate);
      let details: Record<string, unknown> = { fields: Object.keys(input) };
      if (datesChanged) {
        if (arrival >= departure) throw new AppError('DEPARTURE_AFTER_ARRIVAL');
        if (arrival < today(ctx.property)) throw new AppError('ARRIVAL_IN_PAST');
        const plan = await tx.ratePlan.findUniqueOrThrow({ where: { id: res.ratePlanId } });
        const rooms = await tx.reservationRoom.findMany({ where: { reservationId: id, active: true } });
        const avail = await this.availability.byCategory(ctx.propertyId, arrival, departure, { tx, excludeReservationId: id });
        const need = new Map<string, number>();
        rooms.forEach((r) => need.set(r.categoryId, (need.get(r.categoryId) ?? 0) + 1));
        for (const [cat, n] of need) {
          if ((avail.get(cat)?.available ?? 0) < n) throw conflict('NO_AVAILABILITY', { categoryId: cat });
          await this.availability.checkRestrictions(ctx.propertyId, plan, cat, arrival, departure, tx);
        }
        let room = new Decimal(0), disc = new Decimal(0), sc = new Decimal(0), tax = new Decimal(0), grand = new Decimal(0);
        for (const rr of rooms) {
          const q = await this.availability.quote(ctx.propertyId, plan, rr.categoryId, arrival, departure, rr.adults, rr.children, tx);
          await tx.reservationRoom.update({ where: { id: rr.id }, data: { arrivalDate: d(arrival), departureDate: d(departure), nightlyRates: q.nights as any, roomTotal: q.roomTotal } });
          room = room.plus(q.roomTotal); disc = disc.plus(q.discount); sc = sc.plus(q.serviceCharge); tax = tax.plus(q.tax); grand = grand.plus(q.grandTotal);
          // Release planned assignments; they will be re-validated on re-assignment.
          const released = await tx.roomAssignment.updateMany({ where: { reservationRoomId: rr.id, status: 'PLANNED' }, data: { status: 'CANCELLED', reason: 'DATES_MODIFIED' } });
          if (released.count) details = { ...details, assignmentsReleased: true };
        }
        Object.assign(data, {
          arrivalDate: d(arrival),
          departureDate: d(departure),
          roomTotal: room.toFixed(3),
          discountTotal: disc.toFixed(3),
          serviceChargeTotal: sc.toFixed(3),
          taxTotal: tax.toFixed(3),
          grandTotal: grand.toFixed(3),
          depositRequired: percentOf(grand, plan.depositPercent.toString()).toFixed(3),
        });
        details = { ...details, from: { arrival: iso(res.arrivalDate), departure: iso(res.departureDate), total: res.grandTotal.toString() }, to: { arrival, departure, total: grand.toFixed(2) } };
      }
      const updated = await tx.reservation.update({ where: { id }, data, include: { primaryGuest: true } });
      await tx.reservationHistory.create({ data: { reservationId: id, action: 'MODIFIED', actorId: ctx.userId, details: details as Prisma.InputJsonValue } });
      await this.audit.log(ctx, 'RESERVATION_MODIFIED', 'Reservation', id, details, tx, ctx.isGuest ? 'GUEST' : 'USER');
      if (datesChanged) {
        await this.notifications.enqueue(
          { propertyId: ctx.propertyId, channel: 'EMAIL', template: 'BOOKING_MODIFIED', locale: updated.primaryGuest.preferredLocale, recipient: updated.primaryGuest.email, payload: { name: updated.primaryGuest.firstName, confirmationNo: updated.confirmationNo, arrival, departure, total: updated.grandTotal.toString(), currency: updated.currency }, dedupeKey: `modified:${id}:${updated.version}` },
          tx,
        );
      }
      return updated;
    });
  }

  /** Cancels per the policy snapshot taken at booking time; posts any fee to the folio. */
  async cancel(ctx: RequestContext, id: string, input: { reason: string; waiveFee: boolean }) {
    if (input.waiveFee && !ctx.permissions.has('folio.adjust')) throw new AppError('PERMISSION_DENIED', 403, { missing: ['folio.adjust'] });
    return this.prisma.$transaction(async (tx) => {
      const res = await this.ensure(ctx, id, tx);
      if (!canTransitionReservation(res.status as any, 'CANCELLED')) throw new AppError('INVALID_STATUS_TRANSITION', 409, { from: res.status, to: 'CANCELLED' });
      const snap = res.policySnapshot as any;
      const rooms = await tx.reservationRoom.findMany({ where: { reservationId: id } });
      const nightly = rooms.flatMap((r) => r.nightlyRates as { date: string; amount: string }[]);
      // Merge nightly totals per date across rooms for the penalty calculation.
      const byDate = new Map<string, Decimal>();
      nightly.forEach((n) => byDate.set(n.date, (byDate.get(n.date) ?? new Decimal(0)).plus(n.amount)));
      const merged = [...byDate.entries()].sort().map(([date, amount]) => ({ date, amount: amount.toFixed(2) }));
      const hours = hoursUntilArrival(ctx.property, iso(res.arrivalDate)!);
      const wasConfirmed = ['CONFIRMED'].includes(res.status);
      let fee = wasConfirmed && !input.waiveFee
        ? cancellationFee({ freeCancellationHours: snap.freeCancellationHours, penaltyNights: snap.penaltyNights, refundable: snap.refundable }, merged, hours, res.grandTotal.toString())
        : new Decimal(0);
      if (fee.greaterThan(res.grandTotal.toString())) fee = new Decimal(res.grandTotal.toString());
      await this.transition(tx, ctx, id, res.status as any, 'CANCELLED', 'CANCELLED', { reason: input.reason, fee: fee.toFixed(2), waived: input.waiveFee });
      await tx.reservation.update({ where: { id }, data: { cancelledAt: new Date(), cancellationReason: input.reason, cancellationFee: fee.toFixed(3) } });
      await tx.reservationRoom.updateMany({ where: { reservationId: id }, data: { active: false } });
      await tx.roomAssignment.updateMany({ where: { reservationRoom: { reservationId: id }, status: 'PLANNED' }, data: { status: 'CANCELLED', reason: 'RESERVATION_CANCELLED' } });
      if (fee.greaterThan(0)) {
        const folio = await this.finance.primaryFolio(tx, id);
        await this.finance.post(tx, { folioId: folio.id, propertyId: ctx.propertyId, type: 'ADJUSTMENT', description: 'CANCELLATION_FEE', amount: fee, businessDate: today(ctx.property), postedById: ctx.userId, idempotencyKey: `cancelfee:${id}` });
      }
      await this.audit.log(ctx, 'RESERVATION_CANCELLED', 'Reservation', id, { reason: input.reason, fee: fee.toFixed(2) }, tx, ctx.isGuest ? 'GUEST' : 'USER');
      const g = await tx.guest.findUniqueOrThrow({ where: { id: res.primaryGuestId } });
      await this.notifications.enqueue(
        { propertyId: ctx.propertyId, channel: 'EMAIL', template: 'BOOKING_CANCELLED', locale: g.preferredLocale, recipient: g.email, payload: { name: g.firstName, confirmationNo: res.confirmationNo, fee: fee.toFixed(2), currency: res.currency }, dedupeKey: `cancel:${id}` },
        tx,
      );
      return { ok: true, fee: fee.toFixed(2) };
    });
  }

  /** Marks a confirmed reservation as no-show (on/after arrival date) and charges the first night per policy. */
  async noShow(ctx: RequestContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await this.ensure(ctx, id, tx);
      if (iso(res.arrivalDate)! > today(ctx.property)) throw new AppError('ARRIVAL_DATE_IN_FUTURE');
      await this.transition(tx, ctx, id, res.status as any, 'NO_SHOW', 'NO_SHOW');
      await tx.reservationRoom.updateMany({ where: { reservationId: id }, data: { active: false } });
      await tx.roomAssignment.updateMany({ where: { reservationRoom: { reservationId: id }, status: 'PLANNED' }, data: { status: 'CANCELLED', reason: 'NO_SHOW' } });
      const snap = res.policySnapshot as any;
      const rooms = await tx.reservationRoom.findMany({ where: { reservationId: id } });
      const fee = snap.refundable
        ? sumMoney(rooms.map((r) => ((r.nightlyRates as any[])[0]?.amount ?? '0')))
        : new Decimal(res.grandTotal.toString());
      if (fee.greaterThan(0)) {
        const folio = await this.finance.primaryFolio(tx, id);
        await this.finance.post(tx, { folioId: folio.id, propertyId: ctx.propertyId, type: 'ADJUSTMENT', description: 'NO_SHOW_FEE', amount: fee, businessDate: today(ctx.property), postedById: ctx.userId, idempotencyKey: `noshow:${id}` });
      }
      await this.audit.log(ctx, 'RESERVATION_NO_SHOW', 'Reservation', id, { fee: fee.toFixed(2) }, tx);
      return { ok: true, fee: fee.toFixed(2) };
    });
  }

  async confirm(ctx: RequestContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await this.ensure(ctx, id, tx);
      await this.transition(tx, ctx, id, res.status as any, 'CONFIRMED', 'CONFIRMED');
      await tx.reservation.update({ where: { id }, data: { holdExpiresAt: null } });
      await this.audit.log(ctx, 'RESERVATION_CONFIRMED', 'Reservation', id, {}, tx);
      return { ok: true };
    });
  }

  /** Expires temporary holds (called by the worker). */
  async expireHolds(now = new Date()) {
    const expired = await this.prisma.reservation.findMany({
      where: { status: { in: ['PENDING', 'AWAITING_PAYMENT', 'INQUIRY'] }, holdExpiresAt: { lt: now } },
      select: { id: true, status: true, propertyId: true },
    });
    for (const r of expired) {
      await this.prisma.$transaction(async (tx) => {
        const n = await tx.reservation.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'EXPIRED' } });
        if (!n.count) return;
        await tx.reservationRoom.updateMany({ where: { reservationId: r.id }, data: { active: false } });
        await tx.roomAssignment.updateMany({ where: { reservationRoom: { reservationId: r.id }, status: 'PLANNED' }, data: { status: 'CANCELLED', reason: 'HOLD_EXPIRED' } });
        await tx.reservationHistory.create({ data: { reservationId: r.id, action: 'HOLD_EXPIRED', fromStatus: r.status, toStatus: 'EXPIRED' } });
      });
    }
    return expired.length;
  }
}
