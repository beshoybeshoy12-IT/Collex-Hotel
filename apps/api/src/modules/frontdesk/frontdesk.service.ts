import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  addDays,
  checkInSchema,
  checkOutSchema,
  Decimal,
  evaluateRoom,
  stayNights,
  sumMoney,
  walkInSchema,
  percentOf,
  rankRooms,
} from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, today } from '../../common/util';
import { AssignmentsService } from './assignments.service';
import { DocumentsService } from '../documents/documents.service';
import { FinanceService } from '../finance/finance.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../rates/availability.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignments: AssignmentsService,
    private readonly documents: DocumentsService,
    private readonly finance: FinanceService,
    private readonly reservations: ReservationsService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async dashboard(ctx: RequestContext) {
    const date = today(ctx.property);
    const guestSel = { select: { firstName: true, lastName: true, vip: true } };
    const roomLineInclude = {
      assignments: { where: { status: { in: ['PLANNED', 'ACTIVE'] as any } }, include: { room: { select: { id: true, number: true, housekeepingStatus: true, maintenanceStatus: true } } } },
      stay: true,
    };
    const [arrivals, departures, inHouse, rooms, unassigned, docsPending, openRequests] = await Promise.all([
      this.prisma.reservation.findMany({ where: { propertyId: ctx.propertyId, arrivalDate: d(date), status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, include: { primaryGuest: guestSel, rooms: { where: { active: true }, include: roomLineInclude } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.reservation.findMany({ where: { propertyId: ctx.propertyId, departureDate: { lte: d(date) }, status: 'CHECKED_IN' }, include: { primaryGuest: guestSel, rooms: { where: { active: true }, include: roomLineInclude } } }),
      this.prisma.stay.findMany({ where: { propertyId: ctx.propertyId, status: 'IN_HOUSE' }, include: { reservation: { include: { primaryGuest: guestSel } }, reservationRoom: { include: { assignments: { where: { status: 'ACTIVE' }, include: { room: { select: { number: true } } } } } } } }),
      this.prisma.room.groupBy({ by: ['housekeepingStatus', 'maintenanceStatus'], where: { propertyId: ctx.propertyId, active: true }, _count: true }),
      this.assignments.unassignedQueue(ctx, 1),
      this.prisma.identityDocument.count({ where: { propertyId: ctx.propertyId, status: 'AWAITING_REVIEW', purgedAt: null } }),
      this.prisma.serviceRequest.count({ where: { propertyId: ctx.propertyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    const present = (r: any) => ({
      id: r.id,
      confirmationNo: r.confirmationNo,
      status: r.status,
      guestName: `${r.primaryGuest.firstName} ${r.primaryGuest.lastName}`,
      vip: r.primaryGuest.vip,
      arrival: iso(r.arrivalDate),
      departure: iso(r.departureDate),
      groupName: r.groupName,
      rooms: r.rooms.map((rr: any) => ({
        id: rr.id,
        adults: rr.adults,
        children: rr.children,
        categoryId: rr.categoryId,
        checkedIn: !!rr.stay,
        stayId: rr.stay?.status === 'IN_HOUSE' ? rr.stay.id : null,
        room: rr.assignments[0]?.room ?? null,
      })),
    });
    return {
      businessDate: date,
      arrivals: arrivals.map(present),
      departures: departures.map(present),
      inHouse: inHouse.map((s) => ({
        stayId: s.id,
        reservationId: s.reservationId,
        confirmationNo: s.reservation.confirmationNo,
        guestName: `${s.reservation.primaryGuest.firstName} ${s.reservation.primaryGuest.lastName}`,
        room: s.reservationRoom.assignments[0]?.room.number ?? null,
        departure: iso(s.reservationRoom.departureDate),
      })),
      roomStatus: rooms.map((r) => ({ housekeepingStatus: r.housekeepingStatus, maintenanceStatus: r.maintenanceStatus, count: r._count })),
      unassigned,
      documentsAwaitingReview: docsPending,
      openServiceRequests: openRequests,
    };
  }

  /**
   * Identity-aware check-in. All validations and writes happen in one transaction; the stay is
   * only created if every step succeeds.
   */
  async checkIn(ctx: RequestContext, input: z.infer<typeof checkInSchema>) {
    const stay = await this.prisma.$transaction(
      async (tx) => {
        const rr = await this.assignments.loadReservationRoom(ctx, input.reservationRoomId, tx);
        const res = rr.reservation;
        const date = today(ctx.property);
        if (!['CONFIRMED', 'CHECKED_IN'].includes(res.status)) throw new AppError('RESERVATION_NOT_CHECKIN_READY', 409, { status: res.status });
        if (!rr.active) throw new AppError('RESERVATION_NOT_CHECKIN_READY', 409);
        if (await tx.stay.findUnique({ where: { reservationRoomId: rr.id } })) throw conflict('ALREADY_CHECKED_IN');
        if (iso(rr.arrivalDate)! > date) throw new AppError('ARRIVAL_DATE_IN_FUTURE', 409);
        if (iso(rr.departureDate)! <= date) throw new AppError('DEPARTURE_DATE_PASSED', 409);

        // 1. Identity documents per policy
        const req = await this.documents.requirements(ctx.propertyId, res.id, rr.id, tx);
        let exception: { reason: string } | null = null;
        if (!req.satisfied) {
          if (!input.documentException) throw new AppError('DOCUMENTS_INCOMPLETE', 409, { guests: req.guests.filter((g) => g.state !== 'SATISFIED') });
          if (!req.policy.allowExceptions) throw new AppError('DOCUMENT_EXCEPTIONS_NOT_ALLOWED', 409);
          if (!ctx.permissions.has('frontdesk.checkin_exception')) throw new AppError('PERMISSION_DENIED', 403, { missing: ['frontdesk.checkin_exception'] });
          exception = input.documentException;
        }

        // 2. Deposit
        const policy = await tx.checkInPolicy.findUnique({ where: { propertyId: ctx.propertyId } });
        if (policy?.requireDepositBeforeCheckIn) {
          const paid = await this.finance.paidAmount(res.id, tx);
          if (paid.lessThan(res.depositRequired.toString())) throw new AppError('DEPOSIT_REQUIRED', 409, { required: res.depositRequired.toString(), paid: paid.toFixed(2) });
        }

        // 3. Room: explicit selection or existing planned assignment, re-validated for readiness.
        let assignment = await tx.roomAssignment.findFirst({ where: { reservationRoomId: rr.id, status: 'PLANNED' } });
        if (input.roomId && assignment?.roomId !== input.roomId) {
          assignment = await this.assignments.assign(ctx, { reservationRoomId: rr.id, roomId: input.roomId, allowUpgrade: false, reason: 'CHECK_IN' }, tx);
        }
        if (!assignment) throw new AppError('ROOM_NOT_ASSIGNED', 409);
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${assignment.roomId} FOR UPDATE`;
        const [cand] = await this.assignments.candidates(ctx, date, iso(rr.departureDate)!, tx, [assignment.roomId]);
        const category = await tx.roomCategory.findUniqueOrThrow({ where: { id: rr.categoryId } });
        const evalResult = evaluateRoom(cand, {
          reservationRoomId: rr.id,
          categoryId: rr.categoryId,
          categoryRank: category.rank,
          start: date,
          end: iso(rr.departureDate)!,
          occupants: rr.adults + rr.children,
          immediateCheckIn: true,
          requireInspection: policy?.requireInspectedRoom ?? false,
          allowUpgrade: true,
          preferences: {},
        });
        if (!evalResult.eligible) throw conflict('ROOM_NOT_READY', { reasons: evalResult.reasons, roomId: assignment.roomId });

        // 4. Activate
        await tx.roomAssignment.update({ where: { id: assignment.id }, data: { status: 'ACTIVE', checkedInAt: new Date() } });
        const stay = await tx.stay.create({
          data: {
            propertyId: ctx.propertyId,
            reservationId: res.id,
            reservationRoomId: rr.id,
            checkedInAt: new Date(),
            checkedInById: ctx.userId,
            keyCardsIssued: input.keyCardsIssued,
            acknowledgements: input.acknowledgements,
            docExceptionReason: exception?.reason ?? null,
            docExceptionApprovedBy: exception ? ctx.userId : null,
            docExceptionAt: exception ? new Date() : null,
          },
        });
        if (res.status === 'CONFIRMED') await this.reservations.transition(tx, ctx, res.id, 'CONFIRMED', 'CHECKED_IN', 'CHECKED_IN', { reservationRoomId: rr.id });
        else await tx.reservationHistory.create({ data: { reservationId: res.id, action: 'ROOM_CHECKED_IN', actorId: ctx.userId, details: { reservationRoomId: rr.id } } });
        await this.audit.log(ctx, 'CHECK_IN', 'Stay', stay.id, { reservationId: res.id, roomId: assignment.roomId, documentException: !!exception }, tx);
        if (exception) await this.audit.log(ctx, 'CHECKIN_DOCUMENT_EXCEPTION', 'Stay', stay.id, { reason: exception.reason, missing: req.guests.filter((g) => g.state !== 'SATISFIED').map((g) => g.guestId) }, tx);
        await this.notifications.enqueue(
          { propertyId: ctx.propertyId, channel: 'EMAIL', template: 'CHECKIN_CONFIRMED', locale: res.primaryGuest.preferredLocale, recipient: res.primaryGuest.email, payload: { name: res.primaryGuest.firstName, room: cand.number, departure: iso(rr.departureDate), checkOutTime: ctx.property.checkOutTime, hotel: ctx.property.name }, dedupeKey: `checkin:${stay.id}` },
          tx,
        );
        return stay;
      },
      { timeout: 20_000 },
    );
    return stay;
  }

  /** Posts room charges for the stay's nights up to (excluding) `until`. Idempotent per night. */
  async postStayCharges(tx: Tx, reservationRoomId: string, arrival: string, until: string, actorId: string | null) {
    for (const night of stayNights(arrival, until)) await this.finance.postRoomNight(tx, reservationRoomId, night, actorId);
  }

  async checkOut(ctx: RequestContext, input: z.infer<typeof checkOutSchema>) {
    if (input.allowOutstandingBalance && !ctx.permissions.has('folio.adjust')) throw new AppError('PERMISSION_DENIED', 403, { missing: ['folio.adjust'] });
    return this.prisma.$transaction(
      async (tx) => {
        const stay = await tx.stay.findFirst({ where: { id: input.stayId, propertyId: ctx.propertyId }, include: { reservationRoom: true, reservation: { include: { primaryGuest: true } } } });
        if (!stay) throw notFound('STAY');
        if (stay.status !== 'IN_HOUSE') throw conflict('STAY_NOT_IN_HOUSE');
        const date = today(ctx.property);
        const arrival = iso(stay.reservationRoom.arrivalDate)!;
        const departure = iso(stay.reservationRoom.departureDate)!;
        // Charge every night actually used (at least one); early departures stop at today.
        const until = date >= departure ? departure : date > arrival ? date : addDays(arrival, 1);
        await this.postStayCharges(tx, stay.reservationRoomId, arrival, until, ctx.userId);
        const balances = await this.finance.balances(stay.reservationId, tx);
        const otherInHouse = await tx.stay.count({ where: { reservationId: stay.reservationId, status: 'IN_HOUSE', id: { not: stay.id } } });
        if (!otherInHouse && new Decimal(balances.balance).greaterThan(0) && !input.allowOutstandingBalance) {
          throw new AppError('BALANCE_OUTSTANDING', 409, balances);
        }
        const assignment = await tx.roomAssignment.findFirst({ where: { reservationRoomId: stay.reservationRoomId, status: 'ACTIVE' } });
        if (!assignment) throw conflict('NO_ACTIVE_ASSIGNMENT');
        const early = date < departure;
        await tx.roomAssignment.update({
          where: { id: assignment.id },
          data: { status: 'COMPLETED', checkedOutAt: new Date(), ...(early && date > iso(assignment.startDate)! ? { endDate: d(date) } : {}) },
        });
        await tx.stay.update({ where: { id: stay.id }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date(), checkedOutById: ctx.userId } });
        if (early) {
          // Release unused future nights back to inventory.
          await tx.reservationRoom.update({ where: { id: stay.reservationRoomId }, data: { departureDate: d(until) } });
          await tx.reservationHistory.create({ data: { reservationId: stay.reservationId, action: 'EARLY_DEPARTURE', actorId: ctx.userId, details: { plannedDeparture: departure, actual: until } } });
        }
        // Room needs cleaning after departure.
        const room = await tx.room.findUniqueOrThrow({ where: { id: assignment.roomId } });
        await tx.room.update({ where: { id: room.id }, data: { housekeepingStatus: 'DIRTY', doNotDisturb: false } });
        await tx.roomStatusHistory.create({ data: { propertyId: ctx.propertyId, roomId: room.id, field: 'housekeepingStatus', fromValue: room.housekeepingStatus, toValue: 'DIRTY', reason: 'CHECK_OUT', actorId: ctx.userId } });
        await tx.housekeepingTask.create({ data: { propertyId: ctx.propertyId, roomId: room.id, type: 'DEPARTURE_CLEAN', priority: 'HIGH', createdById: ctx.userId, checklist: defaultChecklist('DEPARTURE_CLEAN') } });

        if (!otherInHouse) {
          const pending = await tx.reservationRoom.count({ where: { reservationId: stay.reservationId, active: true, stay: null } });
          if (!pending) await this.reservations.transition(tx, ctx, stay.reservationId, 'CHECKED_IN', 'CHECKED_OUT', 'CHECKED_OUT');
          if (new Decimal(balances.balance).isZero()) await tx.folio.updateMany({ where: { reservationId: stay.reservationId }, data: { status: 'CLOSED', closedAt: new Date() } });
        }
        await this.audit.log(ctx, 'CHECK_OUT', 'Stay', stay.id, { balance: balances.balance, early, outstandingAllowed: input.allowOutstandingBalance }, tx);
        const g = stay.reservation.primaryGuest;
        await this.notifications.enqueue(
          { propertyId: ctx.propertyId, channel: 'EMAIL', template: 'CHECKOUT_SUMMARY', locale: g.preferredLocale, recipient: g.email, payload: { name: g.firstName, charges: balances.charges, payments: balances.credits, balance: balances.balance, currency: stay.reservation.currency, hotel: ctx.property.name }, dedupeKey: `checkout:${stay.id}` },
          tx,
        );
        return { ok: true, balances };
      },
      { timeout: 20_000 },
    );
  }

  /** Walk-in: creates a confirmed same-day reservation and assigns the best ready room. */
  async walkIn(ctx: RequestContext, input: z.infer<typeof walkInSchema>) {
    const arrival = today(ctx.property);
    return this.prisma.withInventoryLock(ctx.propertyId, async (tx) => {
      const reservation = await this.reservations.create(
        ctx,
        {
          arrival,
          departure: input.departure,
          ratePlanId: input.ratePlanId,
          source: 'WALK_IN',
          rooms: [{ categoryId: input.categoryId, adults: input.adults, children: input.children }],
          primaryGuest: input.guest,
          additionalGuests: input.additionalGuests,
          specialRequests: input.specialRequests,
          groupName: null,
          companyName: null,
          confirm: true,
        },
        { tx },
      );
      const rr = await tx.reservationRoom.findFirstOrThrow({ where: { reservationId: reservation.id } });
      const rec = await this.assignments.candidates(ctx, arrival, input.departure, tx);
      const req = await this.assignments.buildRequest(ctx, await this.assignments.loadReservationRoom(ctx, rr.id, tx), { allowUpgrade: false }, tx);
      // The receptionist's chosen room is re-validated by assign(); without a choice the best ready room is used.
      const chosen = input.roomId ? rec.find((r) => r.id === input.roomId) : undefined;
      if (input.roomId && !chosen) throw notFound('ROOM');
      const auto = chosen ? undefined : rankRooms(rec, req).find((r) => r.eligible);
      const pick = chosen ? { roomId: chosen.id, number: chosen.number } : auto ? { roomId: auto.roomId, number: auto.number } : null;
      let assignedRoom: string | null = null;
      if (pick) {
        await this.assignments.assign(ctx, { reservationRoomId: rr.id, roomId: pick.roomId, allowUpgrade: false, source: 'WALK_IN' }, tx);
        assignedRoom = pick.number;
      }
      return { reservationId: reservation.id, confirmationNo: reservation.confirmationNo, reservationRoomId: rr.id, assignedRoom, guestIds: reservation.guestIds };
    });
  }

  /** Extends a stay; prices the extra nights with current rates and keeps the same room when free. */
  async extend(ctx: RequestContext, reservationId: string, newDeparture: string) {
    return this.prisma.withInventoryLock(ctx.propertyId, async (tx) => {
      const res = await this.reservations.ensure(ctx, reservationId, tx);
      if (!['CONFIRMED', 'CHECKED_IN'].includes(res.status)) throw new AppError('RESERVATION_NOT_MODIFIABLE', 409);
      const oldDeparture = iso(res.departureDate)!;
      if (newDeparture <= oldDeparture) throw new AppError('NEW_DEPARTURE_MUST_BE_LATER');
      const plan = await tx.ratePlan.findUniqueOrThrow({ where: { id: res.ratePlanId } });
      const lines = await tx.reservationRoom.findMany({ where: { reservationId, active: true } });
      const avail = await this.availability.byCategory(ctx.propertyId, oldDeparture, newDeparture, { tx, excludeReservationId: reservationId });
      const need = new Map<string, number>();
      lines.forEach((l) => need.set(l.categoryId, (need.get(l.categoryId) ?? 0) + 1));
      for (const [cat, n] of need) if ((avail.get(cat)?.available ?? 0) < n) throw conflict('NO_AVAILABILITY', { categoryId: cat });
      const snap = res.policySnapshot as any;
      let extra = new Decimal(0);
      for (const line of lines) {
        const q = await this.availability.quote(ctx.propertyId, plan, line.categoryId, oldDeparture, newDeparture, line.adults, line.children, tx);
        const nights = [...(line.nightlyRates as any[]), ...q.nights];
        await tx.reservationRoom.update({ where: { id: line.id }, data: { departureDate: d(newDeparture), nightlyRates: nights, roomTotal: sumMoney(nights.map((n) => n.amount)).toFixed(3) } });
        extra = extra.plus(q.roomTotal);
        const a = await tx.roomAssignment.findFirst({ where: { reservationRoomId: line.id, status: { in: ['PLANNED', 'ACTIVE'] } } });
        if (a) {
          // The exclusion constraint rejects the extension if the room is taken; the guest then needs a room move.
          try {
            await tx.roomAssignment.update({ where: { id: a.id }, data: { endDate: d(newDeparture) } });
          } catch {
            throw conflict('ROOM_NOT_AVAILABLE_FOR_EXTENSION', { roomId: a.roomId });
          }
        }
      }
      const disc = percentOf(extra, snap.discountPercent ?? 0);
      const net = extra.minus(disc);
      const sc = percentOf(net, snap.serviceChargePercent ?? 0);
      const tax = percentOf(net.plus(sc), snap.taxPercent ?? 0);
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          departureDate: d(newDeparture),
          roomTotal: new Decimal(res.roomTotal.toString()).plus(extra).toFixed(3),
          discountTotal: new Decimal(res.discountTotal.toString()).plus(disc).toFixed(3),
          serviceChargeTotal: new Decimal(res.serviceChargeTotal.toString()).plus(sc).toFixed(3),
          taxTotal: new Decimal(res.taxTotal.toString()).plus(tax).toFixed(3),
          grandTotal: new Decimal(res.grandTotal.toString()).plus(net).plus(sc).plus(tax).toFixed(3),
          version: { increment: 1 },
        },
      });
      await tx.reservationHistory.create({ data: { reservationId, action: 'STAY_EXTENDED', actorId: ctx.userId, details: { from: oldDeparture, to: newDeparture, extraRoom: extra.toFixed(2) } } });
      await this.audit.log(ctx, 'STAY_EXTENDED', 'Reservation', reservationId, { from: oldDeparture, to: newDeparture }, tx);
      return { ok: true, newDeparture };
    });
  }

  /** Moves an in-house guest; history is preserved by closing the old assignment as MOVED. */
  async roomMove(ctx: RequestContext, input: { stayId: string; toRoomId: string; reason: string; allowUpgrade: boolean }) {
    return this.prisma.$transaction(
      async (tx) => {
        const stay = await tx.stay.findFirst({ where: { id: input.stayId, propertyId: ctx.propertyId }, include: { reservationRoom: true } });
        if (!stay || stay.status !== 'IN_HOUSE') throw notFound('STAY');
        const current = await tx.roomAssignment.findFirst({ where: { reservationRoomId: stay.reservationRoomId, status: 'ACTIVE' } });
        if (!current) throw conflict('NO_ACTIVE_ASSIGNMENT');
        if (current.roomId === input.toRoomId) throw new AppError('SAME_ROOM');
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id IN (${current.roomId}, ${input.toRoomId}) ORDER BY id FOR UPDATE`;
        const date = today(ctx.property);
        const end = iso(stay.reservationRoom.departureDate)!;
        const [cand] = await this.assignments.candidates(ctx, date, end, tx, [input.toRoomId]);
        if (!cand) throw notFound('ROOM');
        const category = await tx.roomCategory.findUniqueOrThrow({ where: { id: stay.reservationRoom.categoryId } });
        const policy = await tx.checkInPolicy.findUnique({ where: { propertyId: ctx.propertyId } });
        const result = evaluateRoom(cand, {
          reservationRoomId: stay.reservationRoomId,
          categoryId: stay.reservationRoom.categoryId,
          categoryRank: category.rank,
          start: date,
          end,
          occupants: stay.reservationRoom.adults + stay.reservationRoom.children,
          immediateCheckIn: true,
          requireInspection: policy?.requireInspectedRoom ?? false,
          allowUpgrade: input.allowUpgrade,
          preferences: {},
        });
        if (!result.eligible) throw conflict('ROOM_NOT_ELIGIBLE', { reasons: result.reasons });
        const start = iso(current.startDate)!;
        await tx.roomAssignment.update({
          where: { id: current.id },
          data: { status: 'MOVED', checkedOutAt: new Date(), endDate: d(date > start ? date : addDays(start, 1)), reason: input.reason },
        });
        const moved = await tx.roomAssignment.create({
          data: {
            propertyId: ctx.propertyId,
            reservationRoomId: stay.reservationRoomId,
            roomId: input.toRoomId,
            startDate: d(date),
            endDate: d(end),
            status: 'ACTIVE',
            source: result.isUpgrade ? 'UPGRADE' : 'MOVE',
            assignedById: ctx.userId,
            previousAssignmentId: current.id,
            reason: input.reason,
            checkedInAt: new Date(),
          },
        });
        const oldRoom = await tx.room.findUniqueOrThrow({ where: { id: current.roomId } });
        await tx.room.update({ where: { id: oldRoom.id }, data: { housekeepingStatus: 'DIRTY' } });
        await tx.roomStatusHistory.create({ data: { propertyId: ctx.propertyId, roomId: oldRoom.id, field: 'housekeepingStatus', fromValue: oldRoom.housekeepingStatus, toValue: 'DIRTY', reason: 'ROOM_MOVE', actorId: ctx.userId } });
        await tx.housekeepingTask.create({ data: { propertyId: ctx.propertyId, roomId: oldRoom.id, type: 'DEPARTURE_CLEAN', priority: 'HIGH', createdById: ctx.userId, checklist: defaultChecklist('DEPARTURE_CLEAN') } });
        await tx.reservationHistory.create({ data: { reservationId: stay.reservationId, action: 'ROOM_MOVED', actorId: ctx.userId, details: { fromRoomId: current.roomId, toRoomId: input.toRoomId, reason: input.reason } } });
        await this.audit.log(ctx, 'ROOM_MOVED', 'Stay', stay.id, { fromRoomId: current.roomId, toRoomId: input.toRoomId, reason: input.reason }, tx);
        return moved;
      },
      { timeout: 20_000 },
    );
  }

  /** Night audit: posts tonight's room charges for all in-house stays (idempotent). */
  async nightAudit(ctx: RequestContext) {
    const date = today(ctx.property);
    const stays = await this.prisma.stay.findMany({ where: { propertyId: ctx.propertyId, status: 'IN_HOUSE' }, include: { reservationRoom: true } });
    let posted = 0;
    for (const s of stays) {
      const arrival = iso(s.reservationRoom.arrivalDate)!;
      const departure = iso(s.reservationRoom.departureDate)!;
      const until = addDays(date, 1) < departure ? addDays(date, 1) : departure;
      if (until <= arrival) continue;
      await this.prisma.$transaction((tx) => this.postStayCharges(tx, s.reservationRoomId, arrival, until, ctx.userId));
      posted++;
    }
    await this.audit.log(ctx, 'NIGHT_AUDIT', 'Property', ctx.propertyId, { date, stays: posted });
    return { date, staysPosted: posted };
  }

  /** Data for the printable guest registration card. */
  async registrationCard(ctx: RequestContext, stayId: string) {
    const stay = await this.prisma.stay.findFirst({
      where: { id: stayId, propertyId: ctx.propertyId },
      include: {
        reservation: { include: { primaryGuest: true, occupants: { include: { guest: true } } } },
        reservationRoom: { include: { assignments: { where: { status: { in: ['ACTIVE', 'COMPLETED', 'MOVED'] } }, include: { room: true }, orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!stay) throw notFound('STAY');
    const docs = await this.prisma.identityDocument.findMany({
      where: { propertyId: ctx.propertyId, guestId: { in: stay.reservation.occupants.map((o) => o.guestId) }, purgedAt: null },
      select: { guestId: true, typeCode: true, issuingCountry: true, documentNumberLast4: true, status: true, expiryDate: true },
    });
    await this.audit.log(ctx, 'REGISTRATION_CARD_PRINTED', 'Stay', stayId);
    return {
      property: { name: ctx.property.name, nameAr: ctx.property.nameAr, address: ctx.property.address, phone: ctx.property.phone, checkOutTime: ctx.property.checkOutTime, policiesAr: ctx.property.policiesAr, policiesEn: ctx.property.policiesEn },
      confirmationNo: stay.reservation.confirmationNo,
      arrival: iso(stay.reservationRoom.arrivalDate),
      departure: iso(stay.reservationRoom.departureDate),
      checkedInAt: stay.checkedInAt,
      rooms: stay.reservationRoom.assignments.map((a) => a.room.number),
      guests: stay.reservation.occupants.map((o) => ({
        name: `${o.guest.firstName} ${o.guest.lastName}`,
        nationality: o.guest.nationality,
        isPrimary: o.isPrimary,
        documents: docs.filter((x) => x.guestId === o.guestId).map((x) => ({ typeCode: x.typeCode, issuingCountry: x.issuingCountry, last4: x.documentNumberLast4, status: x.status, expiryDate: iso(x.expiryDate) })),
      })),
      docException: stay.docExceptionReason,
    };
  }
}

export function defaultChecklist(type: string): Prisma.InputJsonValue {
  const items: Record<string, string[]> = {
    DEPARTURE_CLEAN: ['STRIP_BEDS', 'MAKE_BEDS', 'BATHROOM', 'DUST', 'VACUUM', 'RESTOCK_AMENITIES', 'CHECK_MINIBAR', 'LOST_AND_FOUND_CHECK'],
    STAYOVER: ['MAKE_BEDS', 'BATHROOM', 'TOWELS', 'TRASH'],
    INSPECTION: ['CLEANLINESS', 'AMENITIES', 'MAINTENANCE_ISSUES'],
    TOUCH_UP: ['TOWELS', 'TRASH'],
    DEEP_CLEAN: ['CARPETS', 'CURTAINS', 'MATTRESS', 'BATHROOM_DEEP', 'WINDOWS'],
  };
  return (items[type] ?? []).map((item) => ({ item, done: false }));
}
