import { Injectable } from '@nestjs/common';
import { addDays, rankRooms, RoomCandidate, AssignmentRequest, evaluateRoom, HousekeepingStatus, MaintenanceStatus } from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, today } from '../../common/util';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async loadReservationRoom(ctx: Pick<RequestContext, 'propertyId'>, reservationRoomId: string, tx: Tx = this.prisma) {
    const rr = await tx.reservationRoom.findFirst({
      where: { id: reservationRoomId, propertyId: ctx.propertyId },
      include: { reservation: { include: { primaryGuest: true } }, occupants: true },
    });
    if (!rr) throw notFound('RESERVATION_ROOM');
    return rr;
  }

  /** Builds eligibility candidates for all rooms of the property for the given window. */
  async candidates(ctx: Pick<RequestContext, 'propertyId'>, start: string, end: string, tx: Tx = this.prisma, roomIds?: string[]): Promise<RoomCandidate[]> {
    const rooms = await tx.room.findMany({
      where: { propertyId: ctx.propertyId, ...(roomIds ? { id: { in: roomIds } } : {}) },
      include: {
        category: { select: { rank: true, maxOccupancy: true } },
        floor: { select: { level: true } },
        assignments: { where: { status: { in: ['PLANNED', 'ACTIVE'] }, startDate: { lt: d(end) }, endDate: { gt: d(start) } } },
        workOrders: {
          where: { blockType: { not: 'NONE' }, status: { notIn: ['CLOSED', 'CANCELLED'] }, blockFrom: { lt: d(end) }, OR: [{ blockUntil: null }, { blockUntil: { gt: d(start) } }] },
        },
      },
    });
    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      categoryId: r.categoryId,
      categoryRank: r.category.rank,
      floorLevel: r.floor.level,
      maxOccupancy: r.category.maxOccupancy,
      housekeepingStatus: r.housekeepingStatus as HousekeepingStatus,
      maintenanceStatus: r.maintenanceStatus as MaintenanceStatus,
      active: r.active,
      accessible: r.accessible,
      bedType: r.bedType,
      features: r.features,
      allocations: r.assignments.map((a) => ({ start: iso(a.startDate)!, end: iso(a.endDate)!, reservationRoomId: a.reservationRoomId })),
      blocks: r.workOrders.map((w) => ({ start: iso(w.blockFrom)!, end: iso(w.blockUntil) })),
    }));
  }

  async buildRequest(ctx: RequestContext, rr: Awaited<ReturnType<AssignmentsService['loadReservationRoom']>>, opts: { allowUpgrade: boolean; start?: string; nearFloorLevel?: number }, tx: Tx = this.prisma): Promise<AssignmentRequest> {
    const category = await tx.roomCategory.findUniqueOrThrow({ where: { id: rr.categoryId } });
    const policy = await tx.checkInPolicy.findUnique({ where: { propertyId: ctx.propertyId } });
    const start = opts.start ?? iso(rr.arrivalDate)!;
    const prefs = (rr.reservation.primaryGuest.preferences ?? {}) as any;
    return {
      reservationRoomId: rr.id,
      categoryId: rr.categoryId,
      categoryRank: category.rank,
      start,
      end: iso(rr.departureDate)!,
      occupants: rr.adults + rr.children,
      immediateCheckIn: start <= today(ctx.property),
      requireInspection: policy?.requireInspectedRoom ?? false,
      allowUpgrade: opts.allowUpgrade,
      preferences: { accessible: prefs.accessible, bedType: prefs.bedType, features: prefs.features, nearFloorLevel: opts.nearFloorLevel },
    };
  }

  /** Ranked recommendations with reasons for ineligible rooms. */
  async recommend(ctx: RequestContext, reservationRoomId: string, allowUpgrade = false) {
    const rr = await this.loadReservationRoom(ctx, reservationRoomId);
    const req = await this.buildRequest(ctx, rr, { allowUpgrade });
    const rooms = await this.candidates(ctx, req.start, req.end);
    const ranked = rankRooms(rooms, req);
    const roomInfo = await this.prisma.room.findMany({ where: { propertyId: ctx.propertyId }, select: { id: true, number: true, floor: { select: { name: true, nameAr: true } }, category: { select: { code: true, nameEn: true, nameAr: true } }, housekeepingStatus: true, maintenanceStatus: true } });
    const info = new Map(roomInfo.map((r) => [r.id, r]));
    return {
      request: req,
      rooms: ranked.map((r) => ({ ...r, room: info.get(r.roomId) })),
    };
  }

  /**
   * Assigns a physical room in a transaction. The room row is locked, eligibility re-validated,
   * and the PostgreSQL exclusion constraint guarantees no overlapping allocation even under races.
   */
  async assign(
    ctx: RequestContext,
    input: { reservationRoomId: string; roomId: string; allowUpgrade: boolean; reason?: string; source?: string },
    tx?: Tx,
  ) {
    const run = async (db: Tx) => {
      await db.$queryRaw`SELECT id FROM "Room" WHERE id = ${input.roomId} AND "propertyId" = ${ctx.propertyId} FOR UPDATE`;
      const rr = await this.loadReservationRoom(ctx, input.reservationRoomId, db);
      if (!['CONFIRMED', 'CHECKED_IN', 'PENDING', 'AWAITING_PAYMENT'].includes(rr.reservation.status) || !rr.active) {
        throw new AppError('RESERVATION_NOT_ASSIGNABLE', 409);
      }
      const activeStay = await db.stay.findUnique({ where: { reservationRoomId: rr.id } });
      if (activeStay) throw new AppError('USE_ROOM_MOVE_FOR_IN_HOUSE', 409);
      const req = await this.buildRequest(ctx, rr, { allowUpgrade: input.allowUpgrade }, db);
      const [candidate] = await this.candidates(ctx, req.start, req.end, db, [input.roomId]);
      if (!candidate) throw notFound('ROOM');
      const result = evaluateRoom(candidate, req);
      if (!result.eligible) throw conflict('ROOM_NOT_ELIGIBLE', { reasons: result.reasons });
      if (result.isUpgrade && !ctx.permissions.has('reservations.write')) throw new AppError('PERMISSION_DENIED', 403);
      const previous = await db.roomAssignment.findFirst({ where: { reservationRoomId: rr.id, status: 'PLANNED' } });
      if (previous) {
        if (previous.roomId === input.roomId) return previous;
        await db.roomAssignment.update({ where: { id: previous.id }, data: { status: 'CANCELLED', reason: input.reason ?? 'REASSIGNED' } });
      }
      const assignment = await db.roomAssignment.create({
        data: {
          propertyId: ctx.propertyId,
          reservationRoomId: rr.id,
          roomId: input.roomId,
          startDate: d(req.start),
          endDate: d(req.end),
          status: 'PLANNED',
          source: input.source ?? (result.isUpgrade ? 'UPGRADE' : 'MANUAL'),
          assignedById: ctx.userId,
          previousAssignmentId: previous?.id ?? null,
          reason: input.reason ?? null,
        },
      });
      await db.reservationHistory.create({ data: { reservationId: rr.reservationId, action: 'ROOM_ASSIGNED', actorId: ctx.userId, details: { roomId: input.roomId, number: candidate.number, upgrade: result.isUpgrade, previousRoomId: previous?.roomId ?? null } } });
      await this.audit.log(ctx, 'ROOM_ASSIGNED', 'RoomAssignment', assignment.id, { reservationRoomId: rr.id, roomId: input.roomId, upgrade: result.isUpgrade }, db);
      return assignment;
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 15_000 });
  }

  async unassign(ctx: RequestContext, assignmentId: string, reason: string) {
    const a = await this.prisma.roomAssignment.findFirst({ where: { id: assignmentId, propertyId: ctx.propertyId } });
    if (!a) throw notFound('ASSIGNMENT');
    if (a.status !== 'PLANNED') throw new AppError('ASSIGNMENT_NOT_PLANNED', 409);
    await this.prisma.roomAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED', reason } });
    await this.audit.log(ctx, 'ROOM_UNASSIGNED', 'RoomAssignment', a.id, { reason });
    return { ok: true };
  }

  /** Auto-assigns all unassigned rooms of a reservation, keeping group rooms on the same floor where possible. */
  async autoAssign(ctx: RequestContext, reservationId: string, keepTogether: boolean) {
    const lines = await this.prisma.reservationRoom.findMany({
      where: { reservationId, propertyId: ctx.propertyId, active: true, assignments: { none: { status: { in: ['PLANNED', 'ACTIVE'] } } } },
    });
    const results: { reservationRoomId: string; roomId?: string; number?: string; error?: string }[] = [];
    let anchorFloor: number | undefined;
    for (const line of lines) {
      try {
        const assigned = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'assign:' + ctx.propertyId}))`;
          const rr = await this.loadReservationRoom(ctx, line.id, tx);
          const req = await this.buildRequest(ctx, rr, { allowUpgrade: false, nearFloorLevel: keepTogether ? anchorFloor : undefined }, tx);
          const rooms = await this.candidates(ctx, req.start, req.end, tx);
          const best = rankRooms(rooms, req).find((r) => r.eligible);
          if (!best) throw new AppError('NO_ELIGIBLE_ROOM', 409);
          const a = await this.assign(ctx, { reservationRoomId: line.id, roomId: best.roomId, allowUpgrade: false, source: 'AUTO' }, tx);
          const room = rooms.find((r) => r.id === best.roomId)!;
          return { a, room };
        });
        anchorFloor ??= assigned.room.floorLevel;
        results.push({ reservationRoomId: line.id, roomId: assigned.room.id, number: assigned.room.number });
      } catch (e) {
        results.push({ reservationRoomId: line.id, error: e instanceof AppError ? e.code : 'ASSIGNMENT_FAILED' });
      }
    }
    return results;
  }

  /** Confirmed reservations arriving within the window that still have unassigned room lines. */
  async unassignedQueue(ctx: RequestContext, days = 3) {
    const from = today(ctx.property);
    const lines = await this.prisma.reservationRoom.findMany({
      where: {
        propertyId: ctx.propertyId,
        active: true,
        arrivalDate: { lte: d(addDays(from, days)) },
        departureDate: { gt: d(from) },
        reservation: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        assignments: { none: { status: { in: ['PLANNED', 'ACTIVE'] } } },
        stay: null,
      },
      include: { reservation: { select: { id: true, confirmationNo: true, groupName: true, specialRequests: true, primaryGuest: { select: { firstName: true, lastName: true, vip: true } } } } },
      orderBy: { arrivalDate: 'asc' },
    });
    const cats = await this.prisma.roomCategory.findMany({ where: { propertyId: ctx.propertyId }, select: { id: true, code: true, nameEn: true, nameAr: true } });
    const cm = new Map(cats.map((c) => [c.id, c]));
    return lines.map((l) => ({ id: l.id, arrival: iso(l.arrivalDate), departure: iso(l.departureDate), adults: l.adults, children: l.children, category: cm.get(l.categoryId), reservation: l.reservation }));
  }
}

